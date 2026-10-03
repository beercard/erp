import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

import { ErrorCanal, numero, pedirJson } from './http'
import type { Conector, Fetch, PedidoCanal, ProductoCanal } from './tipos'

/**
 * Shopify (API de administración GraphQL). La aplicación la registra la
 * plataforma una vez (SHOPIFY_API_KEY y SHOPIFY_API_SECRET, con la dirección
 * de vuelta APP_URL/api/tiendas/shopify/vuelta). Cada comercio escribe su
 * tienda (algo.myshopify.com) y aprueba los permisos: el token no vence.
 */

export type CredencialesShopify = { tienda: string; acceso: string; ubicacion?: string }

/** Versión de la API (Shopify publica una cada tres meses y sostiene cada una un año). */
export const VERSION_SHOPIFY = () => process.env.SHOPIFY_API_VERSION || '2026-10'

export const PERMISOS_SHOPIFY = 'read_products,write_products,read_inventory,write_inventory,read_locations,read_orders'

export const shopifyConfigurado = () => Boolean(process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET)

/** "mitienda", "mitienda.myshopify.com" o "https://mitienda.myshopify.com/admin" → "mitienda.myshopify.com". */
export function normalizarTiendaShopify(entrada: string): string | null {
  let t = entrada
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
  if (!t) return null
  if (!t.includes('.')) t = `${t}.myshopify.com`
  return /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/.test(t) ? t : null
}

export function urlAutorizacionShopify(tienda: string, state: string, vuelta: string) {
  const q = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY ?? '',
    scope: PERMISOS_SHOPIFY,
    redirect_uri: vuelta,
    state,
  })
  return `https://${tienda}/admin/oauth/authorize?${q}`
}

/**
 * La vuelta de Shopify viene firmada: HMAC-SHA256 (hex) de los parámetros,
 * sin "hmac", ordenados y unidos como "clave=valor&…", con el secreto de la app.
 */
export function vueltaValida(q: URLSearchParams) {
  const secreto = process.env.SHOPIFY_API_SECRET
  const hmac = q.get('hmac')
  if (!secreto || !hmac) return false
  const mensaje = [...q.entries()]
    .filter(([k]) => k !== 'hmac' && k !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const esperada = Buffer.from(createHmac('sha256', secreto).update(mensaje).digest('hex'))
  const recibida = Buffer.from(hmac.toLowerCase())
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
}

/** Avisos: X-Shopify-Hmac-Sha256 = base64(HMAC-SHA256(cuerpo crudo, secreto de la app)). */
export function avisoValido(cuerpo: string, firma: string | null) {
  const secreto = process.env.SHOPIFY_API_SECRET
  if (!secreto || !firma) return false
  const esperada = Buffer.from(createHmac('sha256', secreto).update(cuerpo).digest('base64'))
  const recibida = Buffer.from(firma.trim())
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
}

export async function canjearCodigoShopify(f: Fetch, tienda: string, codigo: string): Promise<CredencialesShopify> {
  const t = await pedirJson<{ access_token: string; scope?: string }>(f, `https://${tienda}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ client_id: process.env.SHOPIFY_API_KEY, client_secret: process.env.SHOPIFY_API_SECRET, code: codigo }),
  })
  return { tienda, acceso: t.access_token }
}

const gid = (tipo: string, id: string) => (id.startsWith('gid://') ? id : `gid://shopify/${tipo}/${id}`)
/** "gid://shopify/Product/123" → "123". */
export const idDe = (g: string | null | undefined) => (g ? g.slice(g.lastIndexOf('/') + 1) : '')

type Dinero = { shopMoney: { amount: string; currencyCode?: string } }
type OrdenShopify = {
  id: string
  name: string
  createdAt: string
  cancelledAt: string | null
  displayFinancialStatus: string | null
  currencyCode: string
  taxesIncluded: boolean
  email: string | null
  phone: string | null
  totalPriceSet: Dinero
  customer: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null
  billingAddress: { name: string | null; company: string | null; phone: string | null } | null
  lineItems: {
    nodes: {
      sku: string | null
      title: string
      quantity: number
      variant: { id: string } | null
      product: { id: string } | null
      discountedTotalSet: Dinero
      taxLines: { priceSet: Dinero }[]
    }[]
  }
}

const CAMPOS_ORDEN = `
  id name createdAt cancelledAt displayFinancialStatus currencyCode taxesIncluded email phone
  totalPriceSet { shopMoney { amount } }
  customer { firstName lastName email phone }
  billingAddress { name company phone }
  lineItems(first: 100) {
    nodes {
      sku title quantity
      variant { id }
      product { id }
      discountedTotalSet { shopMoney { amount } }
      taxLines { priceSet { shopMoney { amount } } }
    }
  }`

export function pedidoDeShopify(o: OrdenShopify): PedidoCanal {
  const financiero = o.displayFinancialStatus ?? ''
  const c = o.customer
  return {
    externoId: idDe(o.id),
    numero: o.name.replace(/^#/, ''),
    fecha: new Date(o.createdAt),
    estado:
      o.cancelledAt || ['REFUNDED', 'VOIDED'].includes(financiero)
        ? 'cancelado'
        : ['PAID', 'PARTIALLY_REFUNDED'].includes(financiero)
          ? 'pagado'
          : 'pendiente',
    moneda: o.currencyCode,
    total: numero(o.totalPriceSet.shopMoney.amount) ?? 0,
    comprador: {
      nombre:
        o.billingAddress?.company ||
        [c?.firstName, c?.lastName].filter(Boolean).join(' ') ||
        o.billingAddress?.name ||
        'Comprador',
      email: c?.email || o.email || null,
      documento: null,
      telefono: c?.phone || o.billingAddress?.phone || o.phone || null,
    },
    items: o.lineItems.nodes.map((l) => {
      const total = numero(l.discountedTotalSet.shopMoney.amount) ?? 0
      // Si la tienda carga precios sin impuestos, el impuesto viene aparte en cada renglón.
      const impuestos = o.taxesIncluded ? 0 : l.taxLines.reduce((s, t) => s + (numero(t.priceSet.shopMoney.amount) ?? 0), 0)
      return {
        externoId: idDe(l.product?.id),
        varianteId: idDe(l.variant?.id),
        sku: l.sku || null,
        titulo: l.title,
        cantidad: l.quantity,
        precioUnitario: l.quantity ? (total + impuestos) / l.quantity : 0,
      }
    }),
  }
}

export function conectorShopify(f: Fetch, c: CredencialesShopify, alElegirUbicacion?: (id: string) => Promise<void>): Conector {
  const url = `https://${c.tienda}/admin/api/${VERSION_SHOPIFY()}/graphql.json`
  let ubicacion = c.ubicacion

  async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const r = await pedirJson<{ data?: T; errors?: { message: string }[] | string }>(f, url, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': c.acceso, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (r.errors?.length) {
      const m = typeof r.errors === 'string' ? r.errors : r.errors.map((e) => e.message).join('; ')
      throw new ErrorCanal(`Shopify: ${m}`, /throttl/i.test(m) ? 429 : undefined)
    }
    return r.data as T
  }

  const sinErrores = (errores: { message: string }[] | undefined) => {
    if (errores?.length) throw new ErrorCanal(`Shopify: ${errores.map((e) => e.message).join('; ')}`)
  }

  /** Dónde se publica el stock: la primera ubicación de la tienda (se recuerda). */
  async function ubicacionDeStock() {
    if (ubicacion) return ubicacion
    const d = await gql<{ locations: { nodes: { id: string }[] } }>(`{ locations(first: 1) { nodes { id } } }`)
    ubicacion = d.locations.nodes[0]?.id
    if (!ubicacion) throw new ErrorCanal('La tienda de Shopify no tiene ninguna ubicación para el stock.')
    await alElegirUbicacion?.(ubicacion)
    return ubicacion
  }

  return {
    async productos() {
      const productos: ProductoCanal[] = []
      let despues: string | null = null
      for (let vuelta = 0; vuelta < 200; vuelta++) {
        const d: {
          productVariants: {
            nodes: {
              id: string
              sku: string | null
              title: string
              price: string
              inventoryQuantity: number | null
              product: { id: string; title: string; status: string; onlineStoreUrl: string | null }
            }[]
            pageInfo: { hasNextPage: boolean; endCursor: string | null }
          }
        } = await gql(
          `query ($despues: String) {
            productVariants(first: 250, after: $despues) {
              nodes { id sku title price inventoryQuantity product { id title status onlineStoreUrl } }
              pageInfo { hasNextPage endCursor }
            }
          }`,
          { despues },
        )
        for (const v of d.productVariants.nodes) {
          if (v.product.status !== 'ACTIVE') continue
          productos.push({
            externoId: idDe(v.product.id),
            varianteId: idDe(v.id),
            sku: v.sku || null,
            titulo: v.title && v.title !== 'Default Title' ? `${v.product.title} — ${v.title}` : v.product.title,
            enlace: v.product.onlineStoreUrl,
            precio: numero(v.price),
            stock: numero(v.inventoryQuantity),
          })
        }
        if (!d.productVariants.pageInfo.hasNextPage) break
        despues = d.productVariants.pageInfo.endCursor
      }
      return productos
    },

    async actualizar(p, cambios) {
      if (cambios.stock === undefined && cambios.precio === undefined) return
      const variante = gid('ProductVariant', p.varianteId)
      const d = await gql<{ productVariant: { inventoryItem: { id: string }; product: { id: string } } | null }>(
        `query ($id: ID!) { productVariant(id: $id) { inventoryItem { id } product { id } } }`,
        { id: variante },
      )
      if (!d.productVariant) throw new ErrorCanal('Esa variante ya no existe en Shopify.', 404)
      if (cambios.stock !== undefined) {
        const r = await gql<{ inventorySetQuantities: { userErrors: { message: string }[] } }>(
          // Desde 2026-04 hace falta una clave de idempotencia y "changeFromQuantity" (null: el ERP manda, sin comparar).
          `mutation ($input: InventorySetQuantitiesInput!, $clave: String!) {
            inventorySetQuantities(input: $input) @idempotent(key: $clave) { userErrors { field message } }
          }`,
          {
            clave: randomUUID(),
            input: {
              name: 'available',
              reason: 'correction',
              quantities: [
                {
                  inventoryItemId: d.productVariant.inventoryItem.id,
                  locationId: await ubicacionDeStock(),
                  quantity: Math.max(0, Math.floor(cambios.stock)),
                  changeFromQuantity: null,
                },
              ],
            },
          },
        )
        sinErrores(r.inventorySetQuantities.userErrors)
      }
      if (cambios.precio !== undefined) {
        const r = await gql<{ productVariantsBulkUpdate: { userErrors: { message: string }[] } }>(
          `mutation ($producto: ID!, $variantes: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $producto, variants: $variantes) { userErrors { field message } }
          }`,
          { producto: d.productVariant.product.id, variantes: [{ id: variante, price: cambios.precio.toFixed(2) }] },
        )
        sinErrores(r.productVariantsBulkUpdate.userErrors)
      }
    },

    async pedidosDesde(desde) {
      const pedidos: PedidoCanal[] = []
      let despues: string | null = null
      for (let vuelta = 0; vuelta < 50; vuelta++) {
        const d: { orders: { nodes: OrdenShopify[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } = await gql(
          `query ($q: String!, $despues: String) {
            orders(first: 50, after: $despues, query: $q, sortKey: UPDATED_AT) {
              nodes { ${CAMPOS_ORDEN} }
              pageInfo { hasNextPage endCursor }
            }
          }`,
          { q: `updated_at:>='${desde.toISOString()}'`, despues },
        )
        pedidos.push(...d.orders.nodes.map(pedidoDeShopify))
        if (!d.orders.pageInfo.hasNextPage) break
        despues = d.orders.pageInfo.endCursor
      }
      return pedidos
    },

    async pedido(id) {
      const d = await gql<{ order: OrdenShopify | null }>(`query ($id: ID!) { order(id: $id) { ${CAMPOS_ORDEN} } }`, {
        id: gid('Order', id),
      })
      return d.order ? pedidoDeShopify(d.order) : null
    },
  }
}

/** Avisos de pedidos pagados, cancelados y de desinstalación hacia el ERP. */
export async function registrarAvisosShopify(f: Fetch, c: CredencialesShopify, url: string) {
  const conector = `https://${c.tienda}/admin/api/${VERSION_SHOPIFY()}/graphql.json`
  const h = { 'X-Shopify-Access-Token': c.acceso, 'content-type': 'application/json' }
  for (const topico of ['ORDERS_PAID', 'ORDERS_CANCELLED', 'APP_UNINSTALLED']) {
    const r = await pedirJson<{ data?: { webhookSubscriptionCreate: { userErrors: { message: string }[] } } }>(f, conector, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        query: `mutation ($topico: WebhookSubscriptionTopic!, $aviso: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topico, webhookSubscription: $aviso) { userErrors { field message } }
        }`,
        variables: { topico, aviso: { uri: url, format: 'JSON' } },
      }),
    })
    const errores = r.data?.webhookSubscriptionCreate.userErrors ?? []
    // Si ya estaba registrado, Shopify lo dice como error: no es un problema.
    if (errores.length && !errores.every((e) => /already|taken|ya existe/i.test(e.message))) {
      throw new ErrorCanal(`Shopify: ${errores.map((e) => e.message).join('; ')}`)
    }
  }
}
