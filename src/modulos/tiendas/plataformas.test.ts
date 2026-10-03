import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { conectorMagento } from './magento'
import { conectorPrestashop } from './prestashop'
import { avisoValido, conectorShopify, normalizarTiendaShopify, vueltaValida } from './shopify'
import type { Fetch } from './tipos'

process.env.SHOPIFY_API_SECRET ??= 'secreto-shopify'

type Llamada = { url: string; metodo: string; cuerpo: string; headers: Record<string, string> }

/** fetch falso: responde según la URL y anota cada pedido. */
function falso(responder: (u: URL, init: RequestInit) => unknown) {
  const llamadas: Llamada[] = []
  const f = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = new URL(String(url))
    llamadas.push({
      url: String(url),
      metodo: init.method ?? 'GET',
      cuerpo: String(init.body ?? ''),
      headers: init.headers as Record<string, string>,
    })
    const d = responder(u, init)
    return d instanceof Response ? d : new Response(JSON.stringify(d ?? {}), { status: 200 })
  }) as Fetch
  return { f, llamadas }
}

describe('Shopify', () => {
  it('normaliza la tienda y verifica las firmas', () => {
    expect(normalizarTiendaShopify('MiTienda')).toBe('mitienda.myshopify.com')
    expect(normalizarTiendaShopify('https://mitienda.myshopify.com/admin')).toBe('mitienda.myshopify.com')
    expect(normalizarTiendaShopify('mitienda.com.ar')).toBeNull()
    const q = new URLSearchParams({ code: 'abc', shop: 'x.myshopify.com', state: 's', timestamp: '1' })
    const hmac = createHmac('sha256', 'secreto-shopify').update('code=abc&shop=x.myshopify.com&state=s&timestamp=1').digest('hex')
    q.set('hmac', hmac)
    expect(vueltaValida(q)).toBe(true)
    q.set('shop', 'otra.myshopify.com')
    expect(vueltaValida(q)).toBe(false)
    const cuerpo = '{"id":1}'
    expect(avisoValido(cuerpo, createHmac('sha256', 'secreto-shopify').update(cuerpo).digest('base64'))).toBe(true)
    expect(avisoValido(cuerpo, 'x')).toBe(false)
  })

  it('trae variantes, pedidos con precio final y manda stock y precio', async () => {
    const { f, llamadas } = falso((_u, init) => {
      const { query } = JSON.parse(String(init.body)) as { query: string }
      if (query.includes('productVariants('))
        return {
          data: {
            productVariants: {
              nodes: [
                {
                  id: 'gid://shopify/ProductVariant/11',
                  sku: 'TON-1',
                  title: 'Default Title',
                  price: '12100.00',
                  inventoryQuantity: 4,
                  product: { id: 'gid://shopify/Product/1', title: 'Tóner', status: 'ACTIVE', onlineStoreUrl: null },
                },
                {
                  id: 'gid://shopify/ProductVariant/12',
                  sku: 'X',
                  title: 'Rojo',
                  price: '1',
                  inventoryQuantity: 0,
                  product: { id: 'gid://shopify/Product/2', title: 'Borrador', status: 'DRAFT', onlineStoreUrl: null },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }
      if (query.includes('orders('))
        return {
          data: {
            orders: {
              nodes: [
                {
                  id: 'gid://shopify/Order/900',
                  name: '#1001',
                  createdAt: '2026-10-01T15:00:00Z',
                  cancelledAt: null,
                  displayFinancialStatus: 'PAID',
                  currencyCode: 'ARS',
                  taxesIncluded: false,
                  email: 'l@x.com',
                  phone: null,
                  totalPriceSet: { shopMoney: { amount: '24200.00' } },
                  customer: { firstName: 'Lucía', lastName: 'Pérez', email: 'l@x.com', phone: '11 5555' },
                  billingAddress: null,
                  lineItems: {
                    nodes: [
                      {
                        sku: 'TON-1',
                        title: 'Tóner',
                        quantity: 2,
                        variant: { id: 'gid://shopify/ProductVariant/11' },
                        product: { id: 'gid://shopify/Product/1' },
                        discountedTotalSet: { shopMoney: { amount: '20000.00' } },
                        taxLines: [{ priceSet: { shopMoney: { amount: '4200.00' } } }],
                      },
                    ],
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }
      if (query.includes('productVariant('))
        return {
          data: {
            productVariant: {
              inventoryItem: { id: 'gid://shopify/InventoryItem/5' },
              product: { id: 'gid://shopify/Product/1' },
            },
          },
        }
      if (query.includes('locations(')) return { data: { locations: { nodes: [{ id: 'gid://shopify/Location/7' }] } } }
      if (query.includes('inventorySetQuantities')) return { data: { inventorySetQuantities: { userErrors: [] } } }
      if (query.includes('productVariantsBulkUpdate')) return { data: { productVariantsBulkUpdate: { userErrors: [] } } }
      return { errors: [{ message: 'consulta desconocida' }] }
    })
    let ubicacion = ''
    const c = conectorShopify(f, { tienda: 'x.myshopify.com', acceso: 'tok' }, async (u) => void (ubicacion = u))
    const productos = await c.productos()
    expect(productos).toEqual([
      { externoId: '1', varianteId: '11', sku: 'TON-1', titulo: 'Tóner', enlace: null, precio: 12100, stock: 4 },
    ])
    const [p] = await c.pedidosDesde(new Date('2026-10-01T00:00:00Z'))
    expect(p).toMatchObject({ externoId: '900', numero: '1001', estado: 'pagado', comprador: { nombre: 'Lucía Pérez' } })
    expect(p.items[0]).toMatchObject({ externoId: '1', varianteId: '11', cantidad: 2, precioUnitario: 12100 })
    await c.actualizar({ externoId: '1', varianteId: '11' }, { stock: 3, precio: 13000 })
    expect(ubicacion).toBe('gid://shopify/Location/7')
    const stock = JSON.parse(llamadas.find((l) => l.cuerpo.includes('inventorySetQuantities'))!.cuerpo)
    expect(stock.variables.input.quantities[0]).toEqual({
      inventoryItemId: 'gid://shopify/InventoryItem/5',
      locationId: 'gid://shopify/Location/7',
      quantity: 3,
      changeFromQuantity: null,
    })
    expect(stock.variables.clave).toBeTruthy()
    const precio = JSON.parse(llamadas.find((l) => l.cuerpo.includes('productVariantsBulkUpdate'))!.cuerpo)
    expect(precio.variables.variantes).toEqual([{ id: 'gid://shopify/ProductVariant/11', price: '13000.00' }])
    expect(llamadas[0].headers['X-Shopify-Access-Token']).toBe('tok')
  })
})

describe('Magento', () => {
  it('trae productos simples por páginas, pedidos (sin renglones hijos) y manda stock y precio', async () => {
    const { f, llamadas } = falso((u) => {
      if (u.pathname.endsWith('/products'))
        return { items: [{ id: 1, sku: 'TON-1', name: 'Tóner', price: 10000, type_id: 'simple' }], total_count: 1 }
      if (u.pathname.endsWith('/orders'))
        return {
          total_count: 1,
          items: [
            {
              entity_id: 55,
              increment_id: '000000055',
              created_at: '2026-10-01 15:00:00',
              state: 'processing',
              order_currency_code: 'ARS',
              grand_total: 24200,
              customer_firstname: 'Lucía',
              customer_lastname: 'Pérez',
              customer_email: 'l@x.com',
              customer_taxvat: '27301112223',
              billing_address: { telephone: '11 5555' },
              items: [
                {
                  item_id: 1,
                  product_id: 9,
                  sku: 'TON-1',
                  name: 'Tóner',
                  qty_ordered: 2,
                  row_total_incl_tax: 24200,
                  discount_amount: 0,
                },
                {
                  item_id: 2,
                  parent_item_id: 1,
                  product_id: 10,
                  sku: 'TON-1',
                  name: 'Tóner',
                  qty_ordered: 2,
                  row_total_incl_tax: 0,
                },
              ],
            },
          ],
        }
      return {}
    })
    const c = conectorMagento(f, { url: 'https://tienda.com', token: 'tok' })
    expect(await c.productos()).toEqual([
      { externoId: 'TON-1', varianteId: '', sku: 'TON-1', titulo: 'Tóner', enlace: null, precio: 10000, stock: null },
    ])
    const [p] = await c.pedidosDesde(new Date('2026-10-01T00:00:00Z'))
    expect(p).toMatchObject({ externoId: '55', estado: 'pagado', comprador: { nombre: 'Lucía Pérez', documento: '27301112223' } })
    expect(p.items).toEqual([
      { externoId: 'TON-1', varianteId: '', sku: 'TON-1', titulo: 'Tóner', cantidad: 2, precioUnitario: 12100 },
    ])
    expect(decodeURIComponent(llamadas.find((l) => l.url.includes('/orders'))!.url.replace(/\+/g, ' '))).toContain(
      '[value]=2026-10-01 00:00:00',
    )
    await c.actualizar({ externoId: 'TON-1', varianteId: '' }, { stock: 5, precio: 12000 })
    const put = llamadas.find((l) => l.metodo === 'PUT')!
    expect(put.url).toBe('https://tienda.com/rest/all/V1/products/TON-1/stockItems/1')
    expect(JSON.parse(put.cuerpo)).toEqual({ stockItem: { qty: 5, is_in_stock: true } })
    expect(JSON.parse(llamadas.find((l) => l.url.endsWith('/base-prices'))!.cuerpo)).toEqual({
      prices: [{ sku: 'TON-1', price: 12000, store_id: 0 }],
    })
    expect(llamadas[0].headers.authorization).toBe('Bearer tok')
  })
})

describe('PrestaShop', () => {
  it('trae productos con combinaciones y stock, pedidos con su estado y manda el stock en XML', async () => {
    const { f, llamadas } = falso((u) => {
      const r = u.pathname.replace('/api', '')
      if (r === '/stock_availables' && u.searchParams.get('display') === 'full')
        return {
          stock_availables: [
            {
              id: 33,
              id_product: '1',
              id_product_attribute: '0',
              id_shop: '1',
              id_shop_group: '0',
              quantity: '4',
              depends_on_stock: '0',
              out_of_stock: '2',
            },
          ],
        }
      if (r === '/stock_availables')
        return {
          stock_availables: [
            { id_product: '1', id_product_attribute: '0', quantity: '4' },
            { id_product: '2', id_product_attribute: '21', quantity: '1' },
          ],
        }
      if (r === '/combinations') return { combinations: [{ id: 21, id_product: '2', reference: 'REM-R' }] }
      if (r === '/products')
        return {
          products: [
            { id: 1, name: [{ id: '1', value: 'Tóner' }], reference: 'TON-1', price: '10000', active: '1' },
            { id: 2, name: 'Remera', reference: '', price: '5', active: '1' },
          ],
        }
      if (r === '/order_states')
        return {
          order_states: [
            { id: 2, paid: '1' },
            { id: 1, paid: '0' },
            { id: 6, paid: '0' },
          ],
        }
      if (r === '/orders')
        return {
          orders: [
            {
              id: 7,
              reference: 'ABCD',
              current_state: '2',
              date_add: '2026-10-01 12:00:00',
              total_paid_tax_incl: '24200',
              id_currency: '1',
              id_customer: '3',
              id_address_invoice: '4',
              associations: {
                order_rows: [
                  {
                    product_id: '1',
                    product_attribute_id: '0',
                    product_reference: 'TON-1',
                    product_name: 'Tóner',
                    product_quantity: '2',
                    unit_price_tax_incl: '12100',
                  },
                ],
              },
            },
          ],
        }
      if (r === '/currencies/1') return { currency: { iso_code: 'ARS' } }
      if (r === '/customers/3') return { customer: { firstname: 'Lucía', lastname: 'Pérez', email: 'l@x.com' } }
      if (r === '/addresses/4') return { address: { phone_mobile: '11 5555', dni: '30111222' } }
      return {}
    })
    const c = conectorPrestashop(f, { url: 'https://tienda.com', clave: 'CLAVE' })
    expect(await c.productos()).toEqual([
      { externoId: '1', varianteId: '', sku: 'TON-1', titulo: 'Tóner', enlace: null, precio: null, stock: 4 },
      { externoId: '2', varianteId: '21', sku: 'REM-R', titulo: 'Remera', enlace: null, precio: null, stock: 1 },
    ])
    const [p] = await c.pedidosDesde(new Date('2026-10-01T03:00:00Z'))
    expect(p).toMatchObject({
      externoId: '7',
      numero: 'ABCD',
      estado: 'pagado',
      moneda: 'ARS',
      comprador: { nombre: 'Lucía Pérez', documento: '30111222', telefono: '11 5555' },
    })
    expect(p.fecha.toISOString()).toBe('2026-10-01T15:00:00.000Z')
    expect(new URL(llamadas.find((l) => l.url.includes('/orders'))!.url).searchParams.get('filter[date_upd]')).toBe(
      '[2026-10-01 00:00:00,2100-01-01 00:00:00]',
    )
    await c.actualizar({ externoId: '1', varianteId: '' }, { stock: 9, precio: 1 })
    const put = llamadas.find((l) => l.metodo === 'PUT')!
    expect(put.url).toContain('/api/stock_availables/33')
    expect(put.cuerpo).toContain('<quantity><![CDATA[9]]></quantity>')
    expect(put.cuerpo).toContain('<id_shop><![CDATA[1]]></id_shop>')
    expect(llamadas[0].headers.authorization).toBe(`Basic ${Buffer.from('CLAVE:').toString('base64')}`)
  })
})
