import { turnstileSiteKey } from '@/lib/antibots'

/** La clave pública de Turnstile, leída al ejecutar (las páginas del sitio se generan al compilar, sin ella). */
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ siteKey: turnstileSiteKey() }, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
