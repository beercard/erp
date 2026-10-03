import { createHash, randomBytes } from 'node:crypto'

import { numero, pedirJson } from './http'
import type { Conector, Fetch, ItemPedidoCanal, PedidoCanal, ProductoCanal } from './tipos'

/**
 * Mercado Libre (Argentina). La aplicación la registra una sola vez la
 * plataforma (ML_CLIENT_ID y ML_CLIENT_SECRET); cada empresa la autoriza con
 * su cuenta. El token dura 6 horas y se renueva con el refresh token (que es
 * de un solo uso: hay que guardar siempre el nuevo).
 */

const API = 'https://api.mercadolibre.com'
const AUTORIZAR = 'https://auth.mercadolibre.com.ar/authorization'

export type CredencialesML = { acceso: string; renovacion: string; vence: number; usuario: string }

export const mlConfigurado = () => Boolean(process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET)

/** PKCE: el verificador queda en el flujo firmado; a Mercado Libre va su hash. */
export function nuevoVerificador() {
  return randomBytes(32).toString('base64url')
}

export function urlAutorizacion(state: string, verificador: string, vuelta: string) {
  const desafio = createHash('sha256').update(verificador).digest('base64url')
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.ML_CLIENT_ID ?? '',
    redirect_uri: vuelta,
    state,
    code_challenge: desafio,
    code_challenge_method: 'S256',
  })
  return `${AUTORIZAR}?${q}`
}

type RespuestaToken = { access_token: string; refresh_token: string; expires_in: number; user_id: number }

const aCredenciales = (t: RespuestaToken, ahora: number): CredencialesML => ({
  acceso: t.access_token,
  renovacion: t.refresh_token,
  // Cinco minutos de margen.
  vence: ahora + (t.expires_in - 300) * 1000,
  usuario: String(t.user_id),
})

export async function canjearCodigo(f: Fetch, codigo: string, verificador: string, vuelta: string, ahora = Date.now()) {
  const t = await pedirJson<RespuestaToken>(f, `${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.ML_CLIENT_ID ?? '',
      client_secret: process.env.ML_CLIENT_SECRET ?? '',
      code: codigo,
      redirect_uri: vuelta,
      code_verifier: verificador,
    }),
  })
  return aCredenciales(t, ahora)
}

export async function renovar(f: Fetch, c: CredencialesML, ahora = Date.now()): Promise<CredencialesML> {
  const t = await pedirJson<RespuestaToken>(f, `${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ML_CLIENT_ID ?? '',
      client_secret: process.env.ML_CLIENT_SECRET ?? '',
      refresh_token: c.renovacion,
    }),
  })
  return aCredenciales(t, ahora)
}

export async function nombreDeCuenta(f: Fetch, c: CredencialesML) {
  const yo = await pedirJson<{ nickname?: string }>(f, `${API}/users/me`, { headers: { authorization: `Bearer ${c.acceso}` } })
  return yo.nickname ?? `Usuario ${c.usuario}`
}

type Atributo = { id: string; value_name?: string | null }
type Variacion = {
  id: number
  price?: number
  available_quantity?: number
  seller_custom_field?: string | null
  attributes?: Atributo[]
}
type Item = {
  id: string
  title: string
  permalink?: string
  price?: number
  available_quantity?: number
  seller_custom_field?: string | null
  attributes?: Atributo[]
  variations?: Variacion[]
}

const skuDe = (x: { seller_custom_field?: string | null; attributes?: Atributo[] }) =>
  x.attributes?.find((a) => a.id === 'SELLER_SKU')?.value_name || x.seller_custom_field || null

type OrdenML = {
  id: number
  status: string
  date_created: string
  currency_id: string
  total_amount: number
  buyer?: { id?: number; nickname?: string; first_name?: string; last_name?: string }
  order_items: {
    item: { id: string; title: string; variation_id?: number | null; seller_sku?: string | null }
    quantity: number
    unit_price: number
  }[]
}

export function pedidoDeML(o: OrdenML, documento: string | null = null): PedidoCanal {
  const nombre = [o.buyer?.first_name, o.buyer?.last_name].filter(Boolean).join(' ') || o.buyer?.nickname || 'Comprador'
  return {
    externoId: String(o.id),
    numero: String(o.id),
    fecha: new Date(o.date_created),
    estado: o.status === 'paid' ? 'pagado' : o.status === 'cancelled' || o.status === 'invalid' ? 'cancelado' : 'pendiente',
    moneda: o.currency_id,
    total: o.total_amount,
    comprador: {
      nombre: o.buyer?.nickname && !nombre.includes(o.buyer.nickname) ? `${nombre} (${o.buyer.nickname})` : nombre,
      email: null,
      documento,
      telefono: null,
    },
    items: o.order_items.map((i): ItemPedidoCanal => ({
      externoId: i.item.id,
      varianteId: i.item.variation_id ? String(i.item.variation_id) : '',
      sku: i.item.seller_sku ?? null,
      titulo: i.item.title,
      cantidad: i.quantity,
      precioUnitario: i.unit_price,
    })),
  }
}

/** Mercado Libre espera las fechas con el huso explícito. */
const fechaML = (d: Date) => d.toISOString().replace('Z', '-00:00')

export function conectorML(f: Fetch, c: CredencialesML): Conector {
  const h = { authorization: `Bearer ${c.acceso}`, accept: 'application/json' }
  const get = <T>(ruta: string) => pedirJson<T>(f, `${API}${ruta}`, { headers: h })

  async function documentoDe(id: string) {
    try {
      const b = await get<{ billing_info?: { doc_type?: string; doc_number?: string } }>(`/orders/${id}/billing_info`)
      return b.billing_info?.doc_number ?? null
    } catch {
      return null
    }
  }

  return {
    async productos() {
      const ids: string[] = []
      let scroll: string | undefined
      for (let vuelta = 0; vuelta < 200; vuelta++) {
        const q = new URLSearchParams({ status: 'active', search_type: 'scan', limit: '100' })
        if (scroll) q.set('scroll_id', scroll)
        const r = await get<{ results: string[]; scroll_id?: string }>(`/users/${c.usuario}/items/search?${q}`)
        if (!r.results.length) break
        ids.push(...r.results)
        scroll = r.scroll_id
        if (!scroll) break
      }
      const productos: ProductoCanal[] = []
      for (let i = 0; i < ids.length; i += 20) {
        const lote = ids.slice(i, i + 20).join(',')
        const r = await get<{ code: number; body: Item }[]>(`/items?ids=${lote}&include_attributes=all`)
        for (const { code, body: it } of r) {
          if (code !== 200) continue
          if (it.variations?.length) {
            for (const v of it.variations) {
              productos.push({
                externoId: it.id,
                varianteId: String(v.id),
                sku: skuDe(v),
                titulo: it.title,
                enlace: it.permalink ?? null,
                precio: numero(v.price ?? it.price),
                stock: numero(v.available_quantity),
              })
            }
          } else {
            productos.push({
              externoId: it.id,
              varianteId: '',
              sku: skuDe(it),
              titulo: it.title,
              enlace: it.permalink ?? null,
              precio: numero(it.price),
              stock: numero(it.available_quantity),
            })
          }
        }
      }
      return productos
    },

    async actualizar(p, cambios) {
      const datos: Record<string, number> = {}
      if (cambios.stock !== undefined) datos.available_quantity = Math.max(0, Math.floor(cambios.stock))
      if (cambios.precio !== undefined) datos.price = cambios.precio
      if (!Object.keys(datos).length) return
      const cuerpo = p.varianteId ? { variations: [{ id: Number(p.varianteId), ...datos }] } : datos
      await pedirJson(f, `${API}/items/${p.externoId}`, {
        method: 'PUT',
        headers: { ...h, 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
    },

    async pedidosDesde(desde) {
      const pedidos: PedidoCanal[] = []
      for (let offset = 0; offset < 2_000; offset += 50) {
        const q = new URLSearchParams({
          seller: c.usuario,
          'order.date_last_updated.from': fechaML(desde),
          sort: 'date_asc',
          limit: '50',
          offset: String(offset),
        })
        const r = await get<{ results: OrdenML[]; paging?: { total?: number } }>(`/orders/search?${q}`)
        for (const o of r.results) pedidos.push(pedidoDeML(o, o.status === 'paid' ? await documentoDe(String(o.id)) : null))
        if (r.results.length < 50) break
      }
      return pedidos
    },

    async pedido(id) {
      const o = await get<OrdenML>(`/orders/${encodeURIComponent(id)}`)
      return pedidoDeML(o, o.status === 'paid' ? await documentoDe(String(o.id)) : null)
    },
  }
}
