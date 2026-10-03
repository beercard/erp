import { facturaParaApi } from '@/modulos/facturacion/externa'

import { conApi, error, UUID } from '../../_lib/api'

/** GET /api/v1/facturas/<id>: la factura con su CAE y el enlace público para verla o imprimirla. */
export async function GET(request: Request, { params }: RouteContext<'/api/v1/facturas/[id]'>) {
  const { id } = await params
  if (!UUID.test(id)) return error(404, 'No existe esa factura.')
  return conApi(request, { funciones: ['facturacion'] }, async (tx, acceso) => {
    const f = await facturaParaApi(tx, acceso.empresaId, id)
    return f ? Response.json(f) : error(404, 'No existe esa factura.')
  })
}
