import { tiposParaOrden } from '@/modulos/servicio/tiposOrden'

import { conApi } from '../_lib/api'

/** GET /api/v1/tipos-orden: los tipos activos con el formulario de instrucciones vigente. */
export async function GET(request: Request) {
  return conApi(request, { funciones: ['contratos'] }, async (tx) => {
    const tipos = await tiposParaOrden(tx)
    return Response.json({ resultados: tipos })
  })
}
