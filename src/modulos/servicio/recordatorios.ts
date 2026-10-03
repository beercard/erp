import { and, asc, desc, eq, isNotNull, isNull, lte } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { equipos, recordatorios, terceros } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { opcionalUuid, primerError } from '../comercial/documentos'
import { sumarDias } from './agenda'

/** Recordatorios por cliente (los "seguimientos" de Persat), con aviso por email unos días antes. */

const Esquema = z.object({
  terceroId: z.uuid({ error: 'Elegí el cliente.' }),
  equipoId: opcionalUuid,
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  hora: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null)
    .pipe(
      z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Hora inválida.' })
        .nullable(),
    ),
  titulo: z.string().trim().min(3, { error: 'Escribí de qué es el recordatorio.' }).max(120),
  detalle: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => v || null),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default('#2563eb'),
  avisarA: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null)
    .pipe(z.email({ error: 'El email para el aviso no es válido.' }).nullable()),
  diasAntes: z.coerce.number().int().min(0).max(60).default(1),
})

export async function guardarRecordatorio(tx: Transaccion, usuarioId: string, entrada: unknown) {
  const p = Esquema.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  if (p.data.equipoId) {
    const [e] = await tx.select({ terceroId: equipos.terceroId }).from(equipos).where(eq(equipos.id, p.data.equipoId))
    if (!e || e.terceroId !== p.data.terceroId) return { ok: false as const, error: 'El equipo no es de ese cliente.' }
  }
  const [r] = await tx
    .insert(recordatorios)
    .values({ ...p.data, usuarioId })
    .returning({ id: recordatorios.id })
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'recordatorio', entidadId: r.id, despues: p.data })
  return { ok: true as const, id: r.id }
}

/** Hecho (o deshacer). */
export async function marcarRecordatorio(tx: Transaccion, usuarioId: string, id: string, hecho: boolean) {
  const [r] = await tx
    .update(recordatorios)
    .set({ hecho: hecho ? new Date() : null })
    .where(eq(recordatorios.id, id))
    .returning({ id: recordatorios.id })
  if (!r) return { ok: false as const, error: 'Ese recordatorio ya no existe.' }
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'recordatorio', entidadId: id, despues: { hecho } })
  return { ok: true as const }
}

export async function listarRecordatorios(
  tx: Transaccion,
  filtro: { estado?: 'pendientes' | 'hechos'; terceroId?: string } = {},
) {
  const hechos = filtro.estado === 'hechos'
  return tx
    .select({
      id: recordatorios.id,
      fecha: recordatorios.fecha,
      hora: recordatorios.hora,
      titulo: recordatorios.titulo,
      detalle: recordatorios.detalle,
      color: recordatorios.color,
      avisarA: recordatorios.avisarA,
      diasAntes: recordatorios.diasAntes,
      avisado: recordatorios.avisado,
      hecho: recordatorios.hecho,
      terceroId: recordatorios.terceroId,
      cliente: terceros.razonSocial,
      serie: equipos.serie,
    })
    .from(recordatorios)
    .innerJoin(terceros, eq(terceros.id, recordatorios.terceroId))
    .leftJoin(equipos, eq(equipos.id, recordatorios.equipoId))
    .where(
      and(
        hechos ? isNotNull(recordatorios.hecho) : isNull(recordatorios.hecho),
        filtro.terceroId ? eq(recordatorios.terceroId, filtro.terceroId) : undefined,
      ),
    )
    .orderBy(hechos ? desc(recordatorios.fecha) : asc(recordatorios.fecha), asc(recordatorios.hora))
    .limit(300)
}

/** Pendientes hasta dentro de `dias` días (para el encabezado del servicio técnico). */
export async function recordatoriosProximos(tx: Transaccion, hoy: string, dias = 7) {
  return tx
    .select({ id: recordatorios.id })
    .from(recordatorios)
    .where(and(isNull(recordatorios.hecho), lte(recordatorios.fecha, sumarDias(hoy, dias))))
}
