import { conEmpresa } from '@/db/empresa'
import { buscarCuenta, desconectarCanal } from '@/modulos/tiendas/canales'
import { importarPedidoPorId } from '@/modulos/tiendas/sincronizar'
import { avisoValido, normalizarTiendaShopify } from '@/modulos/tiendas/shopify'

import { enSegundoPlano } from '../../_lib/comun'

/**
 * Avisos de Shopify: pedidos pagados y cancelados, desinstalación de la app y
 * los obligatorios de privacidad. Vienen firmados con el secreto de la app.
 */
export async function POST(request: Request) {
  const cuerpo = await request.text()
  if (!avisoValido(cuerpo, request.headers.get('x-shopify-hmac-sha256'))) return new Response('Firma inválida.', { status: 401 })
  const topico = request.headers.get('x-shopify-topic') ?? ''
  const tienda = normalizarTiendaShopify(request.headers.get('x-shopify-shop-domain') ?? '')
  if (!tienda) return new Response(null, { status: 200 })
  let id: string | null = null
  try {
    id = String((JSON.parse(cuerpo) as { id?: number | string }).id ?? '') || null
  } catch {
    return new Response(null, { status: 200 })
  }
  if (topico.startsWith('orders/') && id) {
    const pedido = id
    enSegundoPlano('aviso Shopify', async () => {
      const c = await buscarCuenta({ tipo: 'shopify', cuenta: tienda })
      if (c) await importarPedidoPorId(c.empresaId, c.canalId, pedido)
    })
  }
  if (topico === 'app/uninstalled' || topico === 'shop/redact') {
    // La tienda quitó la app: el token ya no sirve y se borra.
    enSegundoPlano('baja Shopify', async () => {
      const c = await buscarCuenta({ tipo: 'shopify', cuenta: tienda })
      if (c) await conEmpresa(c.empresaId, (tx) => desconectarCanal(tx, null, c.canalId))
    })
  }
  // customers/data_request y customers/redact: el ERP no guarda datos de compradores fuera de los pedidos del comercio, que son suyos.
  return new Response(null, { status: 200 })
}
