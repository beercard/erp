import { createHmac } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  articulos,
  canalesVenta,
  depositos,
  empresas,
  listasPrecios,
  movimientosStock,
  pedidos,
  pedidosCanal,
  pedidosItems,
  precios,
  publicacionesCanal,
  terceros,
} from '../../db/schema'
import { conectarCanal, credencialesDe, desconectarCanal, listarCanales } from './canales'
import { crearFlujo, leerFlujo } from './flujo'
import { pedidoDeML, type CredencialesML } from './mercadolibre'
import { conectorDe, enviarStockYPrecios, traerPedidos, traerPublicaciones } from './sincronizar'
import { firmaValida as firmaTN } from './tiendanube'
import { firmaValida as firmaWoo, normalizarTienda, pedidoDeWoo } from './woocommerce'

process.env.ERP_CLAVE_MAESTRA ??= 'clave-maestra-de-prueba-de-32-caracteres-o-mas'
process.env.TIENDANUBE_CLIENT_SECRET ??= 'secreto-tn'

const U = '00000000-0000-4000-8000-000000000001'

/** Una Tienda Nube de mentira: responde como la API y anota lo que se le manda. */
function tiendaNubeFalsa() {
  const estado = {
    orden: {
      id: 9001,
      number: 101,
      created_at: '2026-10-01T15:00:00+0000',
      status: 'open',
      payment_status: 'paid',
      currency: 'ARS',
      total: '24200.00',
      customer: { name: 'Lucía Pérez', email: 'Lucia@Correo.com', identification: '30111222', phone: '11 5555-0000' },
      products: [{ product_id: 1, variant_id: 11, sku: 'TON-1', name: 'Tóner negro', quantity: 2, price: '12100.00' }],
    },
    enviados: [] as { ruta: string; cuerpo: unknown }[],
  }
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url))
    const ruta = u.pathname.replace(/^\/v1\/123/, '')
    const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 })
    if (init?.method === 'PUT') {
      estado.enviados.push({ ruta, cuerpo: JSON.parse(String(init.body)) })
      return json({})
    }
    if (ruta === '/products') {
      if (u.searchParams.get('page') !== '1') return new Response('[]', { status: 404 })
      return json([
        {
          id: 1,
          name: { es: 'Tóner negro' },
          canonical_url: 'https://tienda/toner',
          variants: [{ id: 11, sku: 'TON-1', price: '9999.00', stock: 1 }],
        },
        { id: 2, name: { es: 'Taza' }, variants: [{ id: 21, sku: 'NO-EXISTE', price: '500', stock: 3 }] },
      ])
    }
    if (ruta === '/orders') return json(u.searchParams.get('page') === '1' ? [estado.orden] : [])
    if (ruta === '/orders/9001') return json(estado.orden)
    return new Response('{"message":"no"}', { status: 404 })
  }) as typeof fetch
  return { f, estado }
}

describe('tiendas online', () => {
  let empresa: string
  let otra: string
  let canalId: string
  let toner: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)
  const tn = tiendaNubeFalsa()

  beforeAll(async () => {
    const db = await baseDePrueba()
    ;[{ id: empresa }, { id: otra }] = await db
      .insert(empresas)
      .values([
        { razonSocial: 'Comercio S.A.', cuit: '30715974823', condicionIva: 1 },
        { razonSocial: 'Otra S.A.', cuit: '30111111118', condicionIva: 1 },
      ])
      .returning()
    await en(async (tx) => {
      ;[{ id: toner }] = await tx.insert(articulos).values({ codigo: 'TON-1', nombre: 'Tóner', alicuotaIva: 5 }).returning()
      const [dep] = await tx.insert(depositos).values({ codigo: '001', nombre: 'Central' }).returning()
      await tx.insert(movimientosStock).values({ articuloId: toner, depositoId: dep.id, cantidad: '7.5', tipo: 'ajuste' })
      const [lista] = await tx
        .insert(listasPrecios)
        .values({ codigo: 'WEB', nombre: 'Web', moneda: 'PES', incluyeIva: false })
        .returning()
      await tx.insert(precios).values({ listaId: lista.id, articuloId: toner, precio: '10000', vigenteDesde: '2020-01-01' })
      const r = await conectarCanal(tx, U, {
        tipo: 'tiendanube',
        nombre: 'Mi tienda',
        cuenta: '123',
        credenciales: { acceso: 'token', tienda: '123' },
      })
      if (!r.ok) throw new Error(r.error)
      canalId = r.id
      await tx
        .update(canalesVenta)
        .set({ listaPreciosId: lista.id, depositoId: dep.id, enviarPrecios: true })
        .where(eq(canalesVenta.id, canalId))
    })
  })

  it('las credenciales quedan cifradas y una cuenta no se conecta a dos empresas', async () => {
    const [c] = await en((tx) => tx.select().from(canalesVenta).where(eq(canalesVenta.id, canalId)))
    expect(c.credenciales).not.toContain('token')
    expect(credencialesDe(c)).toEqual({ acceso: 'token', tienda: '123' })
    const r = await conEmpresa(otra, (tx) =>
      conectarCanal(tx, U, { tipo: 'tiendanube', nombre: 'Robada', cuenta: '123', credenciales: {} }),
    )
    expect(r).toMatchObject({ ok: false })
  })

  it('trae las publicaciones y vincula por SKU = código del artículo', async () => {
    const r = await traerPublicaciones(empresa, canalId, tn.f)
    expect(r).toMatchObject({ total: 2, nuevas: 2, vinculadas: 1 })
    const pubs = await en((tx) => tx.select().from(publicacionesCanal))
    expect(pubs.find((p) => p.sku === 'TON-1')?.articuloId).toBe(toner)
    expect(pubs.find((p) => p.sku === 'NO-EXISTE')?.articuloId).toBeNull()
  })

  it('manda stock (entero, del depósito) y precio final con IVA, y no repite si no cambió', async () => {
    expect(await enviarStockYPrecios(empresa, canalId, tn.f)).toEqual({ enviados: 1, errores: 0 })
    expect(tn.estado.enviados).toEqual([{ ruta: '/products/1/variants/11', cuerpo: { stock: 7, price: '12100.00' } }])
    expect(await enviarStockYPrecios(empresa, canalId, tn.f)).toEqual({ enviados: 0, errores: 0 })
  })

  it('el pedido pagado entra como pedido del ERP, con el cliente y el neto sin IVA; repetido no duplica', async () => {
    expect(await traerPedidos(empresa, canalId, tn.f)).toEqual({ importados: 1, errores: 0 })
    expect(await traerPedidos(empresa, canalId, tn.f)).toEqual({ importados: 0, errores: 0 })
    const [p] = await en((tx) => tx.select().from(pedidos))
    expect(p).toMatchObject({ origen: 'tiendanube', idExterno: '9001', total: '24200.00', estado: 'pendiente' })
    const [item] = await en((tx) => tx.select().from(pedidosItems))
    expect(item).toMatchObject({ articuloId: toner, cantidad: '2.0000', precioUnitario: '10000.0000' })
    const [cliente] = await en((tx) => tx.select().from(terceros).where(eq(terceros.id, p.terceroId)))
    expect(cliente).toMatchObject({ razonSocial: 'Lucía Pérez', tipoDocumento: 96, numeroDocumento: '30111222' })
    const [registro] = await en((tx) => tx.select().from(pedidosCanal))
    expect(registro).toMatchObject({ estado: 'importado', pedidoId: p.id, numero: '101' })
  })

  it('si lo cancelan en la tienda, se cancela el pedido pendiente', async () => {
    tn.estado.orden.status = 'cancelled'
    await traerPedidos(empresa, canalId, tn.f)
    const [p] = await en((tx) => tx.select().from(pedidos))
    expect(p.estado).toBe('cancelado')
  })

  it('al desconectar se borran las credenciales y se suelta la cuenta', async () => {
    expect(await en((tx) => desconectarCanal(tx, U, canalId))).toEqual({ ok: true })
    const [c] = await en((tx) => listarCanales(tx))
    expect(c).toMatchObject({ estado: 'desconectado', publicaciones: 2, importados: 1 })
    expect(c).not.toHaveProperty('credenciales')
    const r = await conEmpresa(otra, (tx) =>
      conectarCanal(tx, U, { tipo: 'tiendanube', nombre: 'Ahora sí', cuenta: '123', credenciales: {} }),
    )
    expect(r).toMatchObject({ ok: true })
  })

  it('renueva el token vencido de Mercado Libre y guarda el nuevo', async () => {
    const r = await en((tx) =>
      conectarCanal(tx, U, {
        tipo: 'mercadolibre',
        nombre: 'ML',
        cuenta: '555',
        credenciales: { acceso: 'viejo', renovacion: 'r1', vence: 0, usuario: '555' } satisfies CredencialesML,
      }),
    )
    if (!r.ok) throw new Error(r.error)
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.mercadolibre.com/oauth/token')
      expect(String(init?.body)).toContain('refresh_token=r1')
      return new Response(JSON.stringify({ access_token: 'nuevo', refresh_token: 'r2', expires_in: 21600, user_id: 555 }))
    }) as typeof fetch
    const [canal] = await en((tx) => tx.select().from(canalesVenta).where(eq(canalesVenta.id, r.id)))
    await conectorDe(empresa, canal, f, 1_000)
    const [despues] = await en((tx) => tx.select().from(canalesVenta).where(eq(canalesVenta.id, r.id)))
    expect(credencialesDe<CredencialesML>(despues)).toMatchObject({ acceso: 'nuevo', renovacion: 'r2', usuario: '555' })
  })
})

describe('traducción de cada plataforma', () => {
  it('Mercado Libre: estado, comprador y variantes', () => {
    const p = pedidoDeML({
      id: 2000001,
      status: 'paid',
      date_created: '2026-10-01T10:00:00.000-03:00',
      currency_id: 'ARS',
      total_amount: 15000,
      buyer: { nickname: 'COMPRADOR123', first_name: 'Ana', last_name: 'Gómez' },
      order_items: [
        { item: { id: 'MLA1', title: 'Tóner', variation_id: 77, seller_sku: 'TON-1' }, quantity: 1, unit_price: 15000 },
      ],
    })
    expect(p).toMatchObject({
      estado: 'pagado',
      comprador: { nombre: 'Ana Gómez (COMPRADOR123)' },
      items: [{ externoId: 'MLA1', varianteId: '77', sku: 'TON-1', precioUnitario: 15000 }],
    })
  })

  it('WooCommerce: precio final por unidad y documento de los plugins', () => {
    const p = pedidoDeWoo({
      id: 55,
      number: '55',
      status: 'processing',
      date_created_gmt: '2026-10-01T13:00:00',
      currency: 'ARS',
      total: '2420.00',
      billing: { first_name: 'Juan', last_name: 'Paz', email: 'j@p.com' },
      meta_data: [{ key: '_billing_dni', value: '20123456' }],
      line_items: [
        { product_id: 9, variation_id: 0, sku: 'X', name: 'Cosa', quantity: 2, total: '2000.00', total_tax: '420.00' },
      ],
    })
    expect(p).toMatchObject({ estado: 'pagado', comprador: { documento: '20123456' }, items: [{ precioUnitario: 1210 }] })
    expect(p.fecha.toISOString()).toBe('2026-10-01T13:00:00.000Z')
    expect(normalizarTienda('mitienda.com.ar/')).toBe('https://mitienda.com.ar')
    expect(normalizarTienda('http://mitienda.com.ar')).toBeNull()
  })

  it('firmas de los avisos', () => {
    const cuerpo = '{"store_id":123,"event":"order/paid","id":9001}'
    expect(firmaTN(cuerpo, createHmac('sha256', 'secreto-tn').update(cuerpo).digest('hex'))).toBe(true)
    expect(firmaTN(cuerpo, 'abc')).toBe(false)
    expect(firmaTN(cuerpo + ' ', createHmac('sha256', 'secreto-tn').update(cuerpo).digest('hex'))).toBe(false)
    const firma = createHmac('sha256', 's').update('{"id":1}').digest('base64')
    expect(firmaWoo('{"id":1}', firma, 's')).toBe(true)
    expect(firmaWoo('{"id":2}', firma, 's')).toBe(false)
  })

  it('el estado de la conexión va firmado y vence', () => {
    const t = crearFlujo({ tipo: 'mercadolibre', empresaId: 'e', usuarioId: 'u' }, 0)
    expect(leerFlujo(t, 1000)).toMatchObject({ tipo: 'mercadolibre', empresaId: 'e' })
    expect(leerFlujo(t, 16 * 60_000)).toBeNull()
    const [cuerpo, firma] = t.split('.')
    const otro = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cuerpo, 'base64url').toString()), empresaId: 'x' }))
    expect(leerFlujo(`${otro.toString('base64url')}.${firma}`, 1000)).toBeNull()
  })
})
