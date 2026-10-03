import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'

import { equipos, ordenesServicio, terceros, tiposOrden } from '@/db/schema'
import { hoyArgentina } from '@/lib/fechas'
import { datosEvento, guardarOrden } from '@/modulos/servicio/servicio'
import { ESTADOS_ORDEN } from '@/modulos/servicio/tipos'

import { conApi, cuerpo, ErrorApi, paginado, respuesta, UUID } from '../_lib/api'

/** GET /api/v1/ordenes?estado=&cliente=&desde=&hasta=&offset=&limit= (desde/hasta: fecha del pedido) */
export async function GET(request: Request) {
  return conApi(request, { funciones: ['servicio'] }, async (tx) => {
    const p = paginado(request)
    const estado = p.params.get('estado')
    const cliente = p.params.get('cliente')
    const desde = p.params.get('desde')
    const hasta = p.params.get('hasta')
    const fecha = /^\d{4}-\d{2}-\d{2}$/
    const filtro = and(
      estado && estado in ESTADOS_ORDEN ? eq(ordenesServicio.estado, estado) : undefined,
      cliente && UUID.test(cliente) ? eq(ordenesServicio.terceroId, cliente) : undefined,
      desde && fecha.test(desde) ? gte(ordenesServicio.fecha, desde) : undefined,
      hasta && fecha.test(hasta) ? lte(ordenesServicio.fecha, hasta) : undefined,
    )
    const [{ total }] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(ordenesServicio)
      .where(filtro)
    const ids = await tx
      .select({ id: ordenesServicio.id })
      .from(ordenesServicio)
      .where(filtro)
      .orderBy(desc(ordenesServicio.numero))
      .offset(p.offset)
      .limit(p.limit)
    const filas = []
    for (const { id } of ids) {
      const { instrucciones, resultados, ...resto } = (await datosEvento(tx, id)) as Record<string, unknown>
      void instrucciones
      void resultados
      filas.push(resto)
    }
    return respuesta(filas, p, total)
  })
}

/**
 * POST /api/v1/ordenes: abre una orden (queda pendiente para que la
 * coordinación la programe). Cuerpo: { cliente: id o código, equipo?: id o
 * serie, tipo?: código, falla, prioridad?: normal|urgente, contacto?,
 * telefono?, email?, instrucciones?: { … } }
 */
export async function POST(request: Request) {
  return conApi(request, { escribe: true, funciones: ['servicio'] }, async (tx, acceso) => {
    const c = await cuerpo(request)
    const cliente = String(c.cliente ?? '').trim()
    const [t] = await tx
      .select({ id: terceros.id })
      .from(terceros)
      .where(UUID.test(cliente) ? eq(terceros.id, cliente) : eq(terceros.codigo, cliente))
    if (!t) throw new ErrorApi(422, 'No existe ese cliente (cliente: id o código).')
    let equipoId: string | null = null
    if (c.equipo) {
      const e = String(c.equipo).trim()
      const [eq_] = await tx
        .select({ id: equipos.id })
        .from(equipos)
        .where(and(eq(equipos.terceroId, t.id), UUID.test(e) ? eq(equipos.id, e) : eq(equipos.serie, e.toUpperCase())))
      if (!eq_) throw new ErrorApi(422, 'Ese equipo no está instalado en ese cliente (equipo: id o serie).')
      equipoId = eq_.id
    }
    let tipoOrdenId: string | null = null
    if (c.tipo) {
      const [tp] = await tx
        .select({ id: tiposOrden.id })
        .from(tiposOrden)
        .where(eq(tiposOrden.codigo, String(c.tipo).toUpperCase()))
      if (!tp) throw new ErrorApi(422, 'No existe ese tipo de orden (tipo: código).')
      tipoOrdenId = tp.id
    }
    const r = await guardarOrden(tx, acceso.claveId, {
      fecha: hoyArgentina(),
      terceroId: t.id,
      equipoId,
      tipoOrdenId,
      falla: c.falla,
      prioridad: c.prioridad ?? 'normal',
      contacto: c.contacto,
      telefono: c.telefono,
      email: c.email,
      instrucciones: c.instrucciones ?? {},
      origen: 'api',
    })
    if (!r.ok) throw new ErrorApi(422, r.error)
    return Response.json(await datosEvento(tx, r.id), { status: 201 })
  })
}
