import { createHash } from 'node:crypto'

import { and, desc, eq, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { presentaciones } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { huella, libroIva } from './libroIva'
import { posicionIva } from './posicionIva'

/**
 * Presentaciones: cada libro o declaración que se genera queda guardado con
 * su archivo. Al marcarla presentada el período queda cerrado para ese
 * impuesto; para corregir se reabre (queda el motivo) y se presenta una
 * rectificativa.
 */

export type Impuesto = 'iva_digital' | 'sicore' | 'iibb'

export const IMPUESTOS: Record<Impuesto, string> = {
  iva_digital: 'Libro IVA Digital',
  sicore: 'SICORE (retenciones de Ganancias)',
  iibb: 'Ingresos Brutos',
}

export const PERIODO = /^[0-9]{4}-(0[1-9]|1[0-2])$/

/** La presentación vigente de un período (si está presentada, el período está cerrado). */
export async function periodoCerrado(tx: Transaccion, impuesto: Impuesto, periodo: string) {
  const [p] = await tx
    .select({
      id: presentaciones.id,
      secuencia: presentaciones.secuencia,
      presentada: presentaciones.presentada,
      transaccion: presentaciones.transaccion,
    })
    .from(presentaciones)
    .where(
      and(eq(presentaciones.impuesto, impuesto), eq(presentaciones.periodo, periodo), eq(presentaciones.estado, 'presentada')),
    )
    .limit(1)
  return p ?? null
}

/** Mensaje para quien quiere tocar un comprobante de un período de IVA ya presentado. */
export async function controlarPeriodoIva(tx: Transaccion, periodo: string) {
  const p = await periodoCerrado(tx, 'iva_digital', periodo)
  if (!p) return null
  const [a, m] = periodo.split('-')
  return `El Libro IVA de ${m}/${a} ya se presentó${p.transaccion ? ` (transacción ${p.transaccion})` : ''}: para cambiarlo, reabrí el período en Impuestos.`
}

/** Guarda lo generado (cada descarga queda registrada con su archivo). */
export async function guardarGenerada(
  tx: Transaccion,
  usuarioId: string,
  d: { impuesto: Impuesto; periodo: string; archivo: Uint8Array; nombreArchivo: string; resumen: unknown },
) {
  // Rectificativa: si hubo una presentada y se reabrió, la próxima es la siguiente secuencia.
  const [ultima] = await tx
    .select({ secuencia: presentaciones.secuencia })
    .from(presentaciones)
    .where(
      and(eq(presentaciones.impuesto, d.impuesto), eq(presentaciones.periodo, d.periodo), eq(presentaciones.estado, 'reabierta')),
    )
    .orderBy(desc(presentaciones.secuencia))
    .limit(1)
  const secuencia = ultima ? ultima.secuencia + 1 : 0
  const [p] = await tx
    .insert(presentaciones)
    .values({
      ...d,
      archivo: Buffer.from(d.archivo),
      secuencia,
      usuarioId,
      resumen: { ...(d.resumen as object), hash: createHash('sha256').update(d.archivo).digest('hex') },
    })
    .returning({ id: presentaciones.id, secuencia: presentaciones.secuencia })
  await auditar(tx, {
    usuarioId,
    accion: 'alta',
    entidad: 'presentacion',
    entidadId: p.id,
    despues: { impuesto: d.impuesto, periodo: d.periodo, secuencia },
  })
  return p
}

const EsquemaPresentar = z.object({
  transaccion: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => v || null),
})

/** Marca lo generado como presentado: el período queda cerrado. */
export async function marcarPresentada(tx: Transaccion, usuarioId: string, id: string, entrada: unknown) {
  const p = EsquemaPresentar.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: 'Número de transacción inválido.' }
  const [g] = await tx.select().from(presentaciones).where(eq(presentaciones.id, id)).for('update')
  if (!g) return { ok: false as const, error: 'No existe.' }
  if (g.estado !== 'generada') return { ok: false as const, error: 'Ya se marcó o se reabrió.' }
  const ya = await periodoCerrado(tx, g.impuesto as Impuesto, g.periodo)
  if (ya) return { ok: false as const, error: 'El período ya tiene una presentación: reabrilo para presentar una rectificativa.' }
  // Libro IVA: tiene que coincidir con lo de hoy, y se guarda la posición (sus saldos pasan al mes siguiente).
  let resumen = g.resumen as Record<string, unknown>
  if (g.impuesto === 'iva_digital') {
    const l = await libroIva(tx, g.periodo)
    if (resumen.contenido && resumen.contenido !== huella(l.archivos))
      return {
        ok: false as const,
        error: 'Cambiaron comprobantes del mes desde que bajaste este archivo: bajalo de nuevo y presentá ese.',
      }
    const { ventas, compras, ...posicion } = await posicionIva(tx, g.periodo)
    void ventas
    void compras
    resumen = { ...resumen, posicion }
  }
  await tx
    .update(presentaciones)
    .set({ estado: 'presentada', presentada: new Date(), transaccion: p.data.transaccion, resumen })
    .where(eq(presentaciones.id, id))
  await auditar(tx, {
    usuarioId,
    accion: 'modificacion',
    entidad: 'presentacion',
    entidadId: id,
    despues: { estado: 'presentada', transaccion: p.data.transaccion },
  })
  return { ok: true as const }
}

/** Reabre un período presentado (para rectificar). Queda el motivo. */
export async function reabrirPeriodo(tx: Transaccion, usuarioId: string, id: string, motivo: string) {
  const m = motivo.trim()
  if (m.length < 5) return { ok: false as const, error: 'Escribí por qué se reabre (queda registrado).' }
  const [g] = await tx.select().from(presentaciones).where(eq(presentaciones.id, id)).for('update')
  if (!g || g.estado !== 'presentada') return { ok: false as const, error: 'Esa presentación no está presentada.' }
  await tx
    .update(presentaciones)
    .set({ estado: 'reabierta', reabierta: new Date(), motivo: m.slice(0, 500) })
    .where(eq(presentaciones.id, id))
  await auditar(tx, {
    usuarioId,
    accion: 'modificacion',
    entidad: 'presentacion',
    entidadId: id,
    despues: { estado: 'reabierta', motivo: m },
  })
  return { ok: true as const }
}

export async function listarPresentaciones(tx: Transaccion, impuesto: Impuesto, periodo?: string) {
  return tx
    .select({
      id: presentaciones.id,
      periodo: presentaciones.periodo,
      secuencia: presentaciones.secuencia,
      estado: presentaciones.estado,
      nombreArchivo: presentaciones.nombreArchivo,
      resumen: presentaciones.resumen,
      creado: presentaciones.creado,
      presentada: presentaciones.presentada,
      transaccion: presentaciones.transaccion,
      motivo: presentaciones.motivo,
    })
    .from(presentaciones)
    .where(and(eq(presentaciones.impuesto, impuesto), periodo ? eq(presentaciones.periodo, periodo) : sql`true`))
    .orderBy(desc(presentaciones.periodo), desc(presentaciones.creado))
    .limit(60)
}

export async function archivoPresentacion(tx: Transaccion, id: string) {
  const [p] = await tx
    .select({ archivo: presentaciones.archivo, nombreArchivo: presentaciones.nombreArchivo })
    .from(presentaciones)
    .where(eq(presentaciones.id, id))
  return p ?? null
}
