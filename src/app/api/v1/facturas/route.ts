import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { z } from 'zod'

import { comprobantes, terceros } from '@/db/schema'
import { clienteArca } from '@/modulos/arca/cliente'
import { autorizarYMandar, borradorExterno, buscarEnPadron, puntoVentaElectronico } from '@/modulos/facturacion/automatica'
import { aFacturaDeLote, EsquemaFacturaExterna, errorDeValidacion, facturaParaApi } from '@/modulos/facturacion/externa'
import { hoyArgentina } from '@/lib/fechas'

import { accesoApi, conApi, cuerpo, enApi, error, ErrorApi, paginado, respuesta } from '../_lib/api'

/** GET /api/v1/facturas?desde=&hasta=&cliente=&estado=&offset=&limit= */
export async function GET(request: Request) {
  return conApi(request, { funciones: ['facturacion'] }, async (tx) => {
    const p = paginado(request)
    const v = (k: string) => p.params.get(k)?.trim() || null
    const filtro = and(
      v('desde') ? gte(comprobantes.fecha, v('desde')!) : undefined,
      v('hasta') ? lte(comprobantes.fecha, v('hasta')!) : undefined,
      v('estado') ? eq(comprobantes.estado, v('estado')!) : undefined,
      v('cliente') ? eq(terceros.numeroDocumento, v('cliente')!.replace(/\D/g, '')) : undefined,
      v('referencia') ? eq(comprobantes.referenciaExterna, v('referencia')!) : undefined,
    )
    const [{ total }] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(comprobantes)
      .innerJoin(terceros, eq(terceros.id, comprobantes.terceroId))
      .where(filtro)
    const filas = await tx
      .select({
        id: comprobantes.id,
        referencia: comprobantes.referenciaExterna,
        estado: comprobantes.estado,
        clase: comprobantes.clase,
        tipo: comprobantes.tipo,
        letra: comprobantes.letra,
        puntoVenta: comprobantes.puntoVenta,
        numero: comprobantes.numero,
        fecha: comprobantes.fecha,
        cae: comprobantes.cae,
        total: comprobantes.total,
        cliente: terceros.razonSocial,
        documento: terceros.numeroDocumento,
      })
      .from(comprobantes)
      .innerJoin(terceros, eq(terceros.id, comprobantes.terceroId))
      .where(filtro)
      .orderBy(desc(comprobantes.fecha), desc(comprobantes.creado))
      .offset(p.offset)
      .limit(p.limit)
    return respuesta(filas, p, total)
  })
}

const EsquemaPedido = EsquemaFacturaExterna.extend({
  puntoVenta: z.coerce.number().int().min(1).optional(),
  /** Pedir el CAE ahora (por defecto, sí). */
  autorizar: z.boolean().default(true),
  /** Mandarle la factura al cliente por email (por defecto, sí). */
  enviar: z.boolean().default(true),
})

/**
 * POST /api/v1/facturas: arma la factura, la autoriza en ARCA y se la manda
 * al cliente. El cliente va por CUIT o DNI (si no existe, se da de alta).
 * Con "referencia", repetir el pedido devuelve la misma factura.
 */
export async function POST(request: Request) {
  const a = await accesoApi(request, { escribe: true, funciones: ['facturacion'] })
  if ('respuesta' in a) return a.respuesta
  const { acceso } = a
  let datos: z.infer<typeof EsquemaPedido>
  try {
    const p = EsquemaPedido.safeParse(await cuerpo(request))
    if (!p.success) return error(422, errorDeValidacion(p.error))
    datos = p.data
  } catch (e) {
    if (e instanceof ErrorApi) return error(e.estado, e.message)
    throw e
  }
  const hoy = hoyArgentina()
  const b = await enApi(acceso, async (tx) => {
    const pv = datos.puntoVenta ?? (await puntoVentaElectronico(tx))
    if (!pv) return { ok: false as const, error: 'No hay un punto de venta electrónico para facturar.' }
    return borradorExterno(tx, acceso.usuarioId, aFacturaDeLote(datos), pv, hoy, buscarEnPadron)
  })
  if (!b.ok) return error(422, b.error)
  const factura = () => enApi(acceso, (tx) => facturaParaApi(tx, acceso.empresaId, b.id))
  if (b.repetida) return Response.json(await factura(), { status: 200 })
  const e = await autorizarYMandar(
    acceso.empresaId,
    b.id,
    { autorizar: datos.autorizar, enviar: datos.enviar, usuarioId: acceso.usuarioId },
    (tx, cuit) => clienteArca(tx, cuit),
    hoy,
  )
  const f = await factura()
  if (!e.ok) return Response.json({ ...f, error: `Quedó en borrador: ${e.error}` }, { status: 422 })
  return Response.json({ ...f, enviada: e.enviado }, { status: 201 })
}
