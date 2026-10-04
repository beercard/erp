import { createHmac, timingSafeEqual } from 'node:crypto'

import { CAMPO_TIEMPO, CAMPO_TRAMPA, type MotivoBot } from './antibots'

/** Controles antibots del lado del servidor (ver src/lib/antibots.ts). */

type Fetch = typeof fetch

const SEGUNDOS_MINIMOS = 3
const HORAS_MAXIMAS = 24

export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY || null

const firma = (ms: number) =>
  createHmac('sha256', process.env.ERP_CLAVE_MAESTRA || 'sin-clave-maestra')
    .update(`antibots:${ms}`)
    .digest('base64url')
    .slice(0, 22)

/** Hora de apertura del formulario firmada por el servidor: no depende del reloj de la persona. */
export const sellarApertura = (ahora = Date.now()) => `${ahora}.${firma(ahora)}`

/** La hora de un sello válido, o null si falta o fue alterado. */
export function leerSello(sello: string): number | null {
  const [ms, f] = sello.split('.')
  const t = Number(ms)
  if (!ms || !f || !Number.isFinite(t)) return null
  const esperada = Buffer.from(firma(t))
  const recibida = Buffer.from(f)
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida) ? t : null
}

/**
 * Verifica el token del widget de Turnstile. Sin clave secreta configurada, no
 * exige nada. Si Cloudflare no responde o la clave del servidor está mal
 * cargada, deja pasar (y lo anota): un error de configuración no puede
 * frenar a todas las personas; quedan los demás controles.
 */
export async function verificarTurnstile(token: string | null, ip: string | null, f: Fetch = fetch): Promise<boolean> {
  const secreto = process.env.TURNSTILE_SECRET
  if (!secreto) return true
  if (!token) return false
  const cuerpo = new URLSearchParams({ secret: secreto, response: token })
  if (ip) cuerpo.set('remoteip', ip)
  try {
    const r = await f('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: cuerpo,
      signal: AbortSignal.timeout(10_000),
    })
    const d = (await r.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (d.success === true) return true
    const errores = d['error-codes'] ?? []
    if (errores.some((e) => e === 'invalid-input-secret' || e === 'missing-input-secret')) {
      console.error('[antibots] TURNSTILE_SECRET no es válida: revisala en el panel de Cloudflare.')
      return true
    }
    console.warn('[antibots] Turnstile rechazó el token:', errores.join(', ') || 'sin detalle')
    return false
  } catch {
    return true
  }
}

/**
 * Controla lo que manda el formulario. Devuelve el motivo del rechazo o null
 * si pasa. Cada acción lo anota en el registro del servidor.
 */
export async function controlarEnvio(
  fd: FormData,
  ip: string | null,
  ahora = Date.now(),
  f: Fetch = fetch,
): Promise<MotivoBot | null> {
  if (String(fd.get(CAMPO_TRAMPA) ?? '').trim()) return 'trampa'
  const abierto = leerSello(String(fd.get(CAMPO_TIEMPO) ?? ''))
  if (abierto === null || ahora - abierto > HORAS_MAXIMAS * 3600_000) return 'vencido'
  if (ahora - abierto < SEGUNDOS_MINIMOS * 1000) return 'rapido'
  const token = String(fd.get('cf-turnstile-response') ?? '') || null
  if (!(await verificarTurnstile(token, ip, f))) return 'turnstile'
  return null
}
