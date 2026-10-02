import { describe, expect, it } from 'vitest'

import { PERMISOS } from './permisos'
import { funcionDePermiso, permitidoPorPlan, PLANES, precioDeLista, situacion, type DatosSuscripcion } from './planes'

const s = (d: Partial<DatosSuscripcion>): DatosSuscripcion => ({
  plan: 'pyme',
  estado: 'activa',
  aplicaciones: [],
  usuariosAdicionales: 0,
  pruebaHasta: null,
  pagadoHasta: null,
  ...d,
})

describe('planes', () => {
  it('cada plan incluye todo lo del anterior y cuesta más', () => {
    for (let i = 1; i < PLANES.length; i++) {
      expect(PLANES[i - 1].funciones.every((f) => PLANES[i].funciones.includes(f))).toBe(true)
      expect(PLANES[i].precioMensual).toBeGreaterThan(PLANES[i - 1].precioMensual)
    }
  })

  it('todo permiso del catálogo tiene función o va en todos los planes', () => {
    const sinFuncion = Object.keys(PERMISOS).filter((p) => !funcionDePermiso(p))
    expect(sinFuncion.every((p) => p.startsWith('maestros.') || p.startsWith('empresa.'))).toBe(true)
  })

  it('las aplicaciones solo cuentan en los planes que las admiten', () => {
    expect(situacion(s({ plan: 'pyme', aplicaciones: ['contratos'] }), '2026-10-02').funciones).toContain('contratos')
    expect(situacion(s({ plan: 'gratis', aplicaciones: ['contratos'] }), '2026-10-02').funciones).not.toContain('contratos')
  })

  it('la prueba cuenta los días y al vencer deja solo consultar', () => {
    const prueba = situacion(s({ estado: 'prueba', pruebaHasta: '2026-10-12' }), '2026-10-02')
    expect([prueba.diasDePrueba, prueba.soloLectura]).toEqual([10, false])
    const vencida = situacion(s({ estado: 'prueba', pruebaHasta: '2026-10-01' }), '2026-10-02')
    expect(vencida.soloLectura).toBe(true)
    expect(permitidoPorPlan(vencida, 'compras.ver')).toBe(true)
    expect(permitidoPorPlan(vencida, 'compras.cargar')).toBe(false)
    expect(permitidoPorPlan(vencida, 'empresa.suscripcion')).toBe(true)
  })

  it('impaga: avisa en los días de gracia y después solo consulta', () => {
    const gracia = situacion(s({ pagadoHasta: '2026-09-28' }), '2026-10-02')
    expect([gracia.soloLectura, gracia.aviso?.tono]).toEqual([false, 'aviso'])
    expect(situacion(s({ pagadoHasta: '2026-09-15' }), '2026-10-02').soloLectura).toBe(true)
  })

  it('el plan recorta lo que el rol permite', () => {
    const gratis = situacion(s({ plan: 'gratis' }), '2026-10-02')
    expect(permitidoPorPlan(gratis, 'ventas.facturar')).toBe(true)
    expect(permitidoPorPlan(gratis, 'ventas.presupuestos')).toBe(false)
    expect(permitidoPorPlan(gratis, 'maestros.terceros')).toBe(true)
  })

  it('precio de lista con aplicaciones y usuarios adicionales', () => {
    expect(precioDeLista({ plan: 'pyme', aplicaciones: ['contratos'], usuariosAdicionales: 2 })).toBe(
      129_900 + 59_900 + 2 * 14_900,
    )
  })
})
