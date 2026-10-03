import { and, desc, eq, gte, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { cierresCaja, cuentasTesoreria, usuarios } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { aImporte, D, monto } from '../../lib/dinero'
import { hoyArgentina } from '../../lib/fechas'
import { filasDe } from '../compras/compras'
import { decimal, primerError } from '../comercial/documentos'
import { MEDIOS } from '../facturacion/medios'
import { libro, saldoCuenta } from './cuentas'
import { arquear } from './movimientos'

/**
 * Cierre de caja (como el de un POS): para una caja, desde el cierre
 * anterior (o el comienzo del día) hasta ahora, cuánto se cobró y por qué
 * medio, quién cobró, qué entró y salió de la caja, cuánto efectivo debería
 * haber y cuánto se contó. La diferencia queda como arqueo con su ajuste.
 */

export { DENOMINACIONES } from './denominaciones'

/** Comienzo del día de hoy en Argentina. */
const comienzoDelDia = (ahora = new Date()) => new Date(`${hoyArgentina(ahora)}T00:00:00-03:00`)

/** Desde cuándo va el turno abierto de una caja: el último cierre o, si no hubo, el comienzo del día. */
export async function inicioTurno(tx: Transaccion, cuentaId: string, ahora = new Date()) {
  const [u] = await tx
    .select({ hasta: cierresCaja.hasta })
    .from(cierresCaja)
    .where(eq(cierresCaja.cuentaId, cuentaId))
    .orderBy(desc(cierresCaja.hasta))
    .limit(1)
  return u?.hasta ?? comienzoDelDia(ahora)
}

type Fila = { origen: string; id: string; importe: string; tipo: string; descripcion: string; creado: Date }

/** Resumen de un período para una caja. Las cobranzas son de toda la empresa; los movimientos, de la caja. */
export async function resumenTurno(tx: Transaccion, cuentaId: string, desde: Date, hasta: Date = new Date()) {
  // Movimientos de la caja: lo de antes del período es el saldo inicial.
  const movs = filasDe<Fila>(
    await tx.execute(
      sql`select l.origen, l.id, l.importe::text as importe, l.tipo, l.descripcion, l.creado from (${libro(cuentaId)}) l where l.creado < ${hasta.toISOString()}::timestamptz order by l.creado`,
    ),
  )
  const antes = movs.filter((m) => new Date(m.creado) < desde)
  const periodo = movs.filter((m) => new Date(m.creado) >= desde)
  const saldoInicial = antes.reduce((s, m) => s.plus(m.importe), new D(0))
  const ingresos = periodo.filter((m) => monto(m.importe).gt(0)).reduce((s, m) => s.plus(m.importe), new D(0))
  const egresos = periodo.filter((m) => monto(m.importe).lt(0)).reduce((s, m) => s.plus(m.importe), new D(0))

  // Cobranzas del período (recibos emitidos y anulados), por medio y por cajero.
  const valores = filasDe<{ medio: string; total: string; recibos: number }>(
    await tx.execute(sql`
      select rv.medio, sum(rv.importe)::text as total, count(distinct r.id)::int as recibos
      from recibos_valores rv join recibos r on r.id = rv.recibo_id
      where r.estado = 'emitido' and r.creado >= ${desde.toISOString()}::timestamptz and r.creado < ${hasta.toISOString()}::timestamptz
      group by rv.medio order by sum(rv.importe) desc`),
  )
  const cajeros = filasDe<{ usuario: string | null; total: string; recibos: number }>(
    await tx.execute(sql`
      select coalesce(u.nombre, 'Sistema (pagos online)') as usuario, sum(r.total)::text as total, count(*)::int as recibos
      from recibos r left join usuarios u on u.id = r.usuario_id
      where r.estado = 'emitido' and r.creado >= ${desde.toISOString()}::timestamptz and r.creado < ${hasta.toISOString()}::timestamptz
      group by 1 order by sum(r.total) desc`),
  )
  const [anulados] = filasDe<{ cantidad: number; total: string }>(
    await tx.execute(sql`
      select count(*)::int as cantidad, coalesce(sum(total), 0)::text as total from recibos
      where estado = 'anulado' and anulado >= ${desde.toISOString()}::timestamptz and anulado < ${hasta.toISOString()}::timestamptz`),
  )
  const online = filasDe<{ proveedor: string; cantidad: number; total: string }>(
    await tx.execute(sql`
      select coalesce(proveedor, 'otro') as proveedor, count(*)::int as cantidad, sum(importe)::text as total from pagos_online
      where estado = 'aprobado' and aprobado >= ${desde.toISOString()}::timestamptz and aprobado < ${hasta.toISOString()}::timestamptz
      group by 1`),
  )
  // Ventas facturadas en el período (facturas y notas de débito menos notas de crédito, en pesos).
  const [ventas] = filasDe<{ comprobantes: number; total: string }>(
    await tx.execute(sql`
      select count(*)::int as comprobantes,
        coalesce(sum(case when clase = 'nota_credito' then -1 else 1 end * round(total * cotizacion, 2)), 0)::text as total
      from comprobantes
      where estado = 'autorizado' and creado >= ${desde.toISOString()}::timestamptz and creado < ${hasta.toISOString()}::timestamptz`),
  )
  const cobrado = valores.reduce((s, v) => s.plus(v.total), new D(0))
  const recibos = cajeros.reduce((s, c) => s + c.recibos, 0)
  return {
    desde,
    hasta,
    saldoInicial: aImporte(saldoInicial),
    ingresos: aImporte(ingresos),
    egresos: aImporte(egresos.abs()),
    esperado: aImporte(saldoInicial.plus(ingresos).plus(egresos)),
    cobrado: aImporte(cobrado),
    recibos,
    promedio: recibos ? aImporte(cobrado.div(recibos)) : '0.00',
    porMedio: valores.map((v) => ({
      medio: v.medio,
      nombre: MEDIOS[v.medio as keyof typeof MEDIOS] ?? v.medio,
      total: aImporte(v.total),
      recibos: v.recibos,
    })),
    porCajero: cajeros.map((c) => ({ usuario: c.usuario ?? 'Sistema', total: aImporte(c.total), recibos: c.recibos })),
    anulados: { cantidad: anulados?.cantidad ?? 0, total: aImporte(anulados?.total ?? '0') },
    online: online.map((o) => ({ ...o, total: aImporte(o.total) })),
    ventas: { comprobantes: ventas?.comprobantes ?? 0, total: aImporte(ventas?.total ?? '0') },
    // Lo que no es una cobranza: retiros, gastos, depósitos, ajustes.
    otrosMovimientos: periodo
      .filter((m) => m.origen !== 'recibo_valor')
      .map((m) => ({
        descripcion: m.descripcion,
        tipo: m.tipo,
        importe: aImporte(m.importe),
        creado: new Date(m.creado).toISOString(),
      })),
  }
}

export type ResumenTurno = Awaited<ReturnType<typeof resumenTurno>>

const EsquemaCierre = z.object({
  cuentaId: z.uuid({ error: 'Elegí la caja.' }),
  contado: decimal('Escribí cuánto efectivo contaste.'),
  conteo: z.record(z.string(), z.coerce.number().int().min(0).max(100_000)).optional(),
  observaciones: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
})

/** Cierra el turno de la caja: guarda el resumen, lo contado y, si no coincide, el arqueo con su ajuste. */
export async function cerrarCaja(tx: Transaccion, usuarioId: string, entrada: unknown, ahora = new Date()) {
  const p = EsquemaCierre.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const d = p.data
  const [c] = await tx.select().from(cuentasTesoreria).where(eq(cuentasTesoreria.id, d.cuentaId))
  if (!c) return { ok: false as const, error: 'Esa caja ya no existe.' }
  if (c.tipo !== 'caja') return { ok: false as const, error: 'El cierre se hace sobre una caja (efectivo).' }
  // Bloquea la caja mientras se cierra: dos cierres a la vez no pueden pisarse.
  await tx.execute(sql`select id from cuentas_tesoreria where id = ${c.id} for update`)
  const desde = await inicioTurno(tx, c.id, ahora)
  const r = await resumenTurno(tx, c.id, desde, ahora)
  const diferencia = monto(d.contado).minus(r.esperado)
  let arqueoId: string | null = null
  if (!diferencia.isZero()) {
    const a = await arquear(tx, usuarioId, {
      cuentaId: c.id,
      fecha: hoyArgentina(ahora),
      contado: aImporte(monto(await saldoHoy(tx, c.id, ahora)).plus(diferencia)),
      observaciones: `Cierre de caja${d.observaciones ? `: ${d.observaciones}` : ''}`,
    })
    if (!a.ok) return a
    arqueoId = a.id
  }
  const [cierre] = await tx
    .insert(cierresCaja)
    .values({
      cuentaId: c.id,
      desde,
      hasta: ahora,
      saldoInicial: r.saldoInicial,
      ingresos: r.ingresos,
      egresos: r.egresos,
      esperado: r.esperado,
      contado: aImporte(d.contado),
      diferencia: aImporte(diferencia),
      conteo: d.conteo ?? null,
      resumen: JSON.parse(JSON.stringify(r)),
      arqueoId,
      observaciones: d.observaciones,
      usuarioId,
    })
    .returning()
  await auditar(tx, {
    usuarioId,
    accion: 'alta',
    entidad: 'cierre_caja',
    entidadId: cierre.id,
    despues: { cuentaId: c.id, contado: d.contado, diferencia: aImporte(diferencia) },
  })
  return { ok: true as const, id: cierre.id, diferencia: aImporte(diferencia) }
}

/** Saldo de la caja a la fecha (el que compara el arqueo), para que el ajuste sea exactamente la diferencia del turno. */
const saldoHoy = (tx: Transaccion, cuentaId: string, ahora: Date) => saldoCuenta(tx, cuentaId, hoyArgentina(ahora))

export async function listarCierres(tx: Transaccion, filtro: { cuentaId?: string; desde?: Date } = {}) {
  return tx
    .select({
      id: cierresCaja.id,
      cuentaId: cierresCaja.cuentaId,
      caja: cuentasTesoreria.nombre,
      desde: cierresCaja.desde,
      hasta: cierresCaja.hasta,
      esperado: cierresCaja.esperado,
      contado: cierresCaja.contado,
      diferencia: cierresCaja.diferencia,
      usuario: usuarios.nombre,
      resumen: cierresCaja.resumen,
    })
    .from(cierresCaja)
    .innerJoin(cuentasTesoreria, eq(cuentasTesoreria.id, cierresCaja.cuentaId))
    .leftJoin(usuarios, eq(usuarios.id, cierresCaja.usuarioId))
    .where(
      and(
        filtro.cuentaId ? eq(cierresCaja.cuentaId, filtro.cuentaId) : undefined,
        filtro.desde ? gte(cierresCaja.hasta, filtro.desde) : undefined,
      ),
    )
    .orderBy(desc(cierresCaja.hasta))
    .limit(200)
}

export async function obtenerCierre(tx: Transaccion, id: string) {
  const [c] = await tx
    .select({ cierre: cierresCaja, caja: cuentasTesoreria.nombre, usuario: usuarios.nombre })
    .from(cierresCaja)
    .innerJoin(cuentasTesoreria, eq(cuentasTesoreria.id, cierresCaja.cuentaId))
    .leftJoin(usuarios, eq(usuarios.id, cierresCaja.usuarioId))
    .where(eq(cierresCaja.id, id))
  return c ? { ...c.cierre, caja: c.caja, usuario: c.usuario, resumen: c.cierre.resumen as unknown as ResumenTurno } : null
}

/** Las cajas (efectivo) activas de la empresa. */
export async function cajas(tx: Transaccion) {
  return tx
    .select({ id: cuentasTesoreria.id, nombre: cuentasTesoreria.nombre })
    .from(cuentasTesoreria)
    .where(and(eq(cuentasTesoreria.tipo, 'caja'), eq(cuentasTesoreria.activa, true)))
}
