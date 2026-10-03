import { conEmpresa } from '@/db/empresa'
import { leerEnlace } from '@/lib/enlaces'
import { datosReporte, pdfCierre } from '@/modulos/tesoreria/reporteCierre'

/** El PDF del cierre desde el enlace firmado que llega por WhatsApp. */
export async function GET(_: Request, { params }: RouteContext<'/cierre/[token]/pdf'>) {
  const { token } = await params
  const e = leerEnlace(decodeURIComponent(token), 'cierre')
  if (!e) return new Response(null, { status: 404 })
  const r = await conEmpresa(e.empresaId, (tx) => datosReporte(tx, e.id))
  if (!r) return new Response(null, { status: 404 })
  return new Response(Buffer.from(pdfCierre(r.cierre, r.empresa)), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="cierre-de-caja.pdf"',
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
    },
  })
}
