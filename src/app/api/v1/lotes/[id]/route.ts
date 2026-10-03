import { detalleLote } from '@/modulos/facturacion/automatica'

import { conApi, error, UUID } from '../../_lib/api'

/** GET /api/v1/lotes/<id>: el avance del lote y el estado de cada factura. */
export async function GET(request: Request, { params }: RouteContext<'/api/v1/lotes/[id]'>) {
  const { id } = await params
  if (!UUID.test(id)) return error(404, 'No existe ese lote.')
  return conApi(request, { funciones: ['facturacion'] }, async (tx) => {
    const d = await detalleLote(tx, id)
    if (!d) return error(404, 'No existe ese lote.')
    return Response.json({
      id: d.lote.id,
      nombre: d.lote.nombre,
      estado: d.lote.estado,
      autorizadas: d.autorizadas,
      borradores: d.borradores,
      total: d.total,
      facturas: d.facturas,
    })
  })
}
