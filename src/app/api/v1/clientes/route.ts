import { and, asc, eq, ilike, or, sql } from 'drizzle-orm'

import { terceros } from '@/db/schema'

import { conApi, paginado, respuesta } from '../_lib/api'

/** GET /api/v1/clientes?q=&offset=&limit= */
export async function GET(request: Request) {
  return conApi(request, {}, async (tx) => {
    const p = paginado(request)
    const q = p.params.get('q')?.trim()
    const filtro = and(
      eq(terceros.esCliente, true),
      q
        ? or(ilike(terceros.razonSocial, `%${q}%`), ilike(terceros.codigo, `%${q}%`), ilike(terceros.numeroDocumento, `%${q}%`))
        : undefined,
    )
    const [{ total }] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(terceros)
      .where(filtro)
    const filas = await tx
      .select({
        id: terceros.id,
        codigo: terceros.codigo,
        razonSocial: terceros.razonSocial,
        documento: terceros.numeroDocumento,
        email: terceros.email,
        telefono: terceros.telefono,
        domicilio: terceros.domicilio,
        localidad: terceros.localidad,
        activo: terceros.activo,
      })
      .from(terceros)
      .where(filtro)
      .orderBy(asc(terceros.razonSocial))
      .offset(p.offset)
      .limit(p.limit)
    return respuesta(filas, p, total)
  })
}
