import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { comoPlataforma } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, suscripciones, usuarios } from '../../db/schema'
import { importeDebito } from './debito'
import { crearDebito } from './mercadopago'
import { pedirCambio, suscripcionDe } from './suscripciones'

let U: string
let empresa: string
let pedidos: { url: string; metodo?: string; cuerpo: Record<string, unknown> }[] = []
const mp = (async (url: string, init?: RequestInit) => {
  pedidos.push({ url, metodo: init?.method, cuerpo: JSON.parse(String(init?.body ?? '{}')) })
  return new Response(JSON.stringify({ id: 'pre-nuevo', init_point: 'https://mp/autorizar', status: 'authorized' }))
}) as typeof fetch

const poner = (valores: Partial<typeof suscripciones.$inferInsert>) =>
  comoPlataforma((tx) => tx.update(suscripciones).set(valores).where(eq(suscripciones.empresaId, empresa)))

beforeAll(async () => {
  process.env.MP_ACCESS_TOKEN = 'prueba'
  const db = await baseDePrueba()
  ;[{ id: empresa }] = await db
    .insert(empresas)
    .values({ razonSocial: 'Débito S.A.', cuit: '30111111118', condicionIva: 1 })
    .returning()
  ;[{ id: U }] = await db.insert(usuarios).values({ email: 'duena@debito.com', nombre: 'Dueña', hashClave: 'x' }).returning()
  await db.insert(suscripciones).values({ empresaId: empresa, plan: 'inicial', estado: 'activa', pagadoHasta: '2026-11-01' })
})
afterAll(() => {
  delete process.env.MP_ACCESS_TOKEN
})
beforeEach(() => {
  pedidos = []
})

describe('débito automático y cambios de plan', () => {
  it('con débito activo y el mismo ciclo, actualiza el importe en Mercado Pago y aplica el cambio', async () => {
    await poner({ mpSuscripcion: 'pre-1', mpEstado: 'authorized' })
    expect(await pedirCambio(empresa, U, { plan: 'pyme' }, '2026-10-04', mp)).toEqual({ ok: true, aplicado: true })
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0]).toMatchObject({ url: 'https://api.mercadopago.com/preapproval/pre-1', metodo: 'PUT' })
    const importe = importeDebito({
      plan: 'pyme',
      aplicaciones: [],
      usuariosAdicionales: 0,
      ciclo: 'mensual',
      precioAcordado: null,
    })
    expect(pedidos[0].cuerpo).toEqual({ auto_recurring: { transaction_amount: importe, currency_id: 'ARS' } })
    expect((await suscripcionDe(empresa)).plan).toBe('pyme')
  })

  it('cambiar de ciclo no toca el débito: queda pedido hasta pagar con uno nuevo', async () => {
    expect(await pedirCambio(empresa, U, { plan: 'pyme', ciclo: 'anual' }, '2026-10-04', mp)).toEqual({
      ok: true,
      aplicado: false,
    })
    expect(pedidos).toHaveLength(0)
  })

  it('un débito nuevo cancela antes el anterior', async () => {
    await crearDebito(mp, {
      empresaId: empresa,
      email: 'duena@debito.com',
      suscripcion: { plan: 'pyme', ciclo: 'anual', aplicaciones: [], usuariosAdicionales: 0, precioAcordado: null },
      vuelta: 'https://erp/volver',
    })
    expect(pedidos.map((p) => [p.metodo, p.url])).toEqual([
      ['PUT', 'https://api.mercadopago.com/preapproval/pre-1'],
      ['POST', 'https://api.mercadopago.com/preapproval'],
    ])
    expect(pedidos[0].cuerpo).toEqual({ status: 'cancelled' })
    expect((await suscripcionDe(empresa)).mpSuscripcion).toBe('pre-nuevo')
  })

  it('pasar al plan gratis cancela el débito', async () => {
    await poner({ mpSuscripcion: 'pre-2', mpEstado: 'authorized' })
    expect(await pedirCambio(empresa, U, { plan: 'gratis' }, '2026-10-04', mp)).toEqual({ ok: true, aplicado: true })
    expect(pedidos[0]).toMatchObject({ url: 'https://api.mercadopago.com/preapproval/pre-2', cuerpo: { status: 'cancelled' } })
    expect((await suscripcionDe(empresa)).mpEstado).toBe('cancelled')
  })
})
