import { and, asc, eq, ilike, sql } from 'drizzle-orm'

import { equipos, modelosEquipo, terceros } from '@/db/schema'

import { conApi, paginado, respuesta, UUID } from '../_lib/api'

/** GET /api/v1/equipos?cliente=<id>&serie=&estado=instalado|retirado&offset=&limit= */
export async function GET(request: Request) {
  return conApi(request, { funciones: ['contratos'] }, async (tx) => {
    const p = paginado(request)
    const cliente = p.params.get('cliente')
    const serie = p.params.get('serie')?.trim()
    const estado = p.params.get('estado')
    const filtro = and(
      cliente && UUID.test(cliente) ? eq(equipos.terceroId, cliente) : undefined,
      serie ? ilike(equipos.serie, `%${serie}%`) : undefined,
      estado === 'instalado' || estado === 'retirado' ? eq(equipos.estado, estado) : undefined,
    )
    const [{ total }] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(equipos)
      .where(filtro)
    const filas = await tx
      .select({
        id: equipos.id,
        serie: equipos.serie,
        modelo: modelosEquipo.nombre,
        clienteId: equipos.terceroId,
        cliente: terceros.razonSocial,
        contratoId: equipos.contratoId,
        estado: equipos.estado,
        domicilio: equipos.domicilio,
        localidad: equipos.localidad,
        sector: equipos.sector,
        ultimoContador: sql<
          number | null
        >`(select l.contador from lecturas l where l.equipo_id = ${equipos.id} order by l.fecha desc limit 1)`,
      })
      .from(equipos)
      .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
      .leftJoin(terceros, eq(terceros.id, equipos.terceroId))
      .where(filtro)
      .orderBy(asc(equipos.serie))
      .offset(p.offset)
      .limit(p.limit)
    return respuesta(filas, p, total)
  })
}
