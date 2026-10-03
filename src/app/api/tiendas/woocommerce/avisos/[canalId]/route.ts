import { eq } from 'drizzle-orm'

import { descifrar } from '@/modulos/arca/certificado'
import { conEmpresa } from '@/db/empresa'
import { canalesVenta } from '@/db/schema'
import { buscarCuenta } from '@/modulos/tiendas/canales'
import { importarPedidoPorId } from '@/modulos/tiendas/sincronizar'
import { firmaValida } from '@/modulos/tiendas/woocommerce'

import { enSegundoPlano } from '../../../_lib/comun'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Avisos de WooCommerce (pedido creado o modificado), firmados con el secreto propio del canal. */
export async function POST(request: Request, { params }: { params: Promise<{ canalId: string }> }) {
  const { canalId } = await params
  const cuerpo = await request.text()
  // Al crear el aviso, WooCommerce manda una prueba ("webhook_id=…"): se contesta y nada más.
  if (cuerpo.startsWith('webhook_id=')) return new Response(null, { status: 200 })
  if (!UUID.test(canalId)) return new Response(null, { status: 404 })
  const cuenta = await buscarCuenta({ canalId })
  if (!cuenta) return new Response(null, { status: 404 })
  const [canal] = await conEmpresa(cuenta.empresaId, (tx) =>
    tx.select({ secreto: canalesVenta.secretoAvisos }).from(canalesVenta).where(eq(canalesVenta.id, canalId)),
  )
  if (!canal?.secreto || !firmaValida(cuerpo, request.headers.get('x-wc-webhook-signature'), descifrar(canal.secreto))) {
    return new Response('Firma inválida.', { status: 401 })
  }
  const id = (JSON.parse(cuerpo) as { id?: number }).id
  if (id) enSegundoPlano('aviso Woo', () => importarPedidoPorId(cuenta.empresaId, canalId, String(id)))
  return new Response(null, { status: 200 })
}
