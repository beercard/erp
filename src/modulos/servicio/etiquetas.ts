import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { etiquetasServicio, ordenesServicio, ordenesServicioEtiquetas, ordenesServicioTecnicos, tecnicos } from '../../db/schema'
import { auditar } from '../../lib/auditoria'

/**
 * Etiquetas de colores y acompañantes de las órdenes (como en Persat).
 *
 * - Etiquetas: las define la empresa; una orden puede tener varias.
 * - Acompañantes: técnicos que van con el responsable. La orden aparece en
 *   su agenda y en su fila del calendario y les ocupa el horario en el
 *   asistente de huecos; el informe lo carga el responsable.
 */

export type Etiqueta = { id: string; nombre: string; color: string }

const EsquemaEtiqueta = z.object({
  nombre: z.string().trim().min(2, { error: 'Escribí el nombre de la etiqueta.' }).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: 'Elegí un color.' }),
  activa: z.boolean().default(true),
})

export async function listarEtiquetas(tx: Transaccion, todas = false) {
  return tx
    .select()
    .from(etiquetasServicio)
    .where(todas ? undefined : eq(etiquetasServicio.activa, true))
    .orderBy(asc(etiquetasServicio.nombre))
}

export async function guardarEtiqueta(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string) {
  const p = EsquemaEtiqueta.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Datos inválidos.' }
  const [repetida] = await tx
    .select({ id: etiquetasServicio.id })
    .from(etiquetasServicio)
    .where(and(eq(etiquetasServicio.nombre, p.data.nombre), id ? ne(etiquetasServicio.id, id) : undefined))
  if (repetida) return { ok: false as const, error: 'Ya hay una etiqueta con ese nombre.' }
  const [e] = id
    ? await tx.update(etiquetasServicio).set(p.data).where(eq(etiquetasServicio.id, id)).returning()
    : await tx.insert(etiquetasServicio).values(p.data).returning()
  if (!e) return { ok: false as const, error: 'Esa etiqueta ya no existe.' }
  await auditar(tx, {
    usuarioId,
    accion: id ? 'modificacion' : 'alta',
    entidad: 'etiqueta_servicio',
    entidadId: e.id,
    despues: p.data,
  })
  return { ok: true as const, id: e.id }
}

/** Etiquetas de varias órdenes de una vez (para listados y el calendario). */
export async function etiquetasDeOrdenes(tx: Transaccion, ordenIds: string[]) {
  const m = new Map<string, Etiqueta[]>()
  if (!ordenIds.length) return m
  const filas = await tx
    .select({
      ordenId: ordenesServicioEtiquetas.ordenId,
      id: etiquetasServicio.id,
      nombre: etiquetasServicio.nombre,
      color: etiquetasServicio.color,
    })
    .from(ordenesServicioEtiquetas)
    .innerJoin(etiquetasServicio, eq(etiquetasServicio.id, ordenesServicioEtiquetas.etiquetaId))
    .where(inArray(ordenesServicioEtiquetas.ordenId, ordenIds))
    .orderBy(asc(etiquetasServicio.nombre))
  for (const { ordenId, ...e } of filas) m.set(ordenId, [...(m.get(ordenId) ?? []), e])
  return m
}

/** Deja la orden con exactamente esas etiquetas. */
export async function ponerEtiquetas(tx: Transaccion, usuarioId: string, ordenId: string, etiquetaIds: string[]) {
  const ids = [...new Set(etiquetaIds.filter((x) => /^[0-9a-f-]{36}$/i.test(x)))]
  const [o] = await tx.select({ id: ordenesServicio.id }).from(ordenesServicio).where(eq(ordenesServicio.id, ordenId))
  if (!o) return { ok: false as const, error: 'Esa orden de servicio ya no existe.' }
  if (ids.length) {
    const validas = await tx
      .select({ id: etiquetasServicio.id })
      .from(etiquetasServicio)
      .where(inArray(etiquetasServicio.id, ids))
    if (validas.length !== ids.length) return { ok: false as const, error: 'Alguna de las etiquetas ya no existe.' }
  }
  await tx.delete(ordenesServicioEtiquetas).where(eq(ordenesServicioEtiquetas.ordenId, ordenId))
  if (ids.length) await tx.insert(ordenesServicioEtiquetas).values(ids.map((etiquetaId) => ({ ordenId, etiquetaId })))
  await auditar(tx, {
    usuarioId,
    accion: 'modificacion',
    entidad: 'orden_servicio',
    entidadId: ordenId,
    despues: { etiquetas: ids },
  })
  return { ok: true as const }
}

// ---------------------------------------------------------------- Acompañantes

export async function acompanantesDe(tx: Transaccion, ordenIds: string[]) {
  const m = new Map<string, { id: string; nombre: string }[]>()
  if (!ordenIds.length) return m
  const filas = await tx
    .select({ ordenId: ordenesServicioTecnicos.ordenId, id: tecnicos.id, nombre: tecnicos.nombre })
    .from(ordenesServicioTecnicos)
    .innerJoin(tecnicos, eq(tecnicos.id, ordenesServicioTecnicos.tecnicoId))
    .where(inArray(ordenesServicioTecnicos.ordenId, ordenIds))
    .orderBy(asc(tecnicos.nombre))
  for (const { ordenId, ...t } of filas) m.set(ordenId, [...(m.get(ordenId) ?? []), t])
  return m
}

/** Órdenes en las que un técnico va de acompañante. */
export async function ordenesComoAcompanante(tx: Transaccion, tecnicoId: string) {
  const filas = await tx
    .select({ ordenId: ordenesServicioTecnicos.ordenId })
    .from(ordenesServicioTecnicos)
    .where(eq(ordenesServicioTecnicos.tecnicoId, tecnicoId))
  return filas.map((f) => f.ordenId)
}

export async function esAcompanante(tx: Transaccion, ordenId: string, tecnicoId: string) {
  const [f] = await tx
    .select({ ordenId: ordenesServicioTecnicos.ordenId })
    .from(ordenesServicioTecnicos)
    .where(and(eq(ordenesServicioTecnicos.ordenId, ordenId), eq(ordenesServicioTecnicos.tecnicoId, tecnicoId)))
  return !!f
}

/**
 * Deja la orden con esos acompañantes (activos, sin repetir y sin el
 * responsable). Se llama desde la programación de la visita.
 */
export async function ponerAcompanantes(tx: Transaccion, ordenId: string, responsableId: string | null, tecnicoIds: string[]) {
  const ids = [...new Set(tecnicoIds.filter((x) => /^[0-9a-f-]{36}$/i.test(x) && x !== responsableId))]
  if (ids.length && !responsableId) return { ok: false as const, error: 'Elegí primero el técnico responsable.' }
  if (ids.length) {
    const activos = await tx
      .select({ id: tecnicos.id })
      .from(tecnicos)
      .where(and(inArray(tecnicos.id, ids), eq(tecnicos.activo, true)))
    if (activos.length !== ids.length) return { ok: false as const, error: 'Alguno de los acompañantes no está activo.' }
  }
  await tx.delete(ordenesServicioTecnicos).where(eq(ordenesServicioTecnicos.ordenId, ordenId))
  if (ids.length) await tx.insert(ordenesServicioTecnicos).values(ids.map((tecnicoId) => ({ ordenId, tecnicoId })))
  return { ok: true as const, ids }
}
