import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { arqueos, cuentasTesoreria, movimientosTesoreria } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { aImporte, monto } from '../../lib/dinero'
import { decimal, primerError } from '../comercial/documentos'
import { saldoCuenta } from './cuentas'

/**
 * Movimientos de tesorería que no son cobranzas ni pagos a proveedores:
 * gastos e ingresos varios, transferencias entre cuentas, acreditación de
 * cupones de tarjeta y arqueos. Se anulan, no se borran.
 */

const texto = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)

const positivo = (mensaje: string) => decimal(mensaje).refine((v) => Number(v) > 0, { error: mensaje })

const EsquemaMovimiento = z.object({
  cuentaId: z.uuid({ error: 'Elegí la cuenta.' }),
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  sentido: z.enum(['ingreso', 'egreso']),
  importe: positivo('Escribí el importe.'),
  concepto: z.string().trim().min(2, { error: 'Escribí el concepto (para qué fue).' }),
  detalle: texto,
  comprobante: texto,
})

type Resultado = { ok: true; id: string } | { ok: false; error: string }

async function cuenta(tx: Transaccion, id: string) {
  const [c] = await tx.select().from(cuentasTesoreria).where(eq(cuentasTesoreria.id, id))
  return c
}

/** Gasto o ingreso varios en una cuenta. */
export async function registrarMovimiento(tx: Transaccion, usuarioId: string, entrada: unknown): Promise<Resultado> {
  const p = EsquemaMovimiento.safeParse(entrada)
  if (!p.success) return { ok: false, error: primerError(p.error) }
  const d = p.data
  const c = await cuenta(tx, d.cuentaId)
  if (!c || !c.activa) return { ok: false, error: 'Esa cuenta no existe o está inactiva.' }
  const [m] = await tx
    .insert(movimientosTesoreria)
    .values({
      cuentaId: d.cuentaId,
      fecha: d.fecha,
      importe: aImporte(d.sentido === 'egreso' ? monto(d.importe).negated() : d.importe),
      tipo: d.sentido,
      concepto: d.concepto,
      detalle: d.detalle,
      comprobante: d.comprobante,
      usuarioId,
    })
    .returning()
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'movimiento_tesoreria', entidadId: m.id, despues: d })
  return { ok: true, id: m.id }
}

const EsquemaTransferencia = z.object({
  origenId: z.uuid({ error: 'Elegí la cuenta de origen.' }),
  destinoId: z.uuid({ error: 'Elegí la cuenta de destino.' }),
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  importe: positivo('Escribí el importe que sale.'),
  /** Lo que entra, si las cuentas son de distinta moneda (o hay comisión de por medio). */
  importeDestino: decimal('Importe de destino inválido.').nullable().optional(),
  detalle: texto,
  comprobante: texto,
})

/**
 * Pasa fondos de una cuenta a otra (depósito de efectivo, extracción, pago
 * del resumen de la tarjeta, retiro de Mercado Pago, compra de dólares…).
 */
export async function transferir(tx: Transaccion, usuarioId: string, entrada: unknown): Promise<Resultado> {
  const p = EsquemaTransferencia.safeParse(entrada)
  if (!p.success) return { ok: false, error: primerError(p.error) }
  const d = p.data
  if (d.origenId === d.destinoId) return { ok: false, error: 'La cuenta de origen y la de destino son la misma.' }
  const [o, de] = [await cuenta(tx, d.origenId), await cuenta(tx, d.destinoId)]
  if (!o || !de) return { ok: false, error: 'Una de las cuentas ya no existe.' }
  if (o.moneda !== de.moneda && !(d.importeDestino && monto(d.importeDestino).gt(0))) {
    return { ok: false, error: 'Las cuentas son de distinta moneda: escribí cuánto entra en la de destino.' }
  }
  const entra = d.importeDestino && monto(d.importeDestino).gt(0) ? d.importeDestino : d.importe
  const transferenciaId = randomUUID()
  const comun = {
    fecha: d.fecha,
    tipo: 'transferencia',
    detalle: d.detalle,
    comprobante: d.comprobante,
    transferenciaId,
    usuarioId,
  }
  const [salida] = await tx
    .insert(movimientosTesoreria)
    .values([
      { ...comun, cuentaId: o.id, importe: aImporte(monto(d.importe).negated()), concepto: `A ${de.nombre}` },
      { ...comun, cuentaId: de.id, importe: aImporte(entra), concepto: `De ${o.nombre}` },
    ])
    .returning()
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'transferencia_tesoreria', entidadId: transferenciaId, despues: d })
  return { ok: true, id: salida.id }
}

const EsquemaAcreditacion = z.object({
  cuponesId: z.uuid({ error: 'Elegí la cuenta de cupones.' }),
  bancoId: z.uuid({ error: 'Elegí el banco donde se acreditó.' }),
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  /** Lo que se cancela de cupones (bruto). */
  bruto: positivo('Escribí el importe de los cupones.'),
  /** Lo que llegó al banco. La diferencia son comisiones e impuestos. */
  neto: positivo('Escribí lo que se acreditó en el banco.'),
  detalle: texto,
})

/** La tarjeta o Mercado Pago acreditan los cupones en el banco, descontando comisiones. */
export async function acreditarCupones(tx: Transaccion, usuarioId: string, entrada: unknown): Promise<Resultado> {
  const p = EsquemaAcreditacion.safeParse(entrada)
  if (!p.success) return { ok: false, error: primerError(p.error) }
  const d = p.data
  if (monto(d.neto).gt(d.bruto)) return { ok: false, error: 'Lo acreditado no puede ser más que los cupones.' }
  const [cup, banco] = [await cuenta(tx, d.cuponesId), await cuenta(tx, d.bancoId)]
  if (!cup || !banco) return { ok: false, error: 'Una de las cuentas ya no existe.' }
  const transferenciaId = randomUUID()
  const comun = { fecha: d.fecha, detalle: d.detalle, transferenciaId, usuarioId }
  const comision = monto(d.bruto).minus(d.neto)
  const filas = [
    {
      ...comun,
      cuentaId: cup.id,
      tipo: 'acreditacion',
      importe: aImporte(monto(d.bruto).negated()),
      concepto: `Acreditado en ${banco.nombre}`,
    },
    { ...comun, cuentaId: banco.id, tipo: 'acreditacion', importe: aImporte(d.neto), concepto: `Acreditación de ${cup.nombre}` },
  ]
  // La comisión no pasa por el banco: es la diferencia que se queda la tarjeta.
  if (comision.gt(0)) {
    filas[0].importe = aImporte(monto(d.neto).negated())
    filas.push({
      ...comun,
      cuentaId: cup.id,
      tipo: 'comision',
      importe: aImporte(comision.negated()),
      concepto: 'Comisiones y retenciones de la tarjeta',
    })
  }
  const [m] = await tx.insert(movimientosTesoreria).values(filas).returning()
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'acreditacion_cupones', entidadId: transferenciaId, despues: d })
  return { ok: true, id: m.id }
}

/** Anula un movimiento (y su contrapartida si fue una transferencia o acreditación). */
export async function anularMovimiento(tx: Transaccion, usuarioId: string, id: string) {
  const [m] = await tx.select().from(movimientosTesoreria).where(eq(movimientosTesoreria.id, id))
  if (!m) return { ok: false as const, error: 'Ese movimiento ya no existe.' }
  if (m.estado === 'anulado') return { ok: false as const, error: 'El movimiento ya está anulado.' }
  if (m.tipo === 'deposito_cheque' || m.tipo === 'rechazo_cheque') {
    return { ok: false as const, error: 'Los depósitos y rechazos de cheques se anulan desde el cheque.' }
  }
  const grupo = m.transferenciaId
    ? await tx
        .select()
        .from(movimientosTesoreria)
        .where(and(eq(movimientosTesoreria.transferenciaId, m.transferenciaId), eq(movimientosTesoreria.estado, 'vigente')))
    : [m]
  for (const g of grupo) {
    await tx
      .update(movimientosTesoreria)
      .set({ estado: 'anulado', anulado: new Date(), anuladoPor: usuarioId })
      .where(eq(movimientosTesoreria.id, g.id))
  }
  await auditar(tx, { usuarioId, accion: 'anulacion', entidad: 'movimiento_tesoreria', entidadId: id })
  return { ok: true as const }
}

const EsquemaArqueo = z.object({
  cuentaId: z.uuid({ error: 'Elegí la caja.' }),
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  contado: decimal('Escribí lo que se contó.'),
  observaciones: texto,
})

/**
 * Arqueo: se cuenta lo que hay y se compara con el saldo del sistema a esa
 * fecha. Si no coincide queda un ajuste por la diferencia (con constancia).
 */
export async function arquear(tx: Transaccion, usuarioId: string, entrada: unknown) {
  const p = EsquemaArqueo.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const d = p.data
  const c = await cuenta(tx, d.cuentaId)
  if (!c) return { ok: false as const, error: 'Esa cuenta ya no existe.' }
  const saldoSistema = await saldoCuenta(tx, d.cuentaId, d.fecha)
  const diferencia = monto(d.contado).minus(saldoSistema)
  let movimientoAjusteId: string | null = null
  if (!diferencia.isZero()) {
    const [m] = await tx
      .insert(movimientosTesoreria)
      .values({
        cuentaId: d.cuentaId,
        fecha: d.fecha,
        importe: aImporte(diferencia),
        tipo: 'ajuste_arqueo',
        concepto: diferencia.gt(0) ? 'Sobrante de arqueo' : 'Faltante de arqueo',
        detalle: d.observaciones,
        usuarioId,
      })
      .returning()
    movimientoAjusteId = m.id
  }
  const [a] = await tx
    .insert(arqueos)
    .values({
      cuentaId: d.cuentaId,
      fecha: d.fecha,
      saldoSistema,
      contado: aImporte(d.contado),
      diferencia: aImporte(diferencia),
      movimientoAjusteId,
      observaciones: d.observaciones,
      usuarioId,
    })
    .returning()
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'arqueo', entidadId: a.id, despues: { ...d, saldoSistema } })
  return { ok: true as const, id: a.id, saldoSistema, diferencia: aImporte(diferencia) }
}

/** Saldo inicial de una cuenta (al empezar a usar el ERP): el del extracto o el arqueo. */
export async function cargarSaldoInicial(tx: Transaccion, usuarioId: string, cuentaId: string, fecha: string, importe: string) {
  const [ya] = await tx
    .select()
    .from(movimientosTesoreria)
    .where(
      and(
        eq(movimientosTesoreria.cuentaId, cuentaId),
        eq(movimientosTesoreria.tipo, 'saldo_inicial'),
        eq(movimientosTesoreria.estado, 'vigente'),
      ),
    )
  if (ya) return { ok: false as const, error: 'La cuenta ya tiene saldo inicial: anulalo primero para cargar otro.' }
  if (monto(importe).isZero()) return { ok: true as const }
  const [m] = await tx
    .insert(movimientosTesoreria)
    .values({ cuentaId, fecha, importe: aImporte(importe), tipo: 'saldo_inicial', concepto: 'Saldo inicial', usuarioId })
    .returning()
  await auditar(tx, {
    usuarioId,
    accion: 'alta',
    entidad: 'movimiento_tesoreria',
    entidadId: m.id,
    despues: { saldoInicial: importe },
  })
  return { ok: true as const, id: m.id }
}
