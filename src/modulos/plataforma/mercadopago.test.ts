import { createHmac } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { baseDePrueba } from '../../db/pruebas'
import { empresas, eventosSuscripcion, suscripciones } from '../../db/schema'
import type { BaseDeDatos } from '../../db/conexion'
import { firmaValida, importeDebito, procesarAviso } from './mercadopago'

describe('cobro con Mercado Pago', () => {
  let base: BaseDeDatos
  let empresa: string

  beforeAll(async () => {
    base = await baseDePrueba()
    ;[{ id: empresa }] = await base
      .insert(empresas)
      .values({ razonSocial: 'Cliente S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    await base.insert(suscripciones).values({
      empresaId: empresa,
      plan: 'inicial',
      estado: 'activa',
      pagadoHasta: '2026-10-01',
      mpSuscripcion: 'pre-1',
      mpEstado: 'authorized',
    })
    // Pidió pasar a Pyme: se aplica con el primer cobro.
    await base.insert(eventosSuscripcion).values({
      empresaId: empresa,
      tipo: 'pedido',
      estado: 'pendiente',
      detalle: { plan: 'pyme', ciclo: 'mensual', aplicaciones: [], usuariosAdicionales: 0 },
    })
  })

  it('importe con IVA; en el anual, diez meses', () => {
    const s = { plan: 'pyme', aplicaciones: [], usuariosAdicionales: 0, precioAcordado: null }
    expect(importeDebito({ ...s, ciclo: 'mensual' })).toBe(157_179)
    expect(importeDebito({ ...s, ciclo: 'anual' })).toBe(1_571_790)
    expect(importeDebito({ ...s, ciclo: 'mensual', precioAcordado: '100000' })).toBe(121_000)
  })

  it('verifica la firma de la notificación', () => {
    const manifiesto = 'id:123;request-id:req-9;ts:1700000000;'
    const v1 = createHmac('sha256', 'secreto').update(manifiesto).digest('hex')
    expect(firmaValida(`ts=1700000000,v1=${v1}`, 'req-9', '123', 'secreto')).toBe(true)
    expect(firmaValida(`ts=1700000000,v1=${v1}`, 'req-9', '124', 'secreto')).toBe(false)
    expect(firmaValida(`ts=1700000001,v1=${v1}`, 'req-9', '123', 'secreto')).toBe(false)
    expect(firmaValida(null, 'req-9', '123', 'secreto')).toBe(false)
  })

  it('un cobro aprobado aplica el cambio pendiente y corre el vencimiento, una sola vez', async () => {
    const f = (async (url: string | URL | Request) => {
      expect(String(url)).toBe('https://api.mercadopago.com/authorized_payments/777')
      return new Response(
        JSON.stringify({
          id: 777,
          preapproval_id: 'pre-1',
          status: 'processed',
          transaction_amount: 157179,
          payment: { status: 'approved' },
        }),
      )
    }) as typeof fetch
    expect(await procesarAviso(f, 'subscription_authorized_payment', '777')).toBe('pagado')
    expect(await procesarAviso(f, 'subscription_authorized_payment', '777')).toBe('repetido')
    const [s] = await base.select().from(suscripciones).where(eq(suscripciones.empresaId, empresa))
    expect(s).toMatchObject({ plan: 'pyme', estado: 'activa' })
    expect(s.pagadoHasta! > '2026-10-01').toBe(true)
    const pagos = await base.select().from(eventosSuscripcion).where(eq(eventosSuscripcion.tipo, 'pago'))
    expect(pagos).toHaveLength(1)
  })

  it('un cobro rechazado no registra nada', async () => {
    const f = (async () =>
      new Response(
        JSON.stringify({ id: 778, preapproval_id: 'pre-1', status: 'recycling', payment: { status: 'rejected' } }),
      )) as typeof fetch
    expect(await procesarAviso(f, 'subscription_authorized_payment', '778')).toBe('sin aprobar')
  })
})
