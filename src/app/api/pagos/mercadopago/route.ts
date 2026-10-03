import { after } from 'next/server'

import { firmaValida, procesarAviso } from '@/modulos/plataforma/mercadopago'

/**
 * Notificaciones de Mercado Pago (se configuran en la aplicación de Vektra:
 * APP_URL/api/pagos/mercadopago, eventos de suscripciones). Sin firma válida
 * no se procesa nada; con firma, igual se consulta el cobro a Mercado Pago
 * antes de registrarlo.
 */
export async function POST(request: Request) {
  const url = new URL(request.url)
  const cuerpo = (await request.json().catch(() => null)) as { type?: string; data?: { id?: string | number } } | null
  const tipo = cuerpo?.type ?? url.searchParams.get('type') ?? ''
  const id = url.searchParams.get('data.id') ?? (cuerpo?.data?.id !== undefined ? String(cuerpo.data.id) : null)
  if (!firmaValida(request.headers.get('x-signature'), request.headers.get('x-request-id'), id)) {
    return new Response('Firma inválida.', { status: 401 })
  }
  if (id && tipo) {
    after(async () => {
      try {
        await procesarAviso(fetch, tipo, id)
      } catch (e) {
        console.error('[mercadopago]', tipo, id, e instanceof Error ? e.message : e)
      }
    })
  }
  return new Response(null, { status: 200 })
}
