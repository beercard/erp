import { buscarCuenta } from '@/modulos/tiendas/canales'
import { importarPedidoPorId } from '@/modulos/tiendas/sincronizar'
import { firmaValida } from '@/modulos/tiendas/tiendanube'

import { enSegundoPlano } from '../../_lib/comun'

/**
 * Avisos de Tienda Nube (pedidos pagados y cancelados, y los obligatorios de
 * privacidad). Vienen firmados con el secreto de la aplicación: sin firma
 * válida no se hace nada.
 */
export async function POST(request: Request) {
  const cuerpo = await request.text()
  if (!firmaValida(cuerpo, request.headers.get('x-linkedstore-hmac-sha256'))) {
    return new Response('Firma inválida.', { status: 401 })
  }
  let aviso: { store_id?: number | string; event?: string; id?: number | string } | null = null
  try {
    aviso = JSON.parse(cuerpo)
  } catch {
    return new Response(null, { status: 200 })
  }
  if (aviso?.store_id && aviso.id && aviso.event?.startsWith('order/')) {
    const cuenta = String(aviso.store_id)
    const id = String(aviso.id)
    enSegundoPlano('aviso TN', async () => {
      const c = await buscarCuenta({ tipo: 'tiendanube', cuenta })
      if (c) await importarPedidoPorId(c.empresaId, c.canalId, id)
    })
  }
  // store/redact, customers/redact y customers/data_request: el ERP no guarda
  // datos de la tienda fuera de los pedidos del comercio, que son suyos.
  return new Response(null, { status: 200 })
}
