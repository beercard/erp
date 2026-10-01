import { describe, expect, it } from 'vitest'

import { hashearClave, problemaDeClave, verificarClave } from './auth/clave'
import { formatearCuit, validarCuit } from './cuit'
import { aImporte, aplicarPorcentaje, formatearMonto, monto, sumar } from './dinero'
import { tienePermiso } from './permisos'

describe('CUIT', () => {
  it('acepta CUIT válidos con o sin guiones', () => {
    // 20-12345678-6: verificador calculado a mano (suma ponderada 148; 11 - 148 % 11 = 6).
    expect(validarCuit('20-12345678-6')).toEqual({ valido: true, cuit: '20123456786' })
    expect(validarCuit('20123456786').valido).toBe(true)
  })

  it('explica por qué un CUIT no es válido', () => {
    const r = validarCuit('20-12345678-9')
    expect(r.valido).toBe(false)
    if (!r.valido) expect(r.error).toContain('debería ser 6')
    expect(validarCuit('2012345').valido).toBe(false)
    expect(validarCuit('99-12345678-6').valido).toBe(false)
  })

  it('formatea con guiones', () => {
    expect(formatearCuit('20123456786')).toBe('20-12345678-6')
  })
})

describe('dinero', () => {
  it('no tiene errores de punto flotante', () => {
    expect(sumar(['0.1', '0.2']).equals(monto('0.3'))).toBe(true)
  })

  it('redondea a centavos la mitad hacia arriba', () => {
    expect(aImporte('10.005')).toBe('10.01')
    expect(aImporte('10.004')).toBe('10.00')
    expect(aImporte('-10.005')).toBe('-10.01')
  })

  it('aplica porcentajes (IVA, recargos de listas)', () => {
    expect(aImporte(aplicarPorcentaje('1000', '21'))).toBe('1210.00')
    expect(aImporte(aplicarPorcentaje('1000', '-10'))).toBe('900.00')
  })

  it('formatea en pesos argentinos', () => {
    expect(formatearMonto('1234567.5')).toBe('$ 1.234.567,50')
    expect(formatearMonto('-12', 'US$')).toBe('−US$ 12,00')
  })
})

describe('permisos', () => {
  it('resuelve comodines', () => {
    expect(tienePermiso(['*'], 'ventas.facturar')).toBe(true)
    expect(tienePermiso(['ventas.*'], 'ventas.facturar')).toBe(true)
    expect(tienePermiso(['ventas.*'], 'compras.pagar')).toBe(false)
    expect(tienePermiso(['*.ver'], 'stock.ver')).toBe(true)
    expect(tienePermiso(['*.ver'], 'stock.ajustar')).toBe(false)
    expect(tienePermiso([], 'maestros.ver')).toBe(false)
  })
})

describe('contraseñas', () => {
  it('verifica la clave correcta y rechaza otra', async () => {
    const hash = await hashearClave('clave-de-prueba-123')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(await verificarClave('clave-de-prueba-123', hash)).toBe(true)
    expect(await verificarClave('clave-de-prueba-124', hash)).toBe(false)
    expect(await verificarClave('x', 'formato-invalido')).toBe(false)
  })

  it('pide un mínimo de calidad', () => {
    expect(problemaDeClave('corta1')).not.toBeNull()
    expect(problemaDeClave('solamenteletras')).not.toBeNull()
    expect(problemaDeClave('letras-y-numeros-2026')).toBeNull()
  })
})
