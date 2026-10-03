import { conEmpresa } from '@/db/empresa'
import { leerEnlace } from '@/lib/enlaces'
import { estadoDeuda, pdfEstadoDeuda } from '@/modulos/facturacion/cobranza'

/** El estado de cuenta en PDF, desde el enlace firmado del recordatorio. */
export async function GET(_: Request, { params }: RouteContext<'/deuda/[token]/pdf'>) {
  const { token } = await params
  const e = leerEnlace(decodeURIComponent(token), 'deuda')
  if (!e) return new Response(null, { status: 404 })
  const d = await conEmpresa(e.empresaId, (tx) => estadoDeuda(tx, e.id))
  if (!d) return new Response(null, { status: 404 })
  return new Response(Buffer.from(pdfEstadoDeuda(d)), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="estado-de-cuenta.pdf"',
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
    },
  })
}
