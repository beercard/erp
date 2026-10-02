import { and, asc, eq, gte, lte } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { excepcionesJornada, tecnicos } from '../../db/schema'
import { auditar } from '../../lib/auditoria'

/** Licencias, vacaciones, feriados y horarios especiales de los técnicos. */

const HORA = /^[0-2][0-9]:[0-5][0-9]$/

const Esquema = z
  .object({
    tecnicoId: z
      .string()
      .nullable()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || /^[0-9a-f-]{36}$/i.test(v), { error: 'Técnico inválido.' }),
    desde: z.iso.date({ error: 'Fecha desde inválida.' }),
    hasta: z.iso.date({ error: 'Fecha hasta inválida.' }),
    tipo: z.enum(['ausencia', 'horario']),
    jornadaDesde: z
      .string()
      .nullable()
      .optional()
      .transform((v) => v || null),
    jornadaHasta: z
      .string()
      .nullable()
      .optional()
      .transform((v) => v || null),
    motivo: z.string().trim().min(2, { error: 'Escribí el motivo (vacaciones, feriado, médico…).' }).max(120),
  })
  .refine((d) => d.hasta >= d.desde, { error: 'La fecha hasta no puede ser antes que la desde.' })
  .refine((d) => d.tipo === 'ausencia' || (HORA.test(d.jornadaDesde ?? '') && HORA.test(d.jornadaHasta ?? '')), {
    error: 'Escribí el horario especial (desde y hasta).',
  })
  .refine((d) => d.tipo === 'ausencia' || (d.jornadaHasta ?? '') > (d.jornadaDesde ?? ''), {
    error: 'El horario termina antes de empezar.',
  })

export async function guardarExcepcion(tx: Transaccion, usuarioId: string, entrada: unknown) {
  const p = Esquema.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Datos inválidos.' }
  const d = p.data
  if (d.tecnicoId) {
    const [t] = await tx.select({ id: tecnicos.id }).from(tecnicos).where(eq(tecnicos.id, d.tecnicoId))
    if (!t) return { ok: false as const, error: 'Ese técnico ya no existe.' }
  }
  const valores = {
    ...d,
    jornadaDesde: d.tipo === 'horario' ? d.jornadaDesde : null,
    jornadaHasta: d.tipo === 'horario' ? d.jornadaHasta : null,
  }
  const [e] = await tx.insert(excepcionesJornada).values(valores).returning({ id: excepcionesJornada.id })
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'excepcion_jornada', entidadId: e.id, despues: valores })
  return { ok: true as const, id: e.id }
}

export async function borrarExcepcion(tx: Transaccion, usuarioId: string, id: string) {
  const [e] = await tx.delete(excepcionesJornada).where(eq(excepcionesJornada.id, id)).returning()
  if (!e) return { ok: false as const, error: 'Ya no existe.' }
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'excepcion_jornada', entidadId: id, antes: e })
  return { ok: true as const }
}

/** Las que tocan un rango de fechas (para el asistente y el calendario). */
export async function excepcionesEntre(tx: Transaccion, desde: string, hasta: string) {
  return tx
    .select()
    .from(excepcionesJornada)
    .where(and(lte(excepcionesJornada.desde, hasta), gte(excepcionesJornada.hasta, desde)))
}

/** Las vigentes y las que vienen (y las de los últimos 30 días), con el nombre del técnico. */
export async function listarExcepciones(tx: Transaccion, desde: string) {
  return tx
    .select({ e: excepcionesJornada, tecnico: tecnicos.nombre })
    .from(excepcionesJornada)
    .leftJoin(tecnicos, eq(tecnicos.id, excepcionesJornada.tecnicoId))
    .where(gte(excepcionesJornada.hasta, desde))
    .orderBy(asc(excepcionesJornada.desde))
}
