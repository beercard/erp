import { after } from 'next/server'

import { buscarClave, pagoPorExterno, secretoDelPago, secretoDePasarela, verificarPago } from '@/modulos/cobros/cobros'
import { firmaClover, firmaMercadoPago } from '@/modulos/cobros/pasarelas'

/**
 * Avisos de las pasarelas. La clave de la dirección dice de qué pago (o de
 * qué pasarela, para Clover) es. El aviso nunca aprueba un pago por sí solo:
 * dispara la consulta a la pasarela con las claves de la empresa.
 */

const ok = () => new Response(null, { status: 200 })

function enSegundoPlano(trabajo: () => Promise<unknown>) {
  after(async () => {
    try {
      await trabajo()
    } catch (e) {
      console.error('[cobros] aviso', e instanceof Error ? e.message : e)
    }
  })
}

async function leer(request: Request, cuerpo: string): Promise<Record<string, unknown>> {
  if (!cuerpo) return {}
  try {
    return JSON.parse(cuerpo) as Record<string, unknown>
  } catch {
    return Object.fromEntries(new URLSearchParams(cuerpo))
  }
}

async function recibir(request: Request, clave: string) {
  const c = await buscarClave(clave)
  // La clave pública del link (tipo "pago") no sirve acá: solo la secreta de avisos o la de la pasarela.
  if (!c || c.tipo === 'pago') return new Response(null, { status: 404 })
  const cuerpo = (await request.text()).slice(0, 100_000)
  const d = await leer(request, cuerpo)
  const q = new URL(request.url).searchParams

  if (c.tipo === 'pasarela') {
    // Clover: un solo webhook por comercio, firmado; el pago se ubica por el id del checkout.
    const s = await secretoDePasarela(c.empresaId, c.id)
    if (!s || s.proveedor !== 'clover' || !s.secreto) return new Response(null, { status: 404 })
    if (!firmaClover(request.headers.get('clover-signature'), cuerpo, s.secreto))
      return new Response('Firma inválida.', { status: 401 })
    const sesion = typeof d.data === 'string' ? d.data : null
    const pagoExterno = typeof d.id === 'string' ? d.id : null
    if (sesion && pagoExterno) {
      enSegundoPlano(async () => {
        const id = await pagoPorExterno(c.empresaId, c.id, sesion)
        if (id) await verificarPago(c.empresaId, id, { pagoId: pagoExterno, estado: String(d.status ?? '') })
      })
    }
    return ok()
  }

  const s = await secretoDelPago(c.empresaId, c.id)
  if (!s) return ok()
  if (s.proveedor === 'mercadopago') {
    const datos = (d.data ?? {}) as { id?: string | number }
    const dataId = q.get('data.id') ?? q.get('id') ?? (datos.id != null ? String(datos.id) : null)
    const tipo = q.get('type') ?? q.get('topic') ?? (typeof d.type === 'string' ? d.type : '')
    if (
      s.secreto &&
      !firmaMercadoPago({
        firma: request.headers.get('x-signature'),
        requestId: request.headers.get('x-request-id'),
        dataId,
        secreto: s.secreto,
      })
    ) {
      return new Response('Firma inválida.', { status: 401 })
    }
    if (tipo === 'payment' && dataId) enSegundoPlano(() => verificarPago(c.empresaId, c.id, { pagoId: dataId }))
    return ok()
  }
  if (s.proveedor === 'gocuotas') {
    // Sin firma: la dirección es secreta y propia de este pago, y la referencia tiene que coincidir.
    if (String(d.order_reference_id ?? '') !== c.id) return ok()
    enSegundoPlano(() => verificarPago(c.empresaId, c.id, { estado: String(d.status ?? '') }))
    return ok()
  }
  // Payway y otros: se vuelve a consultar.
  enSegundoPlano(() => verificarPago(c.empresaId, c.id))
  return ok()
}

export async function POST(request: Request, { params }: RouteContext<'/api/cobros/aviso/[clave]'>) {
  return recibir(request, (await params).clave)
}

export async function GET(request: Request, { params }: RouteContext<'/api/cobros/aviso/[clave]'>) {
  return recibir(request, (await params).clave)
}
