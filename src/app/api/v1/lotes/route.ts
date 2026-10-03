import { z } from 'zod'

import { crearLote, buscarEnPadron } from '@/modulos/facturacion/automatica'
import { aFacturaDeLote, EsquemaFacturaExterna, errorDeValidacion } from '@/modulos/facturacion/externa'

import { conApi, cuerpo, error } from '../_lib/api'

const EsquemaLote = z.object({
  nombre: z.string().trim().min(1).max(120).default('Lote por API'),
  puntoVenta: z.coerce.number().int().min(1).optional(),
  autorizar: z.boolean().default(true),
  enviar: z.boolean().default(true),
  facturas: z.array(EsquemaFacturaExterna).min(1).max(500),
})

/**
 * POST /api/v1/lotes: hasta 500 facturas de una vez. Se arman como borradores
 * y se autorizan en segundo plano (la tarea periódica); el avance se consulta
 * en GET /api/v1/lotes/<id>.
 */
export async function POST(request: Request) {
  return conApi(request, { escribe: true, funciones: ['facturacion'] }, async (tx, acceso) => {
    const p = EsquemaLote.safeParse(await cuerpo(request))
    if (!p.success) return error(422, errorDeValidacion(p.error))
    const r = await crearLote(
      tx,
      acceso.usuarioId,
      { ...p.data, facturas: p.data.facturas.map(aFacturaDeLote) },
      undefined,
      buscarEnPadron,
    )
    if (!r.ok) return Response.json({ error: r.error, errores: r.errores ?? [] }, { status: 422 })
    return Response.json({ id: r.id, armadas: r.armadas, errores: r.errores }, { status: 201 })
  })
}
