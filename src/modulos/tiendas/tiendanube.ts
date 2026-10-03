import { createHmac, timingSafeEqual } from 'node:crypto'

import { numero, pedirJson } from './http'
import type { Conector, Fetch, PedidoCanal, ProductoCanal } from './tipos'

/**
 * Tienda Nube. La aplicación la registra la plataforma en el portal de socios
 * (TIENDANUBE_APP_ID y TIENDANUBE_CLIENT_SECRET, con la dirección de vuelta
 * APP_URL/api/tiendas/tiendanube/vuelta). El token no vence: vale hasta que
 * la tienda desinstala la aplicación.
 */

const API = 'https://api.tiendanube.com/v1'

export type CredencialesTN = { acceso: string; tienda: string }

export const tnConfigurado = () => Boolean(process.env.TIENDANUBE_APP_ID && process.env.TIENDANUBE_CLIENT_SECRET)

export function urlAutorizacion(state: string) {
  return `https://www.tiendanube.com/apps/${encodeURIComponent(process.env.TIENDANUBE_APP_ID ?? '')}/authorize?state=${encodeURIComponent(state)}`
}

export async function canjearCodigo(f: Fetch, codigo: string): Promise<CredencialesTN> {
  const t = await pedirJson<{ access_token: string; user_id: number | string }>(
    f,
    'https://www.tiendanube.com/apps/authorize/token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.TIENDANUBE_APP_ID,
        client_secret: process.env.TIENDANUBE_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: codigo,
      }),
    },
  )
  return { acceso: t.access_token, tienda: String(t.user_id) }
}

/** Los avisos vienen firmados: HMAC-SHA256 del cuerpo con el secreto de la aplicación, en hexadecimal. */
export function firmaValida(cuerpo: string, firma: string | null) {
  const secreto = process.env.TIENDANUBE_CLIENT_SECRET
  if (!secreto || !firma) return false
  const esperada = Buffer.from(createHmac('sha256', secreto).update(cuerpo).digest('hex'))
  const recibida = Buffer.from(firma.trim().toLowerCase())
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
}

const texto = (v: unknown) =>
  typeof v === 'string' ? v : v && typeof v === 'object' ? String(Object.values(v as Record<string, string>)[0] ?? '') : ''
const nombreDe = (v: unknown) => (v && typeof v === 'object' && 'es' in v ? String((v as { es: string }).es) : texto(v))

type Variante = { id: number; sku?: string | null; price?: string | null; stock?: number | null }
type Producto = { id: number; name: unknown; canonical_url?: string; variants: Variante[] }
type OrdenTN = {
  id: number
  number: number
  created_at: string
  status: string
  payment_status: string
  currency: string
  total: string
  customer?: { name?: string; email?: string; identification?: string; phone?: string }
  products: {
    product_id: number
    variant_id: number
    sku?: string | null
    name: string
    quantity: number | string
    price: string
  }[]
}

export function pedidoDeTN(o: OrdenTN): PedidoCanal {
  return {
    externoId: String(o.id),
    numero: String(o.number),
    fecha: new Date(o.created_at),
    estado: o.status === 'cancelled' ? 'cancelado' : o.payment_status === 'paid' ? 'pagado' : 'pendiente',
    moneda: o.currency,
    total: numero(o.total) ?? 0,
    comprador: {
      nombre: o.customer?.name || 'Comprador',
      email: o.customer?.email || null,
      documento: o.customer?.identification || null,
      telefono: o.customer?.phone || null,
    },
    items: o.products.map((p) => ({
      externoId: String(p.product_id),
      varianteId: String(p.variant_id),
      sku: p.sku || null,
      titulo: p.name,
      cantidad: numero(p.quantity) ?? 0,
      precioUnitario: numero(p.price) ?? 0,
    })),
  }
}

export function conectorTN(f: Fetch, c: CredencialesTN): Conector {
  const h = {
    Authentication: `bearer ${c.acceso}`,
    'User-Agent': `Vektra ERP (${process.env.SOPORTE_EMAIL ?? 'soporte@vektra.com.ar'})`,
    'content-type': 'application/json',
  }
  const base = `${API}/${encodeURIComponent(c.tienda)}`
  const get = <T>(ruta: string) => pedirJson<T>(f, `${base}${ruta}`, { headers: h })

  return {
    async productos() {
      const productos: ProductoCanal[] = []
      for (let pagina = 1; pagina <= 100; pagina++) {
        let lote: Producto[]
        try {
          lote = await get<Producto[]>(`/products?per_page=200&page=${pagina}`)
        } catch (e) {
          // Pasada la última página, Tienda Nube contesta 404.
          if ((e as { estado?: number }).estado === 404) break
          throw e
        }
        for (const p of lote) {
          for (const v of p.variants) {
            productos.push({
              externoId: String(p.id),
              varianteId: String(v.id),
              sku: v.sku || null,
              titulo: nombreDe(p.name),
              enlace: p.canonical_url ?? null,
              precio: numero(v.price),
              stock: numero(v.stock),
            })
          }
        }
        if (lote.length < 200) break
      }
      return productos
    },

    async actualizar(p, cambios) {
      const datos: Record<string, string | number> = {}
      if (cambios.stock !== undefined) datos.stock = Math.max(0, Math.floor(cambios.stock))
      if (cambios.precio !== undefined) datos.price = cambios.precio.toFixed(2)
      if (!Object.keys(datos).length) return
      await pedirJson(f, `${base}/products/${encodeURIComponent(p.externoId)}/variants/${encodeURIComponent(p.varianteId)}`, {
        method: 'PUT',
        headers: h,
        body: JSON.stringify(datos),
      })
    },

    async pedidosDesde(desde) {
      const pedidos: PedidoCanal[] = []
      for (let pagina = 1; pagina <= 50; pagina++) {
        let lote: OrdenTN[]
        try {
          lote = await get<OrdenTN[]>(
            `/orders?updated_at_min=${encodeURIComponent(desde.toISOString())}&per_page=200&page=${pagina}`,
          )
        } catch (e) {
          if ((e as { estado?: number }).estado === 404) break
          throw e
        }
        pedidos.push(...lote.map(pedidoDeTN))
        if (lote.length < 200) break
      }
      return pedidos
    },

    async pedido(id) {
      return pedidoDeTN(await get<OrdenTN>(`/orders/${encodeURIComponent(id)}`))
    },
  }
}

/** Avisos de pedidos pagados y cancelados hacia el ERP. */
export async function registrarAvisos(f: Fetch, c: CredencialesTN, url: string) {
  const h = {
    Authentication: `bearer ${c.acceso}`,
    'User-Agent': `Vektra ERP (${process.env.SOPORTE_EMAIL ?? 'soporte@vektra.com.ar'})`,
    'content-type': 'application/json',
  }
  const base = `${API}/${encodeURIComponent(c.tienda)}`
  const existentes = await pedirJson<{ event: string; url: string }[]>(f, `${base}/webhooks`, { headers: h })
  for (const event of ['order/paid', 'order/cancelled']) {
    if (existentes.some((w) => w.event === event && w.url === url)) continue
    await pedirJson(f, `${base}/webhooks`, { method: 'POST', headers: h, body: JSON.stringify({ event, url }) })
  }
}
