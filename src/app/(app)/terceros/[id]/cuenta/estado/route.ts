import { enLaEmpresa } from '@/lib/auth/servidor'
import { estadoDeuda, pdfEstadoDeuda } from '@/modulos/facturacion/cobranza'

/** Estado de cuenta del cliente en PDF. */
export async function GET(_: Request, { params }: RouteContext<'/terceros/[id]/cuenta/estado'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 })
  const e = await enLaEmpresa('ventas.ver', (tx) => estadoDeuda(tx, id))
  if (!e) return new Response(null, { status: 404 })
  return new Response(Buffer.from(pdfEstadoDeuda(e)), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="estado-de-cuenta-${id.slice(0, 8)}.pdf"`,
      'cache-control': 'private, no-store',
    },
  })
}
