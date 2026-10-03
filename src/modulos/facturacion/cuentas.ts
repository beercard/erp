import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import * as z from 'zod'

import { controlarBloqueo } from '../empresa/bloqueos'
import { turnoDelRecibo } from '../tesoreria/cierres'
import type { Transaccion } from '../../db/conexion'
import { comprobantes, imputaciones, recibos, recibosValores, terceros } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { aImporte, D, monto } from '../../lib/dinero'
import { decimal, primerError } from '../comercial/documentos'
import { siguienteNumero } from '../comercial/numeracion'
import { resolverCuenta } from '../tesoreria/cuentas'
import { MEDIOS_COBRO_CON_CUENTA } from '../tesoreria/medios'
import { MEDIOS } from './medios'

/**
 * Cuentas corrientes y cobranzas. Nada guarda un saldo: la deuda de cada
 * comprobante es su total en pesos menos lo imputado (recibos emitidos y
 * notas de crédito), y el saldo del cliente es la suma de movimientos.
 */

/** Importe en pesos (la cuenta corriente se lleva en pesos). */
export const enPesos = (c: { total: string; cotizacion: string }) => aImporte(monto(c.total).times(c.cotizacion))

/** Importe en pesos de un comprobante, en SQL (mismo redondeo que enPesos). */
const totalPesos = sql<string>`round(comprobantes.total * comprobantes.cotizacion, 2)`

/** Lo imputado a cada comprobante, sin contar recibos anulados. */
const imputado = sql<string>`coalesce((
  select sum(i.importe) from imputaciones i
  left join recibos r on r.id = i.recibo_id
  where i.comprobante_id = comprobantes.id and (i.recibo_id is null or r.estado = 'emitido')
), 0)`

/** Facturas y notas de débito autorizadas con saldo, de un cliente o por id. */
export async function pendientes(tx: Transaccion, filtro: { terceroId?: string; ids?: string[] }) {
  const filas = await tx
    .select({
      id: comprobantes.id,
      tipo: comprobantes.tipo,
      puntoVenta: comprobantes.puntoVenta,
      numero: comprobantes.numero,
      fecha: comprobantes.fecha,
      vencimiento: comprobantes.vencimiento,
      terceroId: comprobantes.terceroId,
      total: totalPesos,
      imputado,
    })
    .from(comprobantes)
    .where(
      and(
        eq(comprobantes.estado, 'autorizado'),
        inArray(comprobantes.clase, ['factura', 'nota_debito']),
        filtro.terceroId ? eq(comprobantes.terceroId, filtro.terceroId) : undefined,
        filtro.ids
          ? inArray(comprobantes.id, filtro.ids.length ? filtro.ids : ['00000000-0000-0000-0000-000000000000'])
          : undefined,
      ),
    )
    .orderBy(asc(comprobantes.fecha), asc(comprobantes.numero))
  return filas
    .map((f) => ({ ...f, saldo: aImporte(monto(f.total).minus(f.imputado)) }))
    .filter((f) => filtro.ids || monto(f.saldo).gt(0))
}

/** Disponible para imputar de un recibo o una nota de crédito. */
async function disponible(tx: Transaccion, origen: { reciboId?: string; notaCreditoId?: string }) {
  if (origen.reciboId) {
    const [r] = await tx.select().from(recibos).where(eq(recibos.id, origen.reciboId))
    if (!r || r.estado !== 'emitido') return null
    const [u] = await tx
      .select({ total: sql<string>`coalesce(sum(${imputaciones.importe}), 0)` })
      .from(imputaciones)
      .where(eq(imputaciones.reciboId, r.id))
    return { terceroId: r.terceroId, disponible: monto(r.total).minus(u.total) }
  }
  const [nc] = await tx.select().from(comprobantes).where(eq(comprobantes.id, origen.notaCreditoId!))
  if (!nc || nc.estado !== 'autorizado' || nc.clase !== 'nota_credito') return null
  const [u] = await tx
    .select({ total: sql<string>`coalesce(sum(${imputaciones.importe}), 0)` })
    .from(imputaciones)
    .where(eq(imputaciones.notaCreditoId, nc.id))
  return { terceroId: nc.terceroId, disponible: monto(enPesos(nc)).minus(u.total) }
}

/**
 * Aplica un recibo o una nota de crédito a comprobantes con deuda. Valida que
 * sean del mismo cliente y que no se impute de más.
 */
export async function imputar(
  tx: Transaccion,
  usuarioId: string | null,
  origen: { reciboId?: string; notaCreditoId?: string },
  destinos: { comprobanteId: string; importe: string }[],
  fecha: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const validos = destinos.filter((d) => monto(d.importe).gt(0))
  if (!validos.length) return { ok: true }
  const o = await disponible(tx, origen)
  if (!o) return { ok: false, error: 'No hay nada para imputar.' }
  const total = validos.reduce((s, d) => s.plus(d.importe), new D(0))
  if (total.gt(o.disponible)) {
    return { ok: false, error: `Se imputan $ ${aImporte(total)} y hay disponibles $ ${aImporte(o.disponible)}.` }
  }
  const deuda = new Map((await pendientes(tx, { ids: validos.map((d) => d.comprobanteId) })).map((p) => [p.id, p]))
  for (const d of validos) {
    const p = deuda.get(d.comprobanteId)
    if (!p || p.terceroId !== o.terceroId)
      return { ok: false, error: 'Uno de los comprobantes no es de este cliente o no tiene deuda.' }
    if (monto(d.importe).gt(p.saldo)) {
      return {
        ok: false,
        error: `Al comprobante ${p.numero} le quedan $ ${p.saldo}: no se le puede imputar $ ${aImporte(d.importe)}.`,
      }
    }
  }
  await tx.insert(imputaciones).values(
    validos.map((d) => ({
      reciboId: origen.reciboId ?? null,
      notaCreditoId: origen.notaCreditoId ?? null,
      comprobanteId: d.comprobanteId,
      importe: aImporte(d.importe),
      fecha,
    })),
  )
  await auditar(tx, {
    usuarioId,
    accion: 'alta',
    entidad: 'imputacion',
    entidadId: origen.reciboId ?? origen.notaCreditoId,
    despues: validos,
  })
  return { ok: true }
}

/** Al autorizar una nota de crédito, se aplica sola al comprobante que corrige. */
export async function imputarNotaCreditoAsociada(
  tx: Transaccion,
  usuarioId: string | null,
  notaCreditoId: string,
  asociadoId: string,
  fecha: string,
) {
  const o = await disponible(tx, { notaCreditoId })
  const [p] = await pendientes(tx, { ids: [asociadoId] })
  if (!o || !p) return
  const importe = D.min(o.disponible, monto(p.saldo))
  if (importe.lte(0)) return
  await imputar(tx, usuarioId, { notaCreditoId }, [{ comprobanteId: asociadoId, importe: aImporte(importe) }], fecha)
}

// ------------------------------------------------------- Cuenta corriente

export type Movimiento = {
  id: string
  fecha: string
  tipo: 'comprobante' | 'recibo'
  comprobanteTipo: number | null
  puntoVenta: number
  numero: number | null
  debe: string
  haber: string
  saldo: string
}

/** Movimientos del cliente en pesos, con saldo acumulado (positivo: el cliente debe). */
export async function cuentaCorriente(tx: Transaccion, terceroId: string) {
  const comps = await tx
    .select({
      id: comprobantes.id,
      fecha: comprobantes.fecha,
      clase: comprobantes.clase,
      tipo: comprobantes.tipo,
      puntoVenta: comprobantes.puntoVenta,
      numero: comprobantes.numero,
      total: totalPesos,
      creado: comprobantes.creado,
    })
    .from(comprobantes)
    .where(and(eq(comprobantes.terceroId, terceroId), eq(comprobantes.estado, 'autorizado')))
  const recs = await tx
    .select()
    .from(recibos)
    .where(and(eq(recibos.terceroId, terceroId), eq(recibos.estado, 'emitido')))
  const filas = [
    ...comps.map((c) => ({
      id: c.id,
      fecha: c.fecha,
      creado: c.creado,
      tipo: 'comprobante' as const,
      comprobanteTipo: c.tipo,
      puntoVenta: c.puntoVenta,
      numero: c.numero,
      debe: c.clase === 'nota_credito' ? '0.00' : aImporte(c.total),
      haber: c.clase === 'nota_credito' ? aImporte(c.total) : '0.00',
    })),
    ...recs.map((r) => ({
      id: r.id,
      fecha: r.fecha,
      creado: r.creado,
      tipo: 'recibo' as const,
      comprobanteTipo: null,
      puntoVenta: r.puntoVenta,
      numero: r.numero,
      debe: '0.00',
      haber: aImporte(r.total),
    })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creado.getTime() - b.creado.getTime())
  let saldo = new D(0)
  const movimientos: Movimiento[] = filas.map((f) => {
    saldo = saldo.plus(f.debe).minus(f.haber)
    return { ...f, saldo: aImporte(saldo) }
  })
  const deuda = await pendientes(tx, { terceroId })
  const saldoDeuda = deuda.reduce((s, p) => s.plus(p.saldo), new D(0))
  return {
    movimientos,
    saldo: aImporte(saldo),
    pendientes: deuda,
    // Lo pagado o acreditado que no se aplicó a ningún comprobante.
    aCuenta: aImporte(saldoDeuda.minus(saldo)),
  }
}

/** Saldo de cada cliente con movimientos, para el listado de deudores. */
export async function saldosPorCliente(tx: Transaccion) {
  const filas = await tx.execute(sql`
    select t.id, t.codigo, t.razon_social as "razonSocial",
      coalesce(sum(m.importe), 0)::text as saldo
    from terceros t
    join (
      select tercero_id, case when clase = 'nota_credito' then -1 else 1 end * round(total * cotizacion, 2) as importe
      from comprobantes where estado = 'autorizado'
      union all
      select tercero_id, -total from recibos where estado = 'emitido'
    ) m on m.tercero_id = t.id
    group by t.id, t.codigo, t.razon_social
    having coalesce(sum(m.importe), 0) <> 0
    order by sum(m.importe) desc
  `)
  const lista = (Array.isArray(filas) ? filas : (filas as { rows: unknown[] }).rows) as {
    id: string
    codigo: string
    razonSocial: string
    saldo: string
  }[]
  return lista
}

// --------------------------------------------------------------- Cobranzas

export { MEDIOS } from './medios'

const texto = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)

const EsquemaValor = z
  .object({
    medio: z.enum(Object.keys(MEDIOS) as [keyof typeof MEDIOS, ...(keyof typeof MEDIOS)[]]),
    importe: decimal('Cada valor necesita un importe mayor que cero.').refine((v) => Number(v) > 0, {
      error: 'Cada valor necesita un importe mayor que cero.',
    }),
    detalle: texto,
    banco: texto,
    numeroValor: texto,
    fechaPago: z
      .string()
      .nullable()
      .optional()
      .transform((v) => v || null)
      .pipe(z.iso.date().nullable()),
    cuitLibrador: texto,
    /** Caja, banco o billetera donde entra; vacío: la predeterminada del medio. */
    cuentaId: z
      .string()
      .nullable()
      .optional()
      .transform((v) => v || null)
      .pipe(z.uuid().nullable()),
  })
  .refine((v) => !['cheque', 'echeq'].includes(v.medio) || (v.banco && v.numeroValor && v.fechaPago), {
    error: 'Los cheques necesitan banco, número y fecha de pago.',
  })

const EsquemaRecibo = z.object({
  terceroId: z.uuid({ error: 'Elegí el cliente.' }),
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  puntoVenta: z.coerce.number().int().min(0).max(99998).default(1),
  valores: z.array(EsquemaValor).min(1, { error: 'Agregá al menos un valor (efectivo, transferencia, cheque…).' }),
  imputaciones: z.array(z.object({ comprobanteId: z.uuid(), importe: decimal('Importe inválido.') })).default([]),
  observaciones: texto,
})

export async function emitirRecibo(
  tx: Transaccion,
  /** Vacío: lo emite el sistema (por ejemplo, al aprobarse un pago online). */
  usuarioId: string | null,
  entrada: unknown,
): Promise<{ ok: true; id: string; numero: number } | { ok: false; error: string }> {
  const p = EsquemaRecibo.safeParse(entrada)
  if (!p.success) {
    const i = p.error.issues[0]
    const donde = i.path[0] === 'valores' && typeof i.path[1] === 'number' ? `Valor ${i.path[1] + 1}: ` : ''
    return { ok: false, error: donde + (donde ? i.message : primerError(p.error)) }
  }
  const d = p.data
  const [cliente] = await tx.select().from(terceros).where(eq(terceros.id, d.terceroId))
  if (!cliente) return { ok: false, error: 'Ese cliente ya no existe.' }
  const cerrado = await controlarBloqueo(tx, 'ventas', d.fecha)
  if (cerrado) return { ok: false, error: cerrado }
  const total = d.valores.reduce((s, v) => s.plus(v.importe), new D(0))
  const cuentas: (string | null)[] = []
  for (const v of d.valores) {
    const c = await resolverCuenta(tx, v, { moneda: 'PES', medios: MEDIOS_COBRO_CON_CUENTA, sinTurno: !usuarioId })
    if (!c.ok) return c
    cuentas.push(c.cuentaId)
  }
  const numero = await siguienteNumero(tx, 'recibo', d.puntoVenta)
  const [recibo] = await tx
    .insert(recibos)
    .values({
      puntoVenta: d.puntoVenta,
      numero,
      fecha: d.fecha,
      terceroId: d.terceroId,
      total: aImporte(total),
      observaciones: d.observaciones,
      usuarioId,
      turnoId: await turnoDelRecibo(tx, cuentas, usuarioId),
    })
    .returning()
  await tx
    .insert(recibosValores)
    .values(d.valores.map((v, n) => ({ ...v, cuentaId: cuentas[n], importe: aImporte(v.importe), reciboId: recibo.id })))
  const r = await imputar(tx, usuarioId, { reciboId: recibo.id }, d.imputaciones, d.fecha)
  // Si la imputación no cierra, se revierte todo el recibo (y el número).
  if (!r.ok) throw new ReciboInvalido(r.error)
  await auditar(tx, { usuarioId, accion: 'emision', entidad: 'recibo', entidadId: recibo.id, despues: { numero, ...d } })
  return { ok: true, id: recibo.id, numero }
}

/** Error de validación que revierte la transacción del recibo. */
export class ReciboInvalido extends Error {}

export async function anularRecibo(tx: Transaccion, usuarioId: string, id: string) {
  const [r] = await tx.select().from(recibos).where(eq(recibos.id, id)).for('update')
  if (!r) return { ok: false as const, error: 'Ese recibo ya no existe.' }
  if (r.estado === 'anulado') return { ok: false as const, error: 'El recibo ya está anulado.' }
  const cerrado = await controlarBloqueo(tx, 'ventas', r.fecha)
  if (cerrado) return { ok: false as const, error: cerrado }
  await tx.update(recibos).set({ estado: 'anulado', anulado: new Date(), anuladoPor: usuarioId }).where(eq(recibos.id, id))
  await auditar(tx, { usuarioId, accion: 'anulacion', entidad: 'recibo', entidadId: id, antes: { estado: r.estado } })
  return { ok: true as const }
}

export async function obtenerRecibo(tx: Transaccion, id: string) {
  const [r] = await tx.select().from(recibos).where(eq(recibos.id, id))
  if (!r) return null
  const valores = await tx.select().from(recibosValores).where(eq(recibosValores.reciboId, id))
  const aplicado = await tx
    .select({
      id: imputaciones.id,
      importe: imputaciones.importe,
      comprobanteId: comprobantes.id,
      tipo: comprobantes.tipo,
      puntoVenta: comprobantes.puntoVenta,
      numero: comprobantes.numero,
      fecha: comprobantes.fecha,
    })
    .from(imputaciones)
    .innerJoin(comprobantes, eq(comprobantes.id, imputaciones.comprobanteId))
    .where(eq(imputaciones.reciboId, id))
  const [cliente] = await tx.select().from(terceros).where(eq(terceros.id, r.terceroId))
  const imputadoTotal = aplicado.reduce((s, a) => s.plus(a.importe), new D(0))
  return { ...r, valores, imputaciones: aplicado, cliente, aCuenta: aImporte(monto(r.total).minus(imputadoTotal)) }
}

export async function listarRecibos(tx: Transaccion, q?: string) {
  const texto = q?.trim()
  return tx
    .select({
      id: recibos.id,
      puntoVenta: recibos.puntoVenta,
      numero: recibos.numero,
      fecha: recibos.fecha,
      total: recibos.total,
      estado: recibos.estado,
      cliente: terceros.razonSocial,
    })
    .from(recibos)
    .innerJoin(terceros, eq(terceros.id, recibos.terceroId))
    .where(
      texto
        ? or(ilike(terceros.razonSocial, `%${texto}%`), /^\d+$/.test(texto) ? eq(recibos.numero, Number(texto)) : undefined)
        : undefined,
    )
    .orderBy(desc(recibos.fecha), desc(recibos.numero))
    .limit(300)
}
