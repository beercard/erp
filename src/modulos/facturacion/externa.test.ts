import { describe, expect, it } from 'vitest'

import { leerCsv } from '../../lib/csv'
import { fechaDePlanilla, leerPlanillaFacturas, numeroDePlanilla, registrosDeFilas } from './externa'

describe('planilla de facturas', () => {
  it('agrupa las filas por la columna factura, entiende IVA, condición y números argentinos', () => {
    const csv = [
      'Factura;CUIT;Razón social;Condición IVA;Email;Descripción;Cantidad;Precio;IVA',
      '1;30-99917652-2;Clínica del Litoral S.A.;RI;pagos@clinica.com.ar;Abono;1;1.234,50;21',
      '1;30-99917652-2;;;;Visita;2;500;10,5',
      '2;27333444;Lucía Pérez;Consumidor final;;Curso;1;1000;',
    ].join('\n')
    const { facturas, errores } = leerPlanillaFacturas(leerCsv(csv, ';'))
    expect(errores).toEqual([])
    expect(facturas).toHaveLength(2)
    expect(facturas[0].filas).toEqual([2, 3])
    expect(facturas[0].factura.cliente).toMatchObject({
      documento: '30999176522',
      condicionIva: 1,
      email: 'pagos@clinica.com.ar',
    })
    expect(facturas[0].factura.renglones).toEqual([
      { descripcion: 'Abono', cantidad: 1, precioUnitario: 1234.5, iva: 5 },
      { descripcion: 'Visita', cantidad: 2, precioUnitario: 500, iva: 4 },
    ])
    expect(facturas[1].factura.cliente).toMatchObject({ documento: '27333444', condicionIva: 5 })
    expect(facturas[1].factura.renglones[0].iva).toBe(5)
  })

  it('sin columna factura, cada fila es una factura; informa la fila con error', () => {
    const { facturas, errores } = leerPlanillaFacturas(
      registrosDeFilas([
        ['cuit', 'descripcion', 'precio', 'iva'],
        ['30999176522', 'Curso', '100', '21'],
        ['30999176522', 'Curso', '100', '19'],
        ['', '', '', ''],
      ]),
    )
    expect(facturas).toHaveLength(1)
    expect(errores).toEqual([{ fila: 3, error: 'renglones.0.iva: IVA 19 %: va 0, 2.5, 5, 10.5, 21 o 27.' }])
  })

  it('avisa las columnas que faltan', () => {
    expect(leerPlanillaFacturas([{ cliente: 'x', importe: '1' }]).errores.map((e) => e.error)).toEqual([
      'Falta la columna "cuit" (o "dni").',
      'Falta la columna "descripcion".',
    ])
  })

  it('números y fechas', () => {
    expect(numeroDePlanilla('$ 1.234.567,89')).toBe('1234567.89')
    expect(numeroDePlanilla('1234.5')).toBe('1234.5')
    expect(fechaDePlanilla('3/10/2026')).toBe('2026-10-03')
    expect(fechaDePlanilla('46298')).toBe('2026-10-03')
    expect(fechaDePlanilla('')).toBeUndefined()
  })
})
