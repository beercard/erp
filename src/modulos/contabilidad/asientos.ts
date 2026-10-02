import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { asientos, asientosLineas, configuracionContable, cuentasContables, ejercicios, terceros } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { siguienteNumero } from '../comercial/numeracion'
import { configuracionContableDe } from './plan'

/**
 * Registro de asientos: los automáticos (desde las operaciones) y los
 * manuales pasan por acá. Controla la partida doble (además de la base),
 * que las cuentas sean imputables, que la fecha no esté cerrada y que caiga
 * en un ejercicio abierto (si es posterior al último, se abre el siguiente).
 */

export type Origen =
  | 'manual'
  | 'venta'
  | 'compra'
  | 'cobranza'
  | 'pago'
  | 'cheque_propio'
  | 'tesoreria'
  | 'cheque_rechazado'
  | 'liquidacion_iva'
  | 'refundicion'
  | 'apertura'

export type Linea = { cuentaId: string; debe?: number; haber?: number; detalle?: string | null; terceroId?: string | null }

export type NuevoAsiento = {
  fecha: string
  concepto: string
  origen: Origen
  origenId?: string | null
  automatico?: boolean
  revierteId?: string | null
  lineas: Linea[]
}

const centavos = (n: number | undefined) => Math.round((n ?? 0) * 100)
const aTexto = (c: number) => (c / 100).toFixed(2)

/** El ejercicio de una fecha; si es posterior al último, abre los que hagan falta (de 12 meses). */
export async function ejercicioDe(tx: Transaccion, fecha: string) {
  const [e] = await tx
    .select()
    .from(ejercicios)
    .where(and(lte(ejercicios.inicio, fecha), gte(ejercicios.fin, fecha)))
  if (e) return e
  const [ultimo] = await tx.select().from(ejercicios).orderBy(desc(ejercicios.fin)).limit(1)
  if (!ultimo || fecha < ultimo.inicio) return null
  let fin = ultimo.fin
  let creado: typeof ultimo | undefined
  while (fin < fecha) {
    const inicio = new Date(`${fin}T12:00:00Z`)
    inicio.setUTCDate(inicio.getUTCDate() + 1)
    const nuevoFin = new Date(inicio)
    nuevoFin.setUTCFullYear(nuevoFin.getUTCFullYear() + 1)
    nuevoFin.setUTCDate(nuevoFin.getUTCDate() - 1)
    ;[creado] = await tx
      .insert(ejercicios)
      .values({ inicio: inicio.toISOString().slice(0, 10), fin: nuevoFin.toISOString().slice(0, 10) })
      .returning()
    fin = creado.fin
  }
  return creado ?? null
}

export async function registrarAsiento(tx: Transaccion, usuarioId: string | null, a: NuevoAsiento) {
  const config = await configuracionContableDe(tx)
  if (!config) return { ok: false as const, error: 'La contabilidad no está en marcha.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha)) return { ok: false as const, error: 'Fecha inválida.' }
  if (config.cerradoHasta && a.fecha <= config.cerradoHasta)
    return {
      ok: false as const,
      error: `La contabilidad está cerrada hasta el ${config.cerradoHasta.split('-').reverse().join('/')}.`,
    }
  const ejercicio = await ejercicioDe(tx, a.fecha)
  if (!ejercicio) return { ok: false as const, error: 'La fecha es anterior al primer ejercicio.' }
  if (ejercicio.estado === 'cerrado') return { ok: false as const, error: 'El ejercicio de esa fecha está cerrado.' }

  const lineas = a.lineas
    .map((l) => ({ ...l, d: centavos(l.debe), h: centavos(l.haber) }))
    // Una línea con debe y haber se deja con el neto; las que dan cero se sacan.
    .map((l) => ({ ...l, d: Math.max(0, l.d - l.h), h: Math.max(0, l.h - l.d) }))
    .filter((l) => l.d !== 0 || l.h !== 0)
  if (lineas.some((l) => l.d < 0 || l.h < 0)) return { ok: false as const, error: 'Los importes no pueden ser negativos.' }
  const debe = lineas.reduce((s, l) => s + l.d, 0)
  const haber = lineas.reduce((s, l) => s + l.h, 0)
  if (lineas.length < 2) return { ok: false as const, error: 'El asiento necesita al menos dos líneas con importe.' }
  if (debe !== haber) return { ok: false as const, error: `No balancea: debe ${aTexto(debe)} y haber ${aTexto(haber)}.` }
  const ids = [...new Set(lineas.map((l) => l.cuentaId))]
  const cuentas = await tx.select().from(cuentasContables).where(inArray(cuentasContables.id, ids))
  for (const id of ids) {
    const c = cuentas.find((x) => x.id === id)
    if (!c) return { ok: false as const, error: 'Una de las cuentas no existe.' }
    if (!c.imputable)
      return { ok: false as const, error: `La cuenta ${c.codigo} ${c.nombre} agrupa: elegí una de sus subcuentas.` }
  }

  const numero = await siguienteNumero(tx, 'asiento')
  const [nuevo] = await tx
    .insert(asientos)
    .values({
      numero,
      fecha: a.fecha,
      concepto: a.concepto.slice(0, 300),
      origen: a.origen,
      origenId: a.origenId ?? null,
      automatico: a.automatico ?? false,
      revierteId: a.revierteId ?? null,
      usuarioId,
    })
    .returning({ id: asientos.id })
  await tx.insert(asientosLineas).values(
    lineas.map((l, i) => ({
      asientoId: nuevo.id,
      orden: i + 1,
      cuentaId: l.cuentaId,
      debe: aTexto(l.d),
      haber: aTexto(l.h),
      detalle: l.detalle ?? null,
      terceroId: l.terceroId ?? null,
    })),
  )
  if (!a.automatico && usuarioId)
    await auditar(tx, {
      usuarioId,
      accion: 'alta',
      entidad: 'asiento',
      entidadId: nuevo.id,
      despues: { numero, fecha: a.fecha, concepto: a.concepto },
    })
  return { ok: true as const, id: nuevo.id, numero }
}

/** Contraasiento: las mismas líneas al revés, con fecha de hoy (o la que se diga). */
export async function revertirAsiento(tx: Transaccion, usuarioId: string | null, id: string, fecha: string, concepto?: string) {
  const [a] = await tx.select().from(asientos).where(eq(asientos.id, id))
  if (!a) return { ok: false as const, error: 'Ese asiento no existe.' }
  if (a.revierteId) return { ok: false as const, error: 'Es un contraasiento: no se revierte.' }
  const [ya] = await tx.select({ id: asientos.id }).from(asientos).where(eq(asientos.revierteId, id))
  if (ya) return { ok: false as const, error: 'Ese asiento ya está revertido.' }
  const lineas = await tx.select().from(asientosLineas).where(eq(asientosLineas.asientoId, id)).orderBy(asc(asientosLineas.orden))
  return registrarAsiento(tx, usuarioId, {
    fecha,
    concepto: concepto ?? `Anulación del asiento ${a.numero}: ${a.concepto}`,
    origen: a.origen as Origen,
    // Los manuales no tienen operación: el contraasiento apunta al asiento.
    origenId: a.origenId ?? a.id,
    automatico: a.automatico,
    revierteId: a.id,
    lineas: lineas.map((l) => ({
      cuentaId: l.cuentaId,
      debe: Number(l.haber),
      haber: Number(l.debe),
      detalle: l.detalle,
      terceroId: l.terceroId,
    })),
  })
}

// ---------------------------------------------------------------- Manuales

const EsquemaManual = z.object({
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  concepto: z.string().trim().min(3, { error: 'Escribí el concepto.' }).max(300),
  lineas: z
    .array(
      z.object({
        cuentaId: z.uuid({ error: 'Elegí la cuenta de cada línea.' }),
        debe: z.coerce.number().min(0).default(0),
        haber: z.coerce.number().min(0).default(0),
        detalle: z.string().trim().max(200).optional(),
      }),
    )
    .min(2, { error: 'El asiento necesita al menos dos líneas.' }),
})

export async function asientoManual(tx: Transaccion, usuarioId: string, entrada: unknown) {
  const p = EsquemaManual.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Datos inválidos.' }
  return registrarAsiento(tx, usuarioId, { ...p.data, origen: 'manual' })
}

export async function anularAsientoManual(tx: Transaccion, usuarioId: string, id: string, fecha: string) {
  const [a] = await tx.select().from(asientos).where(eq(asientos.id, id))
  if (!a) return { ok: false as const, error: 'Ese asiento no existe.' }
  if (a.automatico) return { ok: false as const, error: 'Es automático: se anula anulando la operación que lo generó.' }
  return revertirAsiento(tx, usuarioId, id, fecha)
}

// ---------------------------------------------------------------- Consultas

export async function obtenerAsiento(tx: Transaccion, id: string) {
  const [a] = await tx.select().from(asientos).where(eq(asientos.id, id))
  if (!a) return null
  const [lineas, [revertido]] = await Promise.all([
    tx
      .select({
        id: asientosLineas.id,
        cuentaId: asientosLineas.cuentaId,
        codigo: cuentasContables.codigo,
        cuenta: cuentasContables.nombre,
        debe: asientosLineas.debe,
        haber: asientosLineas.haber,
        detalle: asientosLineas.detalle,
        tercero: terceros.razonSocial,
      })
      .from(asientosLineas)
      .innerJoin(cuentasContables, eq(cuentasContables.id, asientosLineas.cuentaId))
      .leftJoin(terceros, eq(terceros.id, asientosLineas.terceroId))
      .where(eq(asientosLineas.asientoId, id))
      .orderBy(asc(asientosLineas.orden)),
    tx.select({ id: asientos.id, numero: asientos.numero }).from(asientos).where(eq(asientos.revierteId, id)),
  ])
  return { ...a, lineas, revertidoPor: revertido ?? null }
}

/** Fecha hasta la que no se aceptan asientos (cierre de un período ya revisado por el contador). */
export async function cerrarHasta(tx: Transaccion, usuarioId: string, fecha: string | null) {
  if (fecha !== null && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false as const, error: 'Fecha inválida.' }
  const [c] = await tx.update(configuracionContable).set({ cerradoHasta: fecha }).returning()
  if (!c) return { ok: false as const, error: 'La contabilidad no está en marcha.' }
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'configuracion_contable', despues: { cerradoHasta: fecha } })
  return { ok: true as const }
}
