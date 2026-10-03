import { asc, eq } from 'drizzle-orm'

import { ordenesServicioItems, ordenesServicioVisitas } from '@/db/schema'
import { datosEvento } from '@/modulos/servicio/servicio'

import { conApi, error, UUID } from '../../_lib/api'

/** GET /api/v1/ordenes/<id>: la orden con instrucciones, informe del técnico, visitas e insumos. */
export async function GET(request: Request, { params }: RouteContext<'/api/v1/ordenes/[id]'>) {
  const { id } = await params
  if (!UUID.test(id)) return error(404, 'No existe esa orden.')
  return conApi(request, { funciones: ['contratos'] }, async (tx) => {
    const o = await datosEvento(tx, id)
    if (!('numero' in o)) return error(404, 'No existe esa orden.')
    const [visitas, items] = await Promise.all([
      tx
        .select({
          fecha: ordenesServicioVisitas.fecha,
          horas: ordenesServicioVisitas.horas,
          detalle: ordenesServicioVisitas.detalle,
        })
        .from(ordenesServicioVisitas)
        .where(eq(ordenesServicioVisitas.ordenId, id))
        .orderBy(asc(ordenesServicioVisitas.creado)),
      tx
        .select({
          articuloId: ordenesServicioItems.articuloId,
          descripcion: ordenesServicioItems.descripcion,
          cantidad: ordenesServicioItems.cantidad,
          precioUnitario: ordenesServicioItems.precioUnitario,
        })
        .from(ordenesServicioItems)
        .where(eq(ordenesServicioItems.ordenId, id))
        .orderBy(asc(ordenesServicioItems.creado)),
    ])
    return Response.json({ ...o, visitas, items })
  })
}
