import { sellarApertura, turnstileSiteKey } from '@/lib/antibotsServidor'

/**
 * La clave pública de Turnstile (leída al ejecutar: las páginas del sitio se
 * generan al compilar, sin ella) y la hora de apertura firmada del formulario.
 */
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ siteKey: turnstileSiteKey(), sello: sellarApertura() }, { headers: { 'Cache-Control': 'no-store' } })
}
