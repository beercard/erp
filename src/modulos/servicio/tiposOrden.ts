import { and, asc, desc, eq } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { plantillasOrden, tiposOrden } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { primerError } from '../comercial/documentos'
import { MODELOS, validarDefinicion, type Campo } from './formularios'
import { TIPOS_ORDEN } from './tipos'

/**
 * Tipos de orden con sus formularios versionados (como las plantillas de
 * OT de Persat): guardar un formulario distinto crea una versión nueva; las
 * órdenes ya abiertas siguen con la versión con la que se crearon.
 */

const EsquemaTipo = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{1,12}$/, { error: 'El código va con letras y números, hasta 12.' }),
  nombre: z.string().trim().min(3, { error: 'Escribí el nombre del tipo de orden.' }).max(80),
  clase: z.enum(Object.keys(TIPOS_ORDEN) as [keyof typeof TIPOS_ORDEN, ...(keyof typeof TIPOS_ORDEN)[]]),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, { error: 'Color inválido.' })
    .default('#2563eb'),
  duracion: z.coerce.number().int().min(5, { error: 'La duración va de 5 a 1440 minutos.' }).max(1440),
  plazoHoras: z.coerce.number().int().min(1, { error: 'El plazo va de 1 a 720 horas.' }).max(720),
  activo: z.boolean().default(true),
  instrucciones: z.array(z.any()),
  devolucion: z.array(z.any()),
})

const iguales = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export async function guardarTipo(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string) {
  const p = EsquemaTipo.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const { instrucciones, devolucion, ...datos } = p.data
  const problema = validarDefinicion(instrucciones, 'instrucciones') ?? validarDefinicion(devolucion, 'devolucion')
  if (problema) return { ok: false as const, error: problema }
  if (!devolucion.length) return { ok: false as const, error: 'La devolución del técnico necesita al menos un campo.' }
  const ids = new Set((instrucciones as Campo[]).map((c) => c.id))
  const repetido = (devolucion as Campo[]).find((c) => ids.has(c.id))
  if (repetido)
    return { ok: false as const, error: `“${repetido.etiqueta}” usa un identificador que ya está en las instrucciones.` }

  const [mismoCodigo] = await tx.select({ id: tiposOrden.id }).from(tiposOrden).where(eq(tiposOrden.codigo, datos.codigo))
  if (mismoCodigo && mismoCodigo.id !== id) return { ok: false as const, error: 'Ya hay un tipo de orden con ese código.' }

  let tipoId = id
  let version = 1
  if (id) {
    const [t] = await tx.select().from(tiposOrden).where(eq(tiposOrden.id, id)).for('update')
    if (!t) return { ok: false as const, error: 'Ese tipo de orden ya no existe.' }
    const [vigente] = await tx
      .select()
      .from(plantillasOrden)
      .where(and(eq(plantillasOrden.tipoId, id), eq(plantillasOrden.version, t.version)))
    version = t.version
    if (!vigente || !iguales(vigente.instrucciones, instrucciones) || !iguales(vigente.devolucion, devolucion)) {
      version = t.version + 1
      await tx.insert(plantillasOrden).values({ tipoId: id, version, instrucciones, devolucion, usuarioId })
    }
    await tx
      .update(tiposOrden)
      .set({ ...datos, version })
      .where(eq(tiposOrden.id, id))
  } else {
    tipoId = (await tx.insert(tiposOrden).values(datos).returning({ id: tiposOrden.id }))[0].id
    await tx.insert(plantillasOrden).values({ tipoId, version, instrucciones, devolucion, usuarioId })
  }
  await auditar(tx, {
    usuarioId,
    accion: id ? 'modificacion' : 'alta',
    entidad: 'tipo_orden',
    entidadId: tipoId,
    despues: { ...datos, version },
  })
  return { ok: true as const, id: tipoId!, version }
}

/** Crea los tipos de los modelos de ejemplo que todavía no existen (por código). */
export async function crearModelos(tx: Transaccion, usuarioId: string, codigos?: string[]) {
  const creados: string[] = []
  for (const m of MODELOS.filter((x) => !codigos || codigos.includes(x.codigo))) {
    const [ya] = await tx.select({ id: tiposOrden.id }).from(tiposOrden).where(eq(tiposOrden.codigo, m.codigo))
    if (ya) continue
    const r = await guardarTipo(tx, usuarioId, {
      codigo: m.codigo,
      nombre: m.nombre,
      clase: m.clase,
      duracion: m.duracion,
      plazoHoras: 48,
      instrucciones: m.instrucciones,
      devolucion: m.devolucion,
    })
    if (!r.ok) throw new Error(`Modelo ${m.codigo}: ${r.error}`)
    creados.push(m.nombre)
  }
  return creados
}

export async function listarTipos(tx: Transaccion, soloActivos = false) {
  return tx
    .select()
    .from(tiposOrden)
    .where(soloActivos ? eq(tiposOrden.activo, true) : undefined)
    .orderBy(asc(tiposOrden.nombre))
}

/** El tipo con sus formularios vigentes y cuántas versiones tiene. */
export async function obtenerTipo(tx: Transaccion, id: string) {
  const [t] = await tx.select().from(tiposOrden).where(eq(tiposOrden.id, id))
  if (!t) return null
  const versiones = await tx
    .select({ id: plantillasOrden.id, version: plantillasOrden.version, creado: plantillasOrden.creado })
    .from(plantillasOrden)
    .where(eq(plantillasOrden.tipoId, id))
    .orderBy(desc(plantillasOrden.version))
  const plantilla = await plantillaVigente(tx, id)
  return { ...t, plantilla, versiones }
}

/** Formularios vigentes de un tipo. */
export async function plantillaVigente(tx: Transaccion, tipoId: string) {
  const [p] = await tx
    .select({ plantilla: plantillasOrden })
    .from(plantillasOrden)
    .innerJoin(tiposOrden, and(eq(tiposOrden.id, plantillasOrden.tipoId), eq(tiposOrden.version, plantillasOrden.version)))
    .where(eq(plantillasOrden.tipoId, tipoId))
  return p ? aPlantilla(p.plantilla) : null
}

export async function obtenerPlantilla(tx: Transaccion, id: string) {
  const [p] = await tx.select().from(plantillasOrden).where(eq(plantillasOrden.id, id))
  return p ? aPlantilla(p) : null
}

const aPlantilla = (p: typeof plantillasOrden.$inferSelect) => ({
  ...p,
  instrucciones: p.instrucciones as Campo[],
  devolucion: p.devolucion as Campo[],
})

export type Plantilla = NonNullable<Awaited<ReturnType<typeof obtenerPlantilla>>>

/** Tipos activos con el formulario de instrucciones vigente, para abrir órdenes. */
export async function tiposParaOrden(tx: Transaccion) {
  const filas = await tx
    .select({ t: tiposOrden, instrucciones: plantillasOrden.instrucciones })
    .from(tiposOrden)
    .innerJoin(plantillasOrden, and(eq(plantillasOrden.tipoId, tiposOrden.id), eq(plantillasOrden.version, tiposOrden.version)))
    .where(eq(tiposOrden.activo, true))
    .orderBy(asc(tiposOrden.nombre))
  return filas.map(({ t, instrucciones }) => ({
    id: t.id,
    nombre: t.nombre,
    clase: t.clase,
    duracion: t.duracion,
    instrucciones: instrucciones as Campo[],
  }))
}
