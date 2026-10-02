import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { configuracionServicio } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { primerError } from '../comercial/documentos'

/** Configuración del servicio técnico de la empresa, con los valores por defecto si nunca se guardó. */
export async function obtenerConfiguracion(tx: Transaccion) {
  const [c] = await tx.select().from(configuracionServicio).limit(1)
  return (
    c ?? {
      respuestaNormal: 24,
      respuestaUrgente: 4,
      resolucionNormal: 72,
      resolucionUrgente: 24,
      emailCoordinacion: null as string | null,
      avisarVisita: true,
      avisarCierre: true,
      encuesta: true,
      firma: null as string | null,
      portal: false,
      portalOrdenes: true,
      portalContadores: true,
      portalColor: '#0f766e',
      radioGeocerca: 150,
    }
  )
}
export type ConfiguracionServicio = Awaited<ReturnType<typeof obtenerConfiguracion>>

const horas = (m: string) => z.coerce.number().int({ error: m }).min(1, { error: m }).max(2160, { error: m })

const Esquema = z
  .object({
    respuestaNormal: horas('Horas de respuesta (normal) inválidas.'),
    respuestaUrgente: horas('Horas de respuesta (urgente) inválidas.'),
    resolucionNormal: horas('Horas de resolución (normal) inválidas.'),
    resolucionUrgente: horas('Horas de resolución (urgente) inválidas.'),
    emailCoordinacion: z
      .string()
      .trim()
      .transform((v) => v || null)
      .pipe(z.email({ error: 'El email de coordinación no es válido.' }).nullable()),
    avisarVisita: z.boolean(),
    avisarCierre: z.boolean(),
    encuesta: z.boolean(),
    firma: z
      .string()
      .trim()
      .max(500)
      .transform((v) => v || null),
    portal: z.boolean().default(false),
    portalOrdenes: z.boolean().default(true),
    portalContadores: z.boolean().default(true),
    portalColor: z
      .string()
      .trim()
      .regex(/^#[0-9a-f]{6}$/i, { error: 'El color del portal no es válido.' })
      .default('#0f766e'),
    radioGeocerca: z.coerce
      .number()
      .int({ error: 'El radio va en metros.' })
      .min(30, { error: 'El radio va de 30 a 2000 metros.' })
      .max(2000, { error: 'El radio va de 30 a 2000 metros.' })
      .default(150),
  })
  .refine((d) => d.respuestaNormal <= d.resolucionNormal && d.respuestaUrgente <= d.resolucionUrgente, {
    error: 'La resolución no puede tener menos horas que la respuesta.',
  })

export async function guardarConfiguracion(tx: Transaccion, usuarioId: string, entrada: unknown) {
  const p = Esquema.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  await tx
    .insert(configuracionServicio)
    .values(p.data)
    .onConflictDoUpdate({ target: configuracionServicio.empresaId, set: p.data })
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'configuracion_servicio', despues: p.data })
  return { ok: true as const }
}
