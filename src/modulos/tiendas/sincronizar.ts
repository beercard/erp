import Decimal from 'decimal.js'
import { and, eq, inArray, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import { articulos, canalesVenta, listasPrecios, pedidos, pedidosCanal, publicacionesCanal, terceros } from '../../db/schema'
import { soloDigitos, validarCuit } from '../../lib/cuit'
import { hoyArgentina } from '../../lib/fechas'
import { TASAS_IVA } from '../comercial/calculo'
import { cancelarPedido, guardarPedido } from '../comercial/documentos'
import { saldos } from '../comercial/stock'
import { direccionPermitida } from '../integraciones/webhooks'
import { preciosVigentes } from '../maestros/articulos'
import { guardarTercero } from '../maestros/terceros'
import { credencialesDe, guardarCredenciales, type Canal } from './canales'
import { ErrorCanal } from './http'
import { conectorML, renovar, type CredencialesML } from './mercadolibre'
import { conectorTN, type CredencialesTN } from './tiendanube'
import { NOMBRES_CANAL, type Conector, type Fetch, type PedidoCanal, type TipoCanal } from './tipos'
import { conectorMagento, type CredencialesMagento } from './magento'
import { conectorPrestashop, type CredencialesPrestashop } from './prestashop'
import { conectorShopify, type CredencialesShopify } from './shopify'
import { conectorWoo, type CredencialesWoo } from './woocommerce'

/**
 * El motor: trae las publicaciones de la tienda (y las vincula a los
 * artículos por SKU = código), le manda stock y precios cuando cambian y
 * convierte sus pedidos pagados en pedidos del ERP.
 *
 * Lo que va por la red queda FUERA de las transacciones: se lee, se llama a
 * la plataforma y se graba en otra transacción corta.
 */

const MAXIMO_ENVIOS = 300

async function leerCanal(empresaId: string, canalId: string) {
  const [c] = await conEmpresa(empresaId, (tx) => tx.select().from(canalesVenta).where(eq(canalesVenta.id, canalId)))
  if (!c) throw new ErrorCanal('Ese canal ya no existe.')
  if (c.estado === 'desconectado') throw new ErrorCanal('El canal está desconectado.')
  return c
}

/** El conector listo para usar (con el token de Mercado Libre renovado si hacía falta). */
export async function conectorDe(empresaId: string, canal: Canal, f: Fetch = fetch, ahora = Date.now()): Promise<Conector> {
  switch (canal.tipo as TipoCanal) {
    case 'mercadolibre': {
      let c = credencialesDe<CredencialesML>(canal)
      if (c.vence <= ahora) {
        c = await renovar(f, c, ahora)
        const nuevas = c
        await conEmpresa(empresaId, (tx) => guardarCredenciales(tx, canal.id, nuevas))
      }
      return conectorML(f, c)
    }
    case 'tiendanube':
      return conectorTN(f, credencialesDe<CredencialesTN>(canal))
    case 'woocommerce': {
      const c = credencialesDe<CredencialesWoo>(canal)
      // La dirección la escribió el usuario: nunca hacia la red interna del servidor.
      const problema = await direccionPermitida(c.url)
      if (problema) throw new ErrorCanal(`La dirección de la tienda no se puede usar: ${problema}`)
      return conectorWoo(f, c)
    }
    case 'shopify': {
      const c = credencialesDe<CredencialesShopify>(canal)
      // La ubicación del stock se elige una vez y se recuerda.
      return conectorShopify(f, c, (ubicacion) =>
        conEmpresa(empresaId, (tx) => guardarCredenciales(tx, canal.id, { ...c, ubicacion })),
      )
    }
    case 'magento':
    case 'prestashop': {
      const c = credencialesDe<CredencialesMagento | CredencialesPrestashop>(canal)
      const problema = await direccionPermitida(c.url)
      if (problema) throw new ErrorCanal(`La dirección de la tienda no se puede usar: ${problema}`)
      return canal.tipo === 'magento'
        ? conectorMagento(f, c as CredencialesMagento)
        : conectorPrestashop(f, c as CredencialesPrestashop)
    }
  }
  throw new ErrorCanal('Tipo de canal desconocido.')
}

async function anotarError(empresaId: string, canalId: string, e: unknown) {
  const mensaje = e instanceof Error ? e.message : String(e)
  const rechazo = e instanceof ErrorCanal && (e.estado === 401 || e.estado === 403)
  await conEmpresa(empresaId, (tx) =>
    tx
      .update(canalesVenta)
      .set({ ultimoError: mensaje.slice(0, 500), ...(rechazo ? { estado: 'error' } : {}) })
      .where(eq(canalesVenta.id, canalId)),
  )
  return mensaje
}

// ------------------------------------------------------------ Publicaciones

export async function traerPublicaciones(empresaId: string, canalId: string, f: Fetch = fetch) {
  const canal = await leerCanal(empresaId, canalId)
  const conector = await conectorDe(empresaId, canal, f)
  const productos = await conector.productos()
  return conEmpresa(empresaId, async (tx) => {
    const existentes = await tx.select().from(publicacionesCanal).where(eq(publicacionesCanal.canalId, canalId))
    const clave = (e: string, v: string) => `${e}|${v}`
    const porClave = new Map(existentes.map((p) => [clave(p.externoId, p.varianteId), p]))
    // Vínculo automático: SKU de la tienda = código (o código de barras) del artículo.
    const arts = await tx
      .select({ id: articulos.id, codigo: articulos.codigo, barras: articulos.codigoBarras })
      .from(articulos)
      .where(eq(articulos.activo, true))
    const porCodigo = new Map<string, string>()
    for (const a of arts) {
      porCodigo.set(a.codigo.trim().toLowerCase(), a.id)
      if (a.barras) porCodigo.set(a.barras.trim().toLowerCase(), a.id)
    }
    let nuevas = 0
    let vinculadas = 0
    const vistas = new Set<string>()
    for (const p of productos) {
      // Solo enlaces web (lo que manda la plataforma no se usa tal cual en un href).
      if (p.enlace && !/^https?:\/\//i.test(p.enlace)) p.enlace = null
      const k = clave(p.externoId, p.varianteId)
      vistas.add(k)
      const previa = porClave.get(k)
      const articuloId = previa?.articuloId ?? (p.sku ? (porCodigo.get(p.sku.trim().toLowerCase()) ?? null) : null)
      if (articuloId && !previa?.articuloId) vinculadas++
      if (previa) {
        await tx
          .update(publicacionesCanal)
          .set({ sku: p.sku, titulo: p.titulo, enlace: p.enlace, articuloId, activa: true, actualizado: new Date() })
          .where(eq(publicacionesCanal.id, previa.id))
      } else {
        nuevas++
        await tx.insert(publicacionesCanal).values({
          canalId,
          externoId: p.externoId,
          varianteId: p.varianteId,
          sku: p.sku,
          titulo: p.titulo,
          enlace: p.enlace,
          articuloId,
          // Lo que tiene publicado hoy: si coincide con el ERP, no se reenvía.
          stockEnviado: p.stock === null ? null : String(p.stock),
          precioEnviado: p.precio === null ? null : String(p.precio),
        })
      }
    }
    const fuera = existentes.filter((p) => p.activa && !vistas.has(clave(p.externoId, p.varianteId))).map((p) => p.id)
    if (fuera.length) await tx.update(publicacionesCanal).set({ activa: false }).where(inArray(publicacionesCanal.id, fuera))
    await tx.update(canalesVenta).set({ ultimaSincronizacion: new Date(), ultimoError: null }).where(eq(canalesVenta.id, canalId))
    return { total: productos.length, nuevas, vinculadas, sinVincular: productos.length - (await contarVinculadas(tx, canalId)) }
  })
}

async function contarVinculadas(tx: Transaccion, canalId: string) {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(publicacionesCanal)
    .where(
      and(
        eq(publicacionesCanal.canalId, canalId),
        eq(publicacionesCanal.activa, true),
        sql`${publicacionesCanal.articuloId} is not null`,
      ),
    )
  return r.n
}

// ------------------------------------------------------- Stock y precios

/** Lo que el ERP quiere publicado para cada publicación vinculada. */
export async function deseado(tx: Transaccion, canal: Canal) {
  const pubs = await tx
    .select()
    .from(publicacionesCanal)
    .where(
      and(
        eq(publicacionesCanal.canalId, canal.id),
        eq(publicacionesCanal.activa, true),
        sql`${publicacionesCanal.articuloId} is not null`,
      ),
    )
  const ids = [...new Set(pubs.map((p) => p.articuloId!))]
  if (!ids.length) return []
  const arts = new Map(
    (
      await tx
        .select({ id: articulos.id, alicuotaIva: articulos.alicuotaIva, llevaStock: articulos.llevaStock })
        .from(articulos)
        .where(inArray(articulos.id, ids))
    ).map((a) => [a.id, a]),
  )
  const stock = new Map<string, Decimal>()
  for (const s of await saldos(tx, ids)) {
    if (canal.depositoId && s.depositoId !== canal.depositoId) continue
    stock.set(s.articuloId, (stock.get(s.articuloId) ?? new Decimal(0)).plus(s.cantidad))
  }
  let precios = new Map<string, { precio: string; moneda: string }>()
  let conIva = false
  if (canal.enviarPrecios && canal.listaPreciosId) {
    precios = await preciosVigentes(tx, canal.listaPreciosId, ids)
    const [lista] = await tx.select().from(listasPrecios).where(eq(listasPrecios.id, canal.listaPreciosId))
    conIva = Boolean(lista?.incluyeIva)
  }
  return pubs.map((p) => {
    const a = arts.get(p.articuloId!)
    const cambios: { stock?: number; precio?: number } = {}
    if (canal.enviarStock && a?.llevaStock) {
      cambios.stock = Math.max(0, Math.floor((stock.get(p.articuloId!) ?? new Decimal(0)).toNumber()))
    }
    const pr = precios.get(p.articuloId!)
    // Las tiendas publican el precio final: si la lista es sin IVA, se le suma el del artículo. Solo en pesos.
    if (pr && pr.moneda === 'PES' && a) {
      const tasa = new Decimal(TASAS_IVA[a.alicuotaIva] ?? '21').div(100)
      cambios.precio = (conIva ? new Decimal(pr.precio) : new Decimal(pr.precio).times(tasa.plus(1)))
        .toDecimalPlaces(2)
        .toNumber()
    }
    const pendientes: { stock?: number; precio?: number } = {}
    if (cambios.stock !== undefined && (p.stockEnviado === null || Number(p.stockEnviado) !== cambios.stock))
      pendientes.stock = cambios.stock
    if (cambios.precio !== undefined && (p.precioEnviado === null || Number(p.precioEnviado) !== cambios.precio))
      pendientes.precio = cambios.precio
    return { publicacion: p, pendientes }
  })
}

export async function enviarStockYPrecios(empresaId: string, canalId: string, f: Fetch = fetch) {
  const canal = await leerCanal(empresaId, canalId)
  const lista = (await conEmpresa(empresaId, (tx) => deseado(tx, canal)))
    .filter((d) => Object.keys(d.pendientes).length)
    .slice(0, MAXIMO_ENVIOS)
  if (!lista.length) return { enviados: 0, errores: 0 }
  const conector = await conectorDe(empresaId, canal, f)
  const resultados: { id: string; ok: boolean; error?: string; enviado: { stock?: number; precio?: number } }[] = []
  for (const d of lista) {
    try {
      await conector.actualizar(d.publicacion, d.pendientes)
      resultados.push({ id: d.publicacion.id, ok: true, enviado: d.pendientes })
    } catch (e) {
      resultados.push({ id: d.publicacion.id, ok: false, error: e instanceof Error ? e.message : String(e), enviado: {} })
      // Si la plataforma rechaza la conexión, no tiene sentido seguir.
      if (e instanceof ErrorCanal && (e.estado === 401 || e.estado === 403)) {
        await anotarError(empresaId, canalId, e)
        break
      }
    }
  }
  await conEmpresa(empresaId, async (tx) => {
    for (const r of resultados) {
      await tx
        .update(publicacionesCanal)
        .set(
          r.ok
            ? {
                ...(r.enviado.stock !== undefined ? { stockEnviado: String(r.enviado.stock) } : {}),
                ...(r.enviado.precio !== undefined ? { precioEnviado: String(r.enviado.precio) } : {}),
                enviadoEn: new Date(),
                error: null,
              }
            : { error: r.error!.slice(0, 300) },
        )
        .where(eq(publicacionesCanal.id, r.id))
    }
    await tx.update(canalesVenta).set({ ultimaSincronizacion: new Date() }).where(eq(canalesVenta.id, canalId))
  })
  return { enviados: resultados.filter((r) => r.ok).length, errores: resultados.filter((r) => !r.ok).length }
}

// ------------------------------------------------------------- Pedidos

/** Cliente del pedido: por documento, por email o, si la tienda no da ninguno, el genérico del canal. */
async function clienteDe(tx: Transaccion, canal: Canal, p: PedidoCanal): Promise<string> {
  const doc = p.comprador.documento ? soloDigitos(p.comprador.documento) : ''
  const tipoDoc = doc.length === 11 && validarCuit(doc).valido ? 80 : doc.length >= 7 && doc.length <= 8 ? 96 : null
  if (tipoDoc) {
    const [t] = await tx.select({ id: terceros.id }).from(terceros).where(eq(terceros.numeroDocumento, doc)).limit(1)
    if (t) return t.id
  }
  const email = p.comprador.email?.trim().toLowerCase()
  if (email) {
    const [t] = await tx
      .select({ id: terceros.id })
      .from(terceros)
      .where(and(sql`lower(${terceros.email}) = ${email}`, eq(terceros.esCliente, true)))
      .limit(1)
    if (t) return t.id
  }
  if (tipoDoc || email) {
    const r = await guardarTercero(tx, null, {
      razonSocial: p.comprador.nombre.slice(0, 120),
      esCliente: true,
      esProveedor: false,
      tipoDocumento: String(tipoDoc ?? 99),
      numeroDocumento: tipoDoc ? doc : '',
      condicionIva: '5',
      email: email ?? '',
      telefono: p.comprador.telefono ?? '',
      notas: `Alta automática por una venta en ${NOMBRES_CANAL[canal.tipo as TipoCanal]}.`,
    })
    if (r.ok) return r.id
  }
  const codigo = `${canal.tipo.slice(0, 2).toUpperCase()}-CF`
  const [g] = await tx.select({ id: terceros.id }).from(terceros).where(eq(terceros.codigo, codigo))
  if (g) return g.id
  const r = await guardarTercero(tx, null, {
    codigo,
    razonSocial: `Consumidor final (${NOMBRES_CANAL[canal.tipo as TipoCanal]})`,
    esCliente: true,
    esProveedor: false,
    tipoDocumento: '99',
    condicionIva: '5',
    notas: 'Ventas de la tienda sin datos del comprador.',
  })
  if (!r.ok) throw new ErrorCanal('No se pudo crear el cliente genérico del canal.')
  return r.id
}

export type ResultadoImportacion = 'importado' | 'cancelado' | 'ignorado' | 'repetido' | 'esperando' | 'error'

/** Convierte un pedido de la tienda en un pedido del ERP. Idempotente: repetirlo no duplica. */
export async function importarPedido(tx: Transaccion, canal: Canal, p: PedidoCanal): Promise<ResultadoImportacion> {
  const [previo] = await tx
    .select()
    .from(pedidosCanal)
    .where(and(eq(pedidosCanal.canalId, canal.id), eq(pedidosCanal.externoId, p.externoId)))
  const registrar = async (estado: 'importado' | 'error' | 'ignorado', detalle: string | null, pedidoId: string | null) => {
    const valores = {
      estado,
      detalle,
      pedidoId,
      numero: p.numero,
      comprador: p.comprador.nombre.slice(0, 200),
      total: String(p.total),
      fecha: p.fecha,
      datos: { items: p.items, estado: p.estado } as never,
      actualizado: new Date(),
    }
    if (previo) await tx.update(pedidosCanal).set(valores).where(eq(pedidosCanal.id, previo.id))
    else await tx.insert(pedidosCanal).values({ ...valores, canalId: canal.id, externoId: p.externoId })
  }

  if (previo?.estado === 'importado') {
    if (p.estado === 'cancelado' && previo.pedidoId) {
      const [ped] = await tx.select({ estado: pedidos.estado }).from(pedidos).where(eq(pedidos.id, previo.pedidoId))
      if (ped?.estado === 'pendiente') {
        await cancelarPedido(tx, null, previo.pedidoId)
        await registrar('importado', 'Cancelado en la tienda: se canceló el pedido.', previo.pedidoId)
        return 'cancelado'
      }
    }
    return 'repetido'
  }
  if (p.estado === 'pendiente') return 'esperando'
  if (p.estado === 'cancelado') {
    await registrar('ignorado', 'Cancelado antes de pagarse.', null)
    return 'ignorado'
  }
  if (!['ARS', 'PES'].includes(p.moneda)) {
    await registrar('error', `El pedido está en ${p.moneda}: solo se importan pedidos en pesos.`, null)
    return 'error'
  }

  // Cada renglón: la publicación vinculada o, si no, el SKU igual al código del artículo.
  const pubs = await tx.select().from(publicacionesCanal).where(eq(publicacionesCanal.canalId, canal.id))
  const skus = p.items.map((i) => i.sku?.trim()).filter((s): s is string => Boolean(s))
  const porCodigo = new Map(
    skus.length
      ? (
          await tx
            .select({ id: articulos.id, codigo: articulos.codigo })
            .from(articulos)
            .where(
              inArray(
                sql`lower(${articulos.codigo})`,
                skus.map((s) => s.toLowerCase()),
              ),
            )
        ).map((a) => [a.codigo.toLowerCase(), a.id])
      : [],
  )
  const articuloDe = (i: PedidoCanal['items'][number]) =>
    pubs.find((x) => x.externoId === i.externoId && x.varianteId === i.varianteId)?.articuloId ??
    pubs.find((x) => x.externoId === i.externoId && x.varianteId === '')?.articuloId ??
    (i.sku ? porCodigo.get(i.sku.trim().toLowerCase()) : undefined) ??
    null
  const ids = [...new Set(p.items.map(articuloDe).filter((x): x is string => Boolean(x)))]
  const alicuotas = new Map(
    ids.length
      ? (await tx.select({ id: articulos.id, a: articulos.alicuotaIva }).from(articulos).where(inArray(articulos.id, ids))).map(
          (x) => [x.id, x.a],
        )
      : [],
  )
  const items = p.items.map((i) => {
    const articuloId = articuloDe(i)
    const alicuota = (articuloId && alicuotas.get(articuloId)) || 5
    // La tienda cobra el precio final: el pedido lleva el neto y el IVA aparte.
    const neto = new Decimal(i.precioUnitario).div(new Decimal(TASAS_IVA[alicuota] ?? '21').div(100).plus(1))
    return {
      articuloId,
      descripcion: i.titulo.slice(0, 200),
      cantidad: String(i.cantidad),
      precioUnitario: neto.toDecimalPlaces(4).toString(),
      alicuotaIva: alicuota,
    }
  })
  const sinVincular = items.filter((i) => !i.articuloId).length

  try {
    const terceroId = await clienteDe(tx, canal, p)
    const contacto = [p.comprador.email, p.comprador.telefono].filter(Boolean).join(' · ')
    const r = await guardarPedido(
      tx,
      null,
      {
        terceroId,
        fecha: hoyArgentina(p.fecha),
        moneda: 'PES',
        cotizacion: '1',
        listaPreciosId: canal.listaPreciosId,
        depositoId: canal.depositoId,
        observaciones: `${NOMBRES_CANAL[canal.tipo as TipoCanal]} #${p.numero} · ${p.comprador.nombre}${contacto ? ` · ${contacto}` : ''}`,
        items,
      },
      undefined,
      { origen: canal.tipo, idExterno: p.externoId },
    )
    if (!r.ok) {
      await registrar('error', r.error, null)
      return 'error'
    }
    await registrar(
      'importado',
      sinVincular ? `${sinVincular} renglón${sinVincular === 1 ? '' : 'es'} sin artículo vinculado (no descuentan stock).` : null,
      r.id,
    )
    return 'importado'
  } catch (e) {
    await registrar('error', (e instanceof Error ? e.message : String(e)).slice(0, 300), null)
    return 'error'
  }
}

/** Un pedido puntual (el de un aviso de la plataforma). */
export async function importarPedidoPorId(empresaId: string, canalId: string, externoId: string, f: Fetch = fetch) {
  const canal = await leerCanal(empresaId, canalId)
  if (!canal.traerPedidos) return 'ignorado' as const
  const conector = await conectorDe(empresaId, canal, f)
  const p = await conector.pedido(externoId)
  if (!p) return 'ignorado' as const
  return conEmpresa(empresaId, (tx) => importarPedido(tx, canal, p))
}

/** Los pedidos nuevos o cambiados desde la última vuelta (con una hora de margen). */
export async function traerPedidos(empresaId: string, canalId: string, f: Fetch = fetch, ahora = new Date()) {
  const canal = await leerCanal(empresaId, canalId)
  if (!canal.traerPedidos) return { importados: 0, errores: 0 }
  const desde = canal.pedidosHasta
    ? new Date(canal.pedidosHasta.getTime() - 3_600_000)
    : new Date(ahora.getTime() - 3 * 86_400_000)
  const conector = await conectorDe(empresaId, canal, f)
  const lista = await conector.pedidosDesde(desde)
  let importados = 0
  let errores = 0
  for (const p of lista) {
    const r = await conEmpresa(empresaId, (tx) => importarPedido(tx, canal, p))
    if (r === 'importado') importados++
    if (r === 'error') errores++
  }
  await conEmpresa(empresaId, (tx) =>
    tx.update(canalesVenta).set({ pedidosHasta: ahora, ultimoError: null }).where(eq(canalesVenta.id, canalId)),
  )
  return { importados, errores }
}

/** Una vuelta completa de un canal: pedidos, y stock y precios. Para la tarea periódica y el botón "Sincronizar". */
export async function sincronizarCanal(empresaId: string, canalId: string, f: Fetch = fetch) {
  try {
    const pedidosR = await traerPedidos(empresaId, canalId, f)
    const envios = await enviarStockYPrecios(empresaId, canalId, f)
    return { ok: true as const, ...pedidosR, ...envios }
  } catch (e) {
    return { ok: false as const, error: await anotarError(empresaId, canalId, e) }
  }
}

/** Todos los canales conectados de una empresa (tarea periódica). */
export async function sincronizarEmpresa(empresaId: string, f: Fetch = fetch) {
  const canales = await conEmpresa(empresaId, (tx) =>
    tx.select({ id: canalesVenta.id }).from(canalesVenta).where(eq(canalesVenta.estado, 'conectado')),
  )
  let importados = 0
  let errores = 0
  for (const c of canales) {
    const r = await sincronizarCanal(empresaId, c.id, f)
    if (r.ok) importados += r.importados
    else errores++
  }
  return { canales: canales.length, importados, errores }
}
