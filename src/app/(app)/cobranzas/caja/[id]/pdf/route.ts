import { enLaEmpresa } from '@/lib/auth/servidor'
import { datosReporte, pdfCierre } from '@/modulos/tesoreria/reporteCierre'

/** Reporte del cierre en PDF. */
export async function GET(_: Request, { params }: RouteContext<'/cobranzas/caja/[id]/pdf'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 })
  const r = await enLaEmpresa('ventas.ver', (tx) => datosReporte(tx, id))
  if (!r) return new Response(null, { status: 404 })
  return new Response(Buffer.from(pdfCierre(r.cierre, r.empresa)), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="cierre-${id.slice(0, 8)}.pdf"`,
      'cache-control': 'private, no-store',
    },
  })
}
