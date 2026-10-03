import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { depositos, empresas, eventosSuscripcion, suscripciones, usuarios } from '../../db/schema'
import { hashearClave } from '../../lib/auth/clave'
import {
  controlarLimite,
  crearEmpresa,
  pedidosPendientes,
  pedirCambio,
  registrarPago,
  resolverPedido,
  suscripcionDe,
} from './suscripciones'

let base: Awaited<ReturnType<typeof baseDePrueba>>
let usuario: string
let admin: string
let empresa: string

beforeAll(async () => {
  base = await baseDePrueba()
  const hash = await hashearClave('clave-prueba-2026')
  const [u, a] = await base
    .insert(usuarios)
    .values([
      { email: 'nueva@pyme.com', nombre: 'Nueva', hashClave: hash },
      { email: 'admin@plataforma.com', nombre: 'Admin', hashClave: hash, adminPlataforma: true },
    ])
    .returning()
  usuario = u.id
  admin = a.id
})

describe('alta de una empresa', () => {
  it('crea la empresa con la prueba gratis y lo mínimo para empezar', async () => {
    const r = await crearEmpresa(
      usuario,
      { razonSocial: 'Nueva Pyme S.R.L.', cuit: '30-71597482-3', condicionIva: 1 },
      '2026-10-02',
    )
    if (!r.ok) throw new Error(r.error)
    empresa = r.empresaId
    const s = await suscripcionDe(empresa)
    expect([s.plan, s.estado, s.pruebaHasta]).toEqual(['pyme', 'prueba', '2026-11-01'])
    expect(await conEmpresa(empresa, (tx) => tx.select().from(depositos))).toHaveLength(1)
  })

  it('no repite un CUIT ni acepta uno inválido', async () => {
    expect(await crearEmpresa(usuario, { razonSocial: 'Otra', cuit: '30715974823', condicionIva: 1 })).toMatchObject({
      ok: false,
    })
    expect(await crearEmpresa(usuario, { razonSocial: 'Otra', cuit: '30715974824', condicionIva: 1 })).toMatchObject({
      ok: false,
    })
  })
})

describe('cambios de plan', () => {
  it('durante la prueba el cambio se aplica en el momento', async () => {
    const r = await pedirCambio(empresa, usuario, { plan: 'empresa', aplicaciones: ['contratos'] }, '2026-10-05')
    expect(r).toEqual({ ok: true, aplicado: true })
    const s = await suscripcionDe(empresa)
    expect([s.plan, s.aplicaciones, s.estado]).toEqual(['empresa', ['contratos'], 'prueba'])
  })

  it('una aplicación no se contrata sobre un plan que no la admite', async () => {
    expect(await pedirCambio(empresa, usuario, { plan: 'inicial', aplicaciones: ['contratos'] })).toMatchObject({ ok: false })
  })

  it('con la suscripción paga, el cambio queda como pedido hasta que la plataforma lo confirma', async () => {
    expect(await registrarPago(admin, empresa, { importe: '319800', medio: 'transferencia' }, '2026-10-10')).toEqual({ ok: true })
    const pagada = await suscripcionDe(empresa)
    expect([pagada.estado, pagada.pagadoHasta, pagada.pruebaHasta]).toEqual(['activa', '2026-11-10', null])

    const r = await pedirCambio(
      empresa,
      usuario,
      { plan: 'pyme', aplicaciones: ['contratos'], usuariosAdicionales: 1 },
      '2026-10-11',
    )
    expect(r).toEqual({ ok: true, aplicado: false })
    expect((await suscripcionDe(empresa)).plan).toBe('empresa')
    const [pedido] = await pedidosPendientes()
    expect(pedido.empresaId).toBe(empresa)
    expect(await resolverPedido(admin, pedido.id, true)).toEqual({ ok: true, empresaId: empresa })
    const s = await suscripcionDe(empresa)
    expect([s.plan, s.usuariosAdicionales]).toEqual(['pyme', 1])
    expect(await resolverPedido(admin, pedido.id, true)).toMatchObject({ ok: false })
  })

  it('pasar al plan gratis se aplica solo y deja de vencer', async () => {
    expect(await pedirCambio(empresa, usuario, { plan: 'gratis' })).toEqual({ ok: true, aplicado: true })
    const s = await suscripcionDe(empresa)
    expect([s.plan, s.aplicaciones, s.pagadoHasta]).toEqual(['gratis', [], null])
  })

  it('el plan gratis no deja sumar otro usuario y todo queda en el historial', async () => {
    expect(await controlarLimite(empresa, 'usuarios')).toContain('máximo de usuarios (1)')
    const eventos = await base.select().from(eventosSuscripcion).where(eq(eventosSuscripcion.empresaId, empresa))
    expect(eventos.map((e) => e.tipo).sort()).toEqual(['alta', 'cambio', 'cambio', 'cambio', 'pago', 'pedido'])
    expect((await base.select().from(empresas).where(eq(empresas.id, empresa)))[0].razonSocial).toBe('Nueva Pyme S.R.L.')
    expect(await base.select().from(suscripciones)).toHaveLength(1)
  })
})
