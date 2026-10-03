import { buscarCuenta } from '@/modulos/tiendas/canales'
import { importarPedidoPorId } from '@/modulos/tiendas/sincronizar'

import { enSegundoPlano } from '../../_lib/comun'

/**
 * Avisos de Mercado Libre (se configura en la aplicación: APP_URL/api/tiendas/mercadolibre/avisos,
 * tema orders_v2). No vienen firmados: no se confía en el contenido, solo se
 * usa para saber qué pedido ir a buscar, con el token del vendedor.
 */
export async function POST(request: Request) {
  const aviso = (await request.json().catch(() => null)) as { topic?: string; resource?: string; user_id?: number } | null
  const id = aviso?.resource?.match(/^\/orders\/(\d+)$/)?.[1]
  if (aviso?.user_id && id && (aviso.topic === 'orders_v2' || aviso.topic === 'orders')) {
    const cuenta = String(aviso.user_id)
    enSegundoPlano('aviso ML', async () => {
      const c = await buscarCuenta({ tipo: 'mercadolibre', cuenta })
      if (c) await importarPedidoPorId(c.empresaId, c.canalId, id)
    })
  }
  // Siempre 200 y rápido: si no, Mercado Libre reintenta y termina desactivando los avisos.
  return new Response(null, { status: 200 })
}
