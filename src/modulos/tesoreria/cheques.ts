import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'
import * as z from 'zod'

import { controlarBloqueo } from '../empresa/bloqueos'
import type { Transaccion } from '../../db/conexion'
import { chequesRechazados, compras, comprobantes, cuentasTesoreria, movimientosTesoreria, terceros } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { aImporte, D, monto } from '../../lib/dinero'
import { decimal, primerError } from '../comercial/documentos'
import { siguienteNumero } from '../comercial/numeracion'
import { filasDe } from '../compras/compras'
import { TIPO_DEBITO_INTERNO } from '../facturacion/tipos'
import { cajaCerrada } from './cuentas'
import type { EstadoCheque } from './medios'

/**
 * Cheques y ECHEQ de terceros. Entran con los recibos y su estado sale de lo
 * que se hizo con ellos (no se guarda):
 * - en cartera: nadie los usó;
 * - entregado: se usaron en un pago emitido;
 * - depositado: hay un depósito vigente en un banco;
 * - canjeado: se cambió por fondos (a una financiera, a otro comercio);
 * - rechazado: el banco lo rechazó (la deuda vuelve al cliente);
 * - anulado: se anuló el recibo por el que entraron.
 */

export type Cheque = {
  id: string
  medio: string
  importe: string
  banco: string | null
  numeroValor: string | null
  fechaPago: string | null
  cuitLibrador: string | null
  reciboId: string
  reciboNumero: number
  fechaRecibo: string
  cliente: string
  clienteId: string
  estado: EstadoCheque
  /** Dónde está: cuenta del depósito o proveedor al que se entregó. */
  destino: string | null
  destinoId: string | null
  depositoCuentaId: string | null
}

export async function listarCheques(tx: Transaccion, filtro: { estado?: EstadoCheque; q?: string; ids?: string[] } = {}) {
  const q = filtro.q?.trim()
  const filas = filasDe<Cheque>(
    await tx.execute(sql`
      select * from (
        select rv.id, rv.medio, rv.importe, rv.banco, rv.numero_valor as "numeroValor", rv.fecha_pago as "fechaPago",
          rv.cuit_librador as "cuitLibrador", r.id as "reciboId", r.numero as "reciboNumero", r.fecha as "fechaRecibo",
          t.razon_social as cliente, t.id as "clienteId",
          dep.cuenta_id as "depositoCuentaId",
          case
            when r.estado = 'anulado' then 'anulado'
            when cr.id is not null then 'rechazado'
            when dep.tipo = 'canje_cheque' then 'canjeado'
            when dep.id is not null then 'depositado'
            when pg.id is not null then 'entregado'
            else 'cartera'
          end as estado,
          coalesce(cu.nombre, prov.razon_social) as destino,
          coalesce(dep.id, pg.id) as "destinoId"
        from recibos_valores rv
        join recibos r on r.id = rv.recibo_id
        join terceros t on t.id = r.tercero_id
        left join cheques_rechazados cr on cr.cheque_id = rv.id
        left join lateral (
          select m.id, m.cuenta_id, m.tipo from movimientos_tesoreria m
          where m.cheque_id = rv.id and m.tipo in ('deposito_cheque', 'canje_cheque') and m.estado = 'vigente' limit 1
        ) dep on true
        left join cuentas_tesoreria cu on cu.id = dep.cuenta_id
        left join lateral (
          select p.id, p.tercero_id from pagos_valores pv join pagos p on p.id = pv.pago_id
          where pv.recibo_valor_id = rv.id and p.estado = 'emitido' limit 1
        ) pg on true
        left join terceros prov on prov.id = pg.tercero_id
        where rv.medio in ('cheque', 'echeq')
      ) c
      where (${filtro.estado ?? null}::text is null or c.estado = ${filtro.estado ?? null}::text)
        ${filtro.ids ? sql`and c.id in ${filtro.ids.length ? filtro.ids : ['00000000-0000-0000-0000-000000000000']}` : sql``}
        ${q ? sql`and (c.cliente ilike ${'%' + q + '%'} or c."numeroValor" ilike ${'%' + q + '%'} or c.banco ilike ${'%' + q + '%'})` : sql``}
      order by c."fechaPago" nulls last, c.importe
      limit 500
    `),
  )
  return filas
}

const EsquemaDeposito = z.object({
  cuentaId: z.uuid({ error: 'Elegí el banco.' }),
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  cheques: z.array(z.uuid()).min(1, { error: 'Elegí los cheques que se depositan.' }),
  comprobante: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
})

/** Deposita cheques de la cartera en un banco: uno o varios en la misma boleta. */
export async function depositarCheques(tx: Transaccion, usuarioId: string, entrada: unknown) {
  const p = EsquemaDeposito.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const d = p.data
  const cerrado = await controlarBloqueo(tx, 'tesoreria', d.fecha)
  if (cerrado) return { ok: false as const, error: cerrado }
  const [cuenta] = await tx.select().from(cuentasTesoreria).where(eq(cuentasTesoreria.id, d.cuentaId))
  if (!cuenta || cuenta.tipo !== 'banco') return { ok: false as const, error: 'Los cheques se depositan en una cuenta bancaria.' }
  if (cuenta.moneda !== 'PES') return { ok: false as const, error: 'Los cheques son en pesos: elegí una cuenta en pesos.' }
  const cheques = await listarCheques(tx, { ids: d.cheques })
  if (cheques.length !== d.cheques.length || cheques.some((c) => c.estado !== 'cartera')) {
    return { ok: false as const, error: 'Alguno de los cheques ya no está en cartera.' }
  }
  await tx.insert(movimientosTesoreria).values(
    cheques.map((c) => ({
      cuentaId: d.cuentaId,
      fecha: d.fecha,
      importe: aImporte(c.importe),
      tipo: 'deposito_cheque',
      concepto: 'Depósito de cheque',
      detalle: `${c.medio === 'echeq' ? 'ECHEQ' : 'Cheque'} ${c.banco ?? ''} N° ${c.numeroValor ?? ''} de ${c.cliente}`.replace(
        /\s+/g,
        ' ',
      ),
      comprobante: d.comprobante,
      chequeId: c.id,
      usuarioId,
    })),
  )
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'deposito_cheques', despues: d })
  return { ok: true as const, cantidad: cheques.length, total: aImporte(cheques.reduce((s, c) => s.plus(c.importe), new D(0))) }
}

/**
 * Anula el depósito de un cheque (se cargó en el banco equivocado): vuelve a
 * la cartera. Si fue un canje, se anula el canje entero (todos sus cheques y
 * el costo).
 */
export async function anularDeposito(tx: Transaccion, usuarioId: string, chequeId: string) {
  const [c] = await listarCheques(tx, { ids: [chequeId] })
  if (!c || (c.estado !== 'depositado' && c.estado !== 'canjeado'))
    return { ok: false as const, error: 'El cheque no está depositado ni canjeado.' }
  const [m] = await tx.select().from(movimientosTesoreria).where(eq(movimientosTesoreria.id, c.destinoId!))
  const cerrado = await controlarBloqueo(tx, 'tesoreria', m.fecha)
  if (cerrado) return { ok: false as const, error: cerrado }
  await tx
    .update(movimientosTesoreria)
    .set({ estado: 'anulado', anulado: new Date(), anuladoPor: usuarioId })
    .where(
      c.estado === 'canjeado' && m.transferenciaId
        ? and(eq(movimientosTesoreria.transferenciaId, m.transferenciaId), eq(movimientosTesoreria.estado, 'vigente'))
        : eq(movimientosTesoreria.id, m.id),
    )
  await auditar(tx, { usuarioId, accion: 'anulacion', entidad: 'deposito_cheque', entidadId: chequeId })
  return { ok: true as const }
}

const EsquemaRechazo = z.object({
  chequeId: z.uuid(),
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  motivo: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
  /** Gastos que cobró el banco por el rechazo: se le debitan al cliente. */
  gastos: decimal('Gastos inválidos.').default('0'),
})

/**
 * Cheque rechazado. Lo que pasa depende de dónde estaba:
 * - depositado: el banco lo debita (y sus gastos);
 * - entregado a un proveedor: el proveedor lo devuelve y la deuda con él vuelve
 *   (nota de débito interna del proveedor);
 * - en cartera: se rechazó al presentarlo por ventanilla.
 * En todos los casos vuelve la deuda del cliente con una nota de débito
 * interna por el cheque más los gastos.
 */
export async function rechazarCheque(tx: Transaccion, usuarioId: string, entrada: unknown) {
  const p = EsquemaRechazo.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const d = p.data
  const cerrado = await controlarBloqueo(tx, 'tesoreria', d.fecha)
  if (cerrado) return { ok: false as const, error: cerrado }
  const [c] = await listarCheques(tx, { ids: [d.chequeId] })
  if (!c) return { ok: false as const, error: 'Ese cheque ya no existe.' }
  if (c.estado === 'rechazado' || c.estado === 'anulado')
    return { ok: false as const, error: 'El cheque ya está rechazado o anulado.' }
  const gastos = monto(d.gastos)
  const descripcion = `${c.medio === 'echeq' ? 'ECHEQ' : 'Cheque'} ${c.banco ?? ''} N° ${c.numeroValor ?? ''} rechazado`.replace(
    /\s+/g,
    ' ',
  )

  // Depositado o canjeado: el banco (o quien lo cambió) lo devuelve y debita la cuenta.
  if (c.estado === 'depositado' || c.estado === 'canjeado') {
    await tx.insert(movimientosTesoreria).values({
      cuentaId: c.depositoCuentaId!,
      fecha: d.fecha,
      importe: aImporte(monto(c.importe).negated()),
      tipo: 'rechazo_cheque',
      concepto: 'Cheque rechazado',
      detalle: `${descripcion} · ${c.cliente}`,
      chequeId: c.id,
      usuarioId,
    })
    if (gastos.gt(0)) {
      await tx.insert(movimientosTesoreria).values({
        cuentaId: c.depositoCuentaId!,
        fecha: d.fecha,
        importe: aImporte(gastos.negated()),
        tipo: 'comision',
        concepto: 'Gastos por cheque rechazado',
        detalle: descripcion,
        usuarioId,
      })
    }
  }

  let notaDebitoProveedorId: string | null = null
  if (c.estado === 'entregado') {
    const [pago] = filasDe<{ terceroId: string }>(
      await tx.execute(sql`select tercero_id as "terceroId" from pagos where id = ${c.destinoId}`),
    )
    const [nd] = await tx
      .insert(compras)
      .values({
        clase: 'nota_debito',
        letra: 'X',
        tipo: TIPO_DEBITO_INTERNO,
        puntoVenta: 0,
        numero: await siguienteNumero(tx, 'debito_interno_proveedor'),
        fecha: d.fecha,
        periodoIva: d.fecha.slice(0, 7),
        terceroId: pago.terceroId,
        noGravado: aImporte(c.importe),
        total: aImporte(c.importe),
        observaciones: `${descripcion}: lo devuelve el proveedor y la deuda vuelve.`,
        usuarioId,
      })
      .returning()
    notaDebitoProveedorId = nd.id
  }

  const [cliente] = await tx.select().from(terceros).where(eq(terceros.id, c.clienteId))
  const total = monto(c.importe).plus(gastos)
  const [ndCliente] = await tx
    .insert(comprobantes)
    .values({
      clase: 'nota_debito',
      letra: 'X',
      tipo: TIPO_DEBITO_INTERNO,
      puntoVenta: 0,
      numero: await siguienteNumero(tx, 'debito_interno_cliente'),
      fecha: d.fecha,
      estado: 'autorizado',
      origen: 'interno',
      terceroId: c.clienteId,
      receptorNombre: cliente.razonSocial,
      receptorDocTipo: cliente.tipoDocumento,
      receptorDocNumero: cliente.numeroDocumento,
      receptorCondicionIva: cliente.condicionIva,
      noGravado: aImporte(total),
      total: aImporte(total),
      observaciones: `${descripcion}${d.motivo ? ` (${d.motivo})` : ''}${gastos.gt(0) ? ` y gastos por ${aImporte(gastos)}` : ''}.`,
      usuarioId,
      autorizado: new Date(),
    })
    .returning()

  const [r] = await tx
    .insert(chequesRechazados)
    .values({
      chequeId: c.id,
      fecha: d.fecha,
      motivo: d.motivo,
      gastos: aImporte(gastos),
      notaDebitoClienteId: ndCliente.id,
      notaDebitoProveedorId,
      usuarioId,
    })
    .returning()
  await auditar(tx, {
    usuarioId,
    accion: 'alta',
    entidad: 'cheque_rechazado',
    entidadId: r.id,
    despues: { ...d, estadoAnterior: c.estado },
  })
  return { ok: true as const, notaDebitoClienteId: ndCliente.id, notaDebitoProveedorId }
}

const EsquemaCanje = z.object({
  cuentaId: z.uuid({ error: 'Elegí dónde entra la plata.' }),
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  cheques: z.array(z.uuid()).min(1, { error: 'Elegí los cheques que se canjean.' }),
  /** Lo que se recibió. La diferencia con los cheques es el costo del canje (descuento, comisión). */
  neto: decimal('Escribí lo que se recibió.'),
  /** A quién se le entregaron (financiera, mutual, otro comercio). */
  entidad: z.string().trim().min(2, { error: 'Escribí a quién se le entregaron los cheques.' }),
  comprobante: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
})

/**
 * Canje de valores: cheques de la cartera que se cambian por efectivo o una
 * transferencia (a una financiera, a otro comercio). Entra el importe de
 * cada cheque y sale el costo del canje, así la cuenta queda con lo recibido.
 */
export async function canjearCheques(tx: Transaccion, usuarioId: string, entrada: unknown) {
  const p = EsquemaCanje.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const d = p.data
  const cerrado = await controlarBloqueo(tx, 'tesoreria', d.fecha)
  if (cerrado) return { ok: false as const, error: cerrado }
  const [cuenta] = await tx.select().from(cuentasTesoreria).where(eq(cuentasTesoreria.id, d.cuentaId))
  if (!cuenta || !cuenta.activa) return { ok: false as const, error: 'Esa cuenta no existe o está inactiva.' }
  if (cuenta.moneda !== 'PES') return { ok: false as const, error: 'Los cheques son en pesos: elegí una cuenta en pesos.' }
  const cerrada = await cajaCerrada(tx, cuenta)
  if (cerrada) return { ok: false as const, error: cerrada }
  const cheques = await listarCheques(tx, { ids: d.cheques })
  if (cheques.length !== d.cheques.length || cheques.some((c) => c.estado !== 'cartera')) {
    return { ok: false as const, error: 'Alguno de los cheques ya no está en cartera.' }
  }
  const bruto = cheques.reduce((s, c) => s.plus(c.importe), new D(0))
  const costo = bruto.minus(d.neto)
  if (monto(d.neto).lte(0)) return { ok: false as const, error: 'Escribí lo que se recibió.' }
  if (costo.lt(0)) return { ok: false as const, error: 'Lo recibido no puede ser más que los cheques.' }
  const grupo = randomUUID()
  await tx.insert(movimientosTesoreria).values(
    cheques.map((c) => ({
      cuentaId: d.cuentaId,
      fecha: d.fecha,
      importe: aImporte(c.importe),
      tipo: 'canje_cheque',
      concepto: `Canje con ${d.entidad}`,
      detalle: `${c.medio === 'echeq' ? 'ECHEQ' : 'Cheque'} ${c.banco ?? ''} N° ${c.numeroValor ?? ''} de ${c.cliente}`.replace(
        /\s+/g,
        ' ',
      ),
      comprobante: d.comprobante,
      chequeId: c.id,
      transferenciaId: grupo,
      usuarioId,
    })),
  )
  if (costo.gt(0)) {
    await tx.insert(movimientosTesoreria).values({
      cuentaId: d.cuentaId,
      fecha: d.fecha,
      importe: aImporte(costo.negated()),
      tipo: 'comision',
      concepto: 'Costo del canje de cheques',
      detalle: `Canje con ${d.entidad} (${cheques.length} ${cheques.length === 1 ? 'cheque' : 'cheques'})`,
      comprobante: d.comprobante,
      transferenciaId: grupo,
      usuarioId,
    })
  }
  await auditar(tx, {
    usuarioId,
    accion: 'alta',
    entidad: 'canje_cheques',
    entidadId: grupo,
    despues: { ...d, bruto: aImporte(bruto) },
  })
  return { ok: true as const, bruto: aImporte(bruto), costo: aImporte(costo) }
}
