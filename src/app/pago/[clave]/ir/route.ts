import { headers } from 'next/headers'

import { ipDe } from '@/lib/auth/servidor'
import { anotar, claveIp, superado } from '@/lib/frenos'
import { base, iniciarPago } from '@/modulos/cobros/cobros'

/** "Pagar con…": arma el checkout en la pasarela elegida y lleva ahí. */
export async function POST(request: Request, { params }: RouteContext<'/pago/[clave]/ir'>) {
  const { clave } = await params
  const volver = (error?: string) =>
    Response.redirect(`${base()}/pago/${encodeURIComponent(clave)}${error ? `?error=${encodeURIComponent(error)}` : ''}`, 303)
  const ip = claveIp('cobros-iniciar', ipDe(await headers()))
  if (await superado([ip], 20, 60 * 60_000)) return volver('Hubo muchos intentos seguidos. Probá en un rato.')
  await anotar([ip])
  const fd = await request.formData().catch(() => null)
  const r = await iniciarPago(clave, String(fd?.get('proveedor') ?? ''))
  if (!r.ok) return volver(r.error)
  // Solo se redirige a las pasarelas (https).
  return /^https:\/\//.test(r.url) ? Response.redirect(r.url, 303) : volver('La pasarela devolvió un link inválido.')
}
