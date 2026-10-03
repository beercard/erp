'use server'

import { responderEncuesta } from '@/modulos/servicio/avisos'

export type Estado = { error?: string; ok?: boolean } | undefined

/** Respuesta del cliente (sin sesión: el enlace lleva la empresa y el secreto). */
export async function responderAccion(token: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await responderEncuesta(token, {
    puntaje: Number(formData.get('puntaje')),
    nps: Number(formData.get('nps') ?? -1),
    comentario: String(formData.get('comentario') ?? ''),
  })
  return r.ok ? { ok: true } : { error: r.error }
}
