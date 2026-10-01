import { describe, expect, it } from 'vitest'

import { calcularLinea, calcularTotales, convertir } from './calculo'

describe('cálculo de documentos', () => {
  it('renglón con descuento, a centavos', () => {
    // 3 × 1.234,56 = 3.703,68; −10 % = 3.333,312 → 3.333,31; IVA 21 % = 699,9951 → 700,00
    expect(calcularLinea({ cantidad: '3', precioUnitario: '1234.56', descuento: '10', alicuotaIva: 5 })).toMatchObject({
      neto: '3333.31',
      iva: '700.00',
    })
  })

  it('el IVA se redondea una vez por alícuota, no por renglón', () => {
    // Tres renglones de 0,05 al 21 %: por renglón daría 0,01 × 3 = 0,03; por alícuota, 0,15 × 21 % = 0,0315 → 0,03.
    // Con 0,07: por renglón 0,01 × 3 = 0,03; por alícuota 0,21 × 21 % = 0,0441 → 0,04.
    const { totales } = calcularTotales([
      { cantidad: '1', precioUnitario: '0.07', alicuotaIva: 5 },
      { cantidad: '1', precioUnitario: '0.07', alicuotaIva: 5 },
      { cantidad: '1', precioUnitario: '0.07', alicuotaIva: 5 },
    ])
    expect(totales).toMatchObject({ neto: '0.21', iva: '0.04', total: '0.25' })
  })

  it('separa la base y el IVA de cada alícuota', () => {
    const { totales } = calcularTotales([
      { cantidad: '2', precioUnitario: '100', alicuotaIva: 5 },
      { cantidad: '1', precioUnitario: '1000', alicuotaIva: 4 },
      { cantidad: '1', precioUnitario: '50', alicuotaIva: 3 },
    ])
    expect(totales.porAlicuota).toEqual([
      { alicuotaIva: 3, base: '50.00', iva: '0.00' },
      { alicuotaIva: 4, base: '1000.00', iva: '105.00' },
      { alicuotaIva: 5, base: '200.00', iva: '42.00' },
    ])
    expect(totales).toMatchObject({ neto: '1250.00', iva: '147.00', total: '1397.00' })
  })

  it('cantidades fraccionarias y alícuota desconocida', () => {
    expect(calcularLinea({ cantidad: '0.5', precioUnitario: '99.99', alicuotaIva: 5 }).neto).toBe('50.00')
    expect(() => calcularLinea({ cantidad: '1', precioUnitario: '1', alicuotaIva: 99 })).toThrow()
  })

  it('convierte entre pesos y dólares con la cotización del documento', () => {
    expect(convertir('12.50', 'DOL', 'PES', '1545')).toBe('19312.5000')
    expect(convertir('19312.50', 'PES', 'DOL', '1545')).toBe('12.5000')
    expect(convertir('10', 'PES', 'PES', '1545')).toBe('10')
    expect(() => convertir('10', 'DOL', 'PES', '0')).toThrow()
    expect(() => convertir('10', 'DOL', '060', '1545')).toThrow()
  })
})
