import { createHmac, timingSafeEqual } from 'node:crypto'

import { numero, pedirJson } from './http'
import type { Conector, Fetch, PedidoCanal, ProductoCanal } from './tipos'

/**
 * WooCommerce. No hace falta registrar nada: la tienda crea las claves de la
 * API desde su propio panel (/wc-auth/v1/authorize) y las manda por POST a
 * la dirección que le damos. La tienda tiene que estar en https.
 */

export type CredencialesWoo = { url: string; clave: string; secreto: string }

/** Normaliza lo que escribe el usuario: "mitienda.com.ar/" → "https://mitienda.com.ar". */
export function normalizarTienda(entrada: string): string | null {
  let t = entrada.trim()
  if (!t) return null
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`
  try {
    const u = new URL(t)
    if (u.protocol !== 'https:' && !process.env.WEBHOOKS_PERMITIR_LOCAL) return null
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
}

export function urlAutorizacion(tienda: string, state: string, vuelta: string, recepcion: string) {
  const q = new URLSearchParams({
    app_name: 'Vektra ERP',
    scope: 'read_write',
    user_id: state,
    return_url: vuelta,
    callback_url: recepcion,
  })
  return `${tienda}/wc-auth/v1/authorize?${q}`
}

/** Firma de los avisos: X-WC-Webhook-Signature = base64(HMAC-SHA256(cuerpo, secreto)). */
export function firmaValida(cuerpo: string, firma: string | null, secreto: string) {
  if (!firma) return false
  const esperada = Buffer.from(createHmac('sha256', secreto).update(cuerpo).digest('base64'))
  const recibida = Buffer.from(firma.trim())
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
}

type Producto = {
  id: number
  name: string
  type: string
  sku?: string
  permalink?: string
  price?: string
  stock_quantity?: number | null
}
type Variacion = { id: number; sku?: string; price?: string; stock_quantity?: number | null; permalink?: string }
type OrdenWoo = {
  id: number
  number: string
  status: string
  date_created_gmt: string
  currency: string
  total: string
  billing?: { first_name?: string; last_name?: string; company?: string; email?: string; phone?: string }
  meta_data?: { key: string; value: unknown }[]
  line_items: {
    product_id: number
    variation_id: number
    sku?: string
    name: string
    quantity: number
    total: string
    total_tax: string
  }[]
}

/** Campos que suelen agregar los plugins de facturación argentinos para el DNI o CUIT. */
const CLAVES_DOCUMENTO = ['_billing_dni', 'billing_dni', '_billing_cuit', 'billing_cuit', '_billing_document', 'dni', 'cuit']

export function pedidoDeWoo(o: OrdenWoo): PedidoCanal {
  const b = o.billing ?? {}
  const documento = o.meta_data?.find((m) => CLAVES_DOCUMENTO.includes(m.key) && m.value)?.value
  return {
    externoId: String(o.id),
    numero: o.number || String(o.id),
    fecha: new Date(`${o.date_created_gmt}Z`),
    estado: ['processing', 'completed'].includes(o.status)
      ? 'pagado'
      : ['cancelled', 'refunded', 'failed'].includes(o.status)
        ? 'cancelado'
        : 'pendiente',
    moneda: o.currency,
    total: numero(o.total) ?? 0,
    comprador: {
      nombre: b.company || [b.first_name, b.last_name].filter(Boolean).join(' ') || 'Comprador',
      email: b.email || null,
      documento: documento ? String(documento) : null,
      telefono: b.phone || null,
    },
    items: o.line_items.map((l) => ({
      externoId: String(l.product_id),
      varianteId: l.variation_id ? String(l.variation_id) : '',
      sku: l.sku || null,
      titulo: l.name,
      cantidad: l.quantity,
      // Precio final por unidad: total del renglón más su impuesto, sin depender de cómo cargó los precios la tienda.
      precioUnitario: l.quantity ? ((numero(l.total) ?? 0) + (numero(l.total_tax) ?? 0)) / l.quantity : 0,
    })),
  }
}

export function conectorWoo(f: Fetch, c: CredencialesWoo): Conector {
  const h = {
    authorization: `Basic ${Buffer.from(`${c.clave}:${c.secreto}`).toString('base64')}`,
    'content-type': 'application/json',
    accept: 'application/json',
  }
  const api = `${c.url}/wp-json/wc/v3`
  const get = <T>(ruta: string) => pedirJson<T>(f, `${api}${ruta}`, { headers: h })

  return {
    async productos() {
      const productos: ProductoCanal[] = []
      for (let pagina = 1; pagina <= 50; pagina++) {
        const lote = await get<Producto[]>(`/products?per_page=100&page=${pagina}&status=publish`)
        for (const p of lote) {
          if (p.type === 'variable') {
            for (let pv = 1; pv <= 5; pv++) {
              const vs = await get<Variacion[]>(`/products/${p.id}/variations?per_page=100&page=${pv}`)
              for (const v of vs) {
                productos.push({
                  externoId: String(p.id),
                  varianteId: String(v.id),
                  sku: v.sku || null,
                  titulo: p.name,
                  enlace: v.permalink ?? p.permalink ?? null,
                  precio: numero(v.price),
                  stock: numero(v.stock_quantity),
                })
              }
              if (vs.length < 100) break
            }
          } else {
            productos.push({
              externoId: String(p.id),
              varianteId: '',
              sku: p.sku || null,
              titulo: p.name,
              enlace: p.permalink ?? null,
              precio: numero(p.price),
              stock: numero(p.stock_quantity),
            })
          }
        }
        if (lote.length < 100) break
      }
      return productos
    },

    async actualizar(p, cambios) {
      const datos: Record<string, string | number | boolean> = {}
      if (cambios.stock !== undefined) {
        datos.manage_stock = true
        datos.stock_quantity = Math.max(0, Math.floor(cambios.stock))
      }
      if (cambios.precio !== undefined) datos.regular_price = cambios.precio.toFixed(2)
      if (!Object.keys(datos).length) return
      const ruta = p.varianteId
        ? `/products/${encodeURIComponent(p.externoId)}/variations/${encodeURIComponent(p.varianteId)}`
        : `/products/${encodeURIComponent(p.externoId)}`
      await pedirJson(f, `${api}${ruta}`, { method: 'PUT', headers: h, body: JSON.stringify(datos) })
    },

    async pedidosDesde(desde) {
      const pedidos: PedidoCanal[] = []
      // WooCommerce compara sin huso horario cuando se le pide en GMT.
      const desdeGmt = desde.toISOString().slice(0, 19)
      for (let pagina = 1; pagina <= 50; pagina++) {
        const lote = await get<OrdenWoo[]>(
          `/orders?modified_after=${encodeURIComponent(desdeGmt)}&dates_are_gmt=true&per_page=100&page=${pagina}&orderby=date&order=asc`,
        )
        pedidos.push(...lote.map(pedidoDeWoo))
        if (lote.length < 100) break
      }
      return pedidos
    },

    async pedido(id) {
      return pedidoDeWoo(await get<OrdenWoo>(`/orders/${encodeURIComponent(id)}`))
    },
  }
}

/** Avisos de pedidos creados y modificados hacia el ERP, firmados con un secreto propio del canal. */
export async function registrarAvisos(f: Fetch, c: CredencialesWoo, url: string, secreto: string) {
  const h = {
    authorization: `Basic ${Buffer.from(`${c.clave}:${c.secreto}`).toString('base64')}`,
    'content-type': 'application/json',
  }
  const api = `${c.url}/wp-json/wc/v3`
  const existentes = await pedirJson<{ topic: string; delivery_url: string }[]>(f, `${api}/webhooks?per_page=100`, { headers: h })
  for (const topic of ['order.created', 'order.updated']) {
    if (existentes.some((w) => w.topic === topic && w.delivery_url === url)) continue
    await pedirJson(f, `${api}/webhooks`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ name: `Vektra ERP ${topic}`, topic, delivery_url: url, secret: secreto, status: 'active' }),
    })
  }
}
