import { after } from 'next/server'

import { atenderEntrantes } from '@/modulos/whatsapp/atender'
import { recibirAviso, verificarSuscripcion } from '@/modulos/whatsapp/whatsapp'

/**
 * Webhook de WhatsApp Cloud API de cada empresa (la clave de la dirección
 * dice de cuál). GET: Meta verifica la dirección con el token de verificación.
 * POST: mensajes y estados, firmados con el app secret de la empresa.
 */
export async function GET(request: Request, { params }: RouteContext<'/api/whatsapp/[clave]'>) {
  const desafio = await verificarSuscripcion((await params).clave, new URL(request.url).searchParams)
  return desafio
    ? new Response(desafio, { status: 200, headers: { 'content-type': 'text/plain' } })
    : new Response(null, { status: 403 })
}

export async function POST(request: Request, { params }: RouteContext<'/api/whatsapp/[clave]'>) {
  const cuerpo = (await request.text()).slice(0, 2_000_000)
  const nuevos = await recibirAviso((await params).clave, cuerpo, request.headers.get('x-hub-signature-256'))
  if (nuevos === null) return new Response('Firma inválida.', { status: 401 })
  if (nuevos.length) {
    // Meta pide respuesta rápida: lo demás (leer facturas, contestar con el agente) va después.
    after(async () => {
      try {
        await atenderEntrantes(nuevos)
      } catch (e) {
        console.error('[whatsapp] atender', e instanceof Error ? e.message : e)
      }
    })
  }
  return new Response(null, { status: 200 })
}
