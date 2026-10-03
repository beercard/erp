import { headers } from 'next/headers'

import { ipDe } from '@/lib/auth/servidor'
import { anotar, claveIp, superado } from '@/lib/frenos'
import { recibirConsulta } from '@/modulos/crm/extras'

/**
 * Recepción pública del formulario web del CRM: el sitio de la empresa manda
 * nombre, empresa, email, teléfono, interés y mensaje (como formulario HTML o
 * JSON) y se crea la oportunidad. Tiene trampa para robots (campo "web" que
 * debe llegar vacío) y un tope de 10 consultas por hora por conexión.
 * Con "volver" (una dirección https), el navegador vuelve a esa página.
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

const HORA = 60 * 60_000

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

async function leer(request: Request): Promise<Record<string, string>> {
  const tipo = request.headers.get('content-type') ?? ''
  if (tipo.includes('application/json')) {
    const d = (await request.json().catch(() => ({}))) as Record<string, unknown>
    return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, String(v ?? '')]))
  }
  const f = await request.formData().catch(() => null)
  return f
    ? (Object.fromEntries([...f.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : ''])) as Record<string, string>)
    : {}
}

const volverSeguro = (v: string | undefined) => {
  try {
    const u = new URL(v ?? '')
    return u.protocol === 'https:' || (u.protocol === 'http:' && !!process.env.WEBHOOKS_PERMITIR_LOCAL) ? u.toString() : null
  } catch {
    return null
  }
}

function respuesta(ok: boolean, mensaje: string, volver: string | null, status = 200) {
  if (volver) {
    const u = new URL(volver)
    u.searchParams.set(ok ? 'enviado' : 'error', ok ? '1' : mensaje)
    return Response.redirect(u.toString(), 303)
  }
  return Response.json(ok ? { ok: true } : { ok: false, error: mensaje }, { status, headers: CORS })
}

export async function POST(request: Request, { params }: RouteContext<'/api/crm/formulario/[token]'>) {
  const { token } = await params
  const datos = await leer(request)
  const volver = volverSeguro(datos.volver)
  // Trampa: los robots completan todos los campos; una persona no ve "web".
  if (datos.web) return respuesta(true, '', volver)
  const ip = claveIp('crm-formulario', ipDe(await headers()))
  if (await superado([ip], 10, HORA))
    return respuesta(false, 'Recibimos muchas consultas desde tu conexión. Probá más tarde.', volver, 429)
  await anotar([ip])
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return respuesta(false, 'Formulario inexistente.', volver, 404)
  const r = await recibirConsulta(token, datos)
  return r.ok ? respuesta(true, '', volver) : respuesta(false, r.error, volver, r.error === 'Formulario inexistente.' ? 404 : 400)
}
