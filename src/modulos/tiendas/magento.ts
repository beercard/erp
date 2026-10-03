import { numero, pedirJson } from './http'
import type { Conector, Fetch, PedidoCanal, ProductoCanal } from './tipos'

/**
 * Magento 2 / Adobe Commerce (API REST). El comercio crea una integración en
 * su panel (Sistema → Integraciones) con acceso a Catálogo, Inventario y
 * Ventas, y pega acá la dirección de la tienda y el "Access Token".
 * En Magento 2.4.4 o más nuevo hay que permitir usar ese token como Bearer
 * (Tiendas → Configuración → Servicios → OAuth → "Allow OAuth Access Tokens
 * to be used as standalone Bearer tokens").
 *
 * Cada producto simple es una publicación (su SKU es la clave de la API).
 * Magento no tiene avisos propios: los pedidos se traen cada 15 minutos.
 */

export type CredencialesMagento = { url: string; token: string }

type Busqueda<T> = { items: T[]; total_count: number }
type ProductoMagento = { id: number; sku: string; name: string; price?: number; status?: number; type_id: string }
type OrdenMagento = {
  entity_id: number
  increment_id: string
  created_at: string
  state?: string
  status?: string
  order_currency_code: string
  grand_total: number
  customer_firstname?: string | null
  customer_lastname?: string | null
  customer_email?: string | null
  customer_taxvat?: string | null
  billing_address?: { firstname?: string; lastname?: string; company?: string; telephone?: string; vat_id?: string } | null
  items: {
    item_id: number
    parent_item_id?: number | null
    product_id: number
    sku: string
    name: string
    qty_ordered: number
    price_incl_tax?: number
    row_total_incl_tax?: number
    discount_amount?: number
  }[]
}

/** Magento guarda las fechas en UTC con el formato "2026-10-03 12:30:00". */
const fechaMagento = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')

export function pedidoDeMagento(o: OrdenMagento): PedidoCanal {
  const estado = o.state ?? o.status ?? ''
  const b = o.billing_address ?? {}
  return {
    externoId: String(o.entity_id),
    numero: o.increment_id,
    fecha: new Date(`${o.created_at.replace(' ', 'T')}Z`),
    estado: ['processing', 'complete'].includes(estado)
      ? 'pagado'
      : ['canceled', 'closed'].includes(estado)
        ? 'cancelado'
        : 'pendiente',
    moneda: o.order_currency_code,
    total: numero(o.grand_total) ?? 0,
    comprador: {
      nombre:
        b.company ||
        [o.customer_firstname ?? b.firstname, o.customer_lastname ?? b.lastname].filter(Boolean).join(' ') ||
        'Comprador',
      email: o.customer_email || null,
      documento: o.customer_taxvat || b.vat_id || null,
      telefono: b.telephone || null,
    },
    // Los productos configurables traen el renglón "padre" (con el SKU elegido y el precio) y el "hijo": se usa el padre.
    items: o.items
      .filter((i) => !i.parent_item_id)
      .map((i) => {
        const cantidad = numero(i.qty_ordered) ?? 0
        const total = numero(i.row_total_incl_tax) ?? (numero(i.price_incl_tax) ?? 0) * cantidad
        const descuento = numero(i.discount_amount) ?? 0
        return {
          externoId: i.sku,
          varianteId: '',
          sku: i.sku || null,
          titulo: i.name,
          cantidad,
          precioUnitario: cantidad ? (total - descuento) / cantidad : 0,
        }
      }),
  }
}

export function conectorMagento(f: Fetch, c: CredencialesMagento): Conector {
  const h = { authorization: `Bearer ${c.token}`, 'content-type': 'application/json', accept: 'application/json' }
  const api = `${c.url}/rest/V1`
  // Los cambios de precio y stock se hacen en el alcance global ("all"), no en una vista de tienda.
  const global = `${c.url}/rest/all/V1`
  const get = <T>(ruta: string) => pedirJson<T>(f, `${api}${ruta}`, { headers: h })

  const criterio = (filtros: [string, string, string][], pagina: number, tamano: number) => {
    const q = new URLSearchParams()
    filtros.forEach(([campo, valor, condicion], n) => {
      q.set(`searchCriteria[filter_groups][${n}][filters][0][field]`, campo)
      q.set(`searchCriteria[filter_groups][${n}][filters][0][value]`, valor)
      q.set(`searchCriteria[filter_groups][${n}][filters][0][condition_type]`, condicion)
    })
    q.set('searchCriteria[pageSize]', String(tamano))
    q.set('searchCriteria[currentPage]', String(pagina))
    return q.toString()
  }

  return {
    async productos() {
      const productos: ProductoCanal[] = []
      // Pasada la última página, Magento repite la última: se corta por el total.
      for (let pagina = 1; pagina <= 200; pagina++) {
        const r = await get<Busqueda<ProductoMagento>>(
          `/products?${criterio(
            [
              ['type_id', 'simple', 'eq'],
              ['status', '1', 'eq'],
            ],
            pagina,
            100,
          )}`,
        )
        for (const p of r.items) {
          productos.push({
            externoId: p.sku,
            varianteId: '',
            sku: p.sku,
            titulo: p.name,
            enlace: null,
            precio: numero(p.price),
            stock: null,
          })
        }
        if (pagina * 100 >= r.total_count || !r.items.length) break
      }
      return productos
    },

    async actualizar(p, cambios) {
      const sku = encodeURIComponent(p.externoId)
      if (cambios.stock !== undefined) {
        const qty = Math.max(0, Math.floor(cambios.stock))
        // El número del final es obligatorio en la ruta pero Magento ubica el ítem por el SKU.
        await pedirJson(f, `${global}/products/${sku}/stockItems/1`, {
          method: 'PUT',
          headers: h,
          body: JSON.stringify({ stockItem: { qty, is_in_stock: qty > 0 } }),
        })
      }
      if (cambios.precio !== undefined) {
        await pedirJson(f, `${global}/products/base-prices`, {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ prices: [{ sku: p.externoId, price: Number(cambios.precio.toFixed(2)), store_id: 0 }] }),
        })
      }
    },

    async pedidosDesde(desde) {
      const pedidos: PedidoCanal[] = []
      for (let pagina = 1; pagina <= 50; pagina++) {
        const r = await get<Busqueda<OrdenMagento>>(
          `/orders?${criterio([['updated_at', fechaMagento(desde), 'gteq']], pagina, 50)}`,
        )
        pedidos.push(...r.items.map(pedidoDeMagento))
        if (pagina * 50 >= r.total_count || !r.items.length) break
      }
      return pedidos
    },

    async pedido(id) {
      return pedidoDeMagento(await get<OrdenMagento>(`/orders/${encodeURIComponent(id)}`))
    },
  }
}

/** Prueba la conexión antes de guardarla: el token tiene que poder leer productos. */
export async function probarMagento(f: Fetch, c: CredencialesMagento) {
  await pedirJson(f, `${c.url}/rest/V1/products?searchCriteria[pageSize]=1&searchCriteria[currentPage]=1`, {
    headers: { authorization: `Bearer ${c.token}`, accept: 'application/json' },
  })
}
