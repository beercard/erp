import { ErrorCanal, numero, pedirJson } from './http'
import type { Conector, Fetch, PedidoCanal, ProductoCanal } from './tipos'

/**
 * PrestaShop (servicio web, 1.7 en adelante). El comercio activa el servicio
 * web (Parámetros avanzados → Webservice), crea una clave con permiso sobre
 * products, combinations, stock_availables, orders, order_states, customers,
 * addresses y currencies, y pega acá la dirección y la clave.
 *
 * - Lee en JSON; para cambiar el stock, PrestaShop pide XML.
 * - Los precios de PrestaShop son sin impuestos y dependen de la regla de
 *   impuestos de cada producto: el ERP manda stock, no precios.
 * - No tiene avisos: los pedidos se traen cada 15 minutos.
 */

export type CredencialesPrestashop = { url: string; clave: string }

/** PrestaShop devuelve los textos traducibles como [{ id, value }] o como texto, según la versión. */
const traducido = (v: unknown): string =>
  Array.isArray(v) ? String((v[0] as { value?: string })?.value ?? '') : typeof v === 'string' ? v : ''

/** Fecha en la hora de la tienda (se asume Argentina), como la guarda PrestaShop. */
const fechaTienda = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 19).replace('T', ' ')

type OrdenPS = {
  id: number | string
  reference: string
  current_state: number | string
  date_add: string
  total_paid_tax_incl: string
  id_currency: number | string
  id_customer: number | string
  id_address_invoice: number | string
  associations?: {
    order_rows?: {
      product_id: string
      product_attribute_id: string
      product_reference?: string
      product_name: string
      product_quantity: string
      unit_price_tax_incl: string
    }[]
  }
}

export type DatosOrdenPS = {
  orden: OrdenPS
  estado: { pagado: boolean; cancelado: boolean }
  moneda: string
  cliente: { firstname?: string; lastname?: string; email?: string; company?: string } | null
  direccion: { phone?: string; phone_mobile?: string; dni?: string; vat_number?: string; company?: string } | null
}

export function pedidoDePrestashop({ orden: o, estado, moneda, cliente, direccion }: DatosOrdenPS): PedidoCanal {
  return {
    externoId: String(o.id),
    numero: o.reference || String(o.id),
    fecha: new Date(`${o.date_add.replace(' ', 'T')}-03:00`),
    estado: estado.cancelado ? 'cancelado' : estado.pagado ? 'pagado' : 'pendiente',
    moneda,
    total: numero(o.total_paid_tax_incl) ?? 0,
    comprador: {
      nombre:
        direccion?.company ||
        cliente?.company ||
        [cliente?.firstname, cliente?.lastname].filter(Boolean).join(' ') ||
        'Comprador',
      email: cliente?.email || null,
      documento: direccion?.vat_number || direccion?.dni || null,
      telefono: direccion?.phone_mobile || direccion?.phone || null,
    },
    items: (o.associations?.order_rows ?? []).map((r) => ({
      externoId: String(r.product_id),
      varianteId: r.product_attribute_id && r.product_attribute_id !== '0' ? String(r.product_attribute_id) : '',
      sku: r.product_reference || null,
      titulo: r.product_name,
      cantidad: numero(r.product_quantity) ?? 0,
      precioUnitario: numero(r.unit_price_tax_incl) ?? 0,
    })),
  }
}

/** Estados de PrestaShop que anulan el pedido (cancelado, reembolsado, error de pago). */
const ESTADOS_CANCELADOS = new Set(['6', '7', '8'])

export function conectorPrestashop(f: Fetch, c: CredencialesPrestashop): Conector {
  const h = { authorization: `Basic ${Buffer.from(`${c.clave}:`).toString('base64')}`, accept: 'application/json' }
  const api = `${c.url}/api`
  const get = <T>(ruta: string, q: Record<string, string> = {}) =>
    pedirJson<T>(f, `${api}${ruta}?${new URLSearchParams({ output_format: 'JSON', ...q })}`, { headers: h })

  let estados: Map<string, { pagado: boolean; cancelado: boolean }> | null = null
  const monedas = new Map<string, string>()

  async function estadoDe(id: string) {
    if (!estados) {
      const r = await get<{ order_states?: { id: number; paid: string; logable?: string }[] }>('/order_states', {
        display: '[id,paid,logable]',
      })
      estados = new Map(
        (r.order_states ?? []).map((e) => [
          String(e.id),
          { pagado: e.paid === '1', cancelado: ESTADOS_CANCELADOS.has(String(e.id)) },
        ]),
      )
    }
    return estados.get(id) ?? { pagado: false, cancelado: ESTADOS_CANCELADOS.has(id) }
  }

  async function monedaDe(id: string) {
    if (!monedas.has(id)) {
      const r = await get<{ currency?: { iso_code?: string } }>(`/currencies/${encodeURIComponent(id)}`).catch(() => null)
      monedas.set(id, r?.currency?.iso_code || 'ARS')
    }
    return monedas.get(id)!
  }

  async function completar(o: OrdenPS): Promise<PedidoCanal> {
    const [estado, moneda, cliente, direccion] = await Promise.all([
      estadoDe(String(o.current_state)),
      monedaDe(String(o.id_currency)),
      Number(o.id_customer)
        ? get<{ customer: DatosOrdenPS['cliente'] }>(`/customers/${encodeURIComponent(String(o.id_customer))}`)
            .then((r) => r.customer)
            .catch(() => null)
        : null,
      Number(o.id_address_invoice)
        ? get<{ address: DatosOrdenPS['direccion'] }>(`/addresses/${encodeURIComponent(String(o.id_address_invoice))}`)
            .then((r) => r.address)
            .catch(() => null)
        : null,
    ])
    return pedidoDePrestashop({ orden: o, estado, moneda, cliente, direccion })
  }

  /** stock_available de un producto (o de una combinación). */
  async function stockDe(producto: string, combinacion: string) {
    const r = await get<{ stock_availables?: Record<string, string | number>[] }>('/stock_availables', {
      display: 'full',
      'filter[id_product]': `[${producto}]`,
      'filter[id_product_attribute]': `[${combinacion || '0'}]`,
    })
    return r.stock_availables?.[0] ?? null
  }

  return {
    async productos() {
      const productos: ProductoCanal[] = []
      const stock = new Map<string, number>()
      for (let desde = 0; desde < 100_000; desde += 500) {
        const r = await get<{ stock_availables?: { id_product: string; id_product_attribute: string; quantity: string }[] }>(
          '/stock_availables',
          { display: '[id_product,id_product_attribute,quantity]', limit: `${desde},500` },
        )
        const lote = r.stock_availables ?? []
        for (const s of lote) stock.set(`${s.id_product}:${s.id_product_attribute}`, Number(s.quantity))
        if (lote.length < 500) break
      }
      const combinaciones = new Map<string, { id: string; reference: string }[]>()
      for (let desde = 0; desde < 100_000; desde += 500) {
        const r = await get<{ combinations?: { id: number; id_product: string; reference: string }[] }>('/combinations', {
          display: '[id,id_product,reference]',
          limit: `${desde},500`,
        })
        const lote = r.combinations ?? []
        for (const k of lote) {
          const lista = combinaciones.get(String(k.id_product)) ?? []
          lista.push({ id: String(k.id), reference: k.reference })
          combinaciones.set(String(k.id_product), lista)
        }
        if (lote.length < 500) break
      }
      for (let desde = 0; desde < 100_000; desde += 200) {
        const r = await get<{ products?: { id: number; name: unknown; reference: string; price: string; active: string }[] }>(
          '/products',
          {
            display: '[id,name,reference,price,active]',
            'filter[active]': '[1]',
            limit: `${desde},200`,
          },
        )
        const lote = r.products ?? []
        for (const p of lote) {
          const titulo = traducido(p.name)
          const variantes = combinaciones.get(String(p.id))
          if (variantes?.length) {
            for (const v of variantes) {
              productos.push({
                externoId: String(p.id),
                varianteId: v.id,
                sku: v.reference || null,
                titulo,
                enlace: null,
                precio: null,
                stock: stock.get(`${p.id}:${v.id}`) ?? null,
              })
            }
          } else {
            productos.push({
              externoId: String(p.id),
              varianteId: '',
              sku: p.reference || null,
              titulo,
              enlace: null,
              precio: null,
              stock: stock.get(`${p.id}:0`) ?? null,
            })
          }
        }
        if (lote.length < 200) break
      }
      return productos
    },

    async actualizar(p, cambios) {
      // Los precios no se mandan (ver arriba).
      if (cambios.stock === undefined) return
      const s = await stockDe(p.externoId, p.varianteId)
      if (!s) throw new ErrorCanal('PrestaShop no tiene el stock de ese producto.', 404)
      const campos = { ...s, quantity: Math.max(0, Math.floor(cambios.stock)) }
      const xml = `<?xml version="1.0" encoding="UTF-8"?><prestashop xmlns:xlink="http://www.w3.org/1999/xlink"><stock_available>${Object.entries(
        campos,
      )
        .filter(([k]) => /^[a-z_]+$/.test(k))
        .map(([k, v]) => `<${k}><![CDATA[${String(v ?? '').replace(/]]>/g, '')}]]></${k}>`)
        .join('')}</stock_available></prestashop>`
      await pedirJson(f, `${api}/stock_availables/${encodeURIComponent(String(s.id))}?output_format=JSON`, {
        method: 'PUT',
        headers: { ...h, 'content-type': 'application/xml' },
        body: xml,
      })
    },

    async pedidosDesde(desde) {
      const pedidos: PedidoCanal[] = []
      for (let inicio = 0; inicio < 5000; inicio += 50) {
        const r = await get<{ orders?: OrdenPS[] }>('/orders', {
          display: 'full',
          date: '1',
          'filter[date_upd]': `[${fechaTienda(desde)},2100-01-01 00:00:00]`,
          sort: '[date_upd_ASC]',
          limit: `${inicio},50`,
        })
        const lote = r.orders ?? []
        for (const o of lote) pedidos.push(await completar(o))
        if (lote.length < 50) break
      }
      return pedidos
    },

    async pedido(id) {
      const r = await get<{ order?: OrdenPS }>(`/orders/${encodeURIComponent(id)}`)
      return r.order ? completar(r.order) : null
    },
  }
}

/** Prueba la conexión antes de guardarla: la clave tiene que poder leer productos y pedidos. */
export async function probarPrestashop(f: Fetch, c: CredencialesPrestashop) {
  const h = { authorization: `Basic ${Buffer.from(`${c.clave}:`).toString('base64')}`, accept: 'application/json' }
  for (const recurso of ['products', 'orders']) {
    await pedirJson(f, `${c.url}/api/${recurso}?output_format=JSON&limit=1`, { headers: h })
  }
}
