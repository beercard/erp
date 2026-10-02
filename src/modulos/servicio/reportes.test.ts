import { describe, expect, it } from 'vitest'

import type { Campo } from './formularios'
import { celda, columnas } from './reportes'

describe('reportes por formulario', () => {
  it('une las columnas de todas las versiones, con el título más nuevo', () => {
    const v1: Campo[] = [
      { id: 'seccion', tipo: 'seccion', etiqueta: 'Datos' },
      { id: 'km', tipo: 'numero', etiqueta: 'Km' },
      { id: 'viejo', tipo: 'texto', etiqueta: 'Ya no está' },
    ]
    const v2: Campo[] = [
      { id: 'km', tipo: 'numero', etiqueta: 'Kilómetros' },
      { id: 'nuevo', tipo: 'si_no', etiqueta: 'Nuevo' },
    ]
    expect(columnas([v1, v2]).map((c) => c.etiqueta)).toEqual(['Kilómetros', 'Nuevo', 'Ya no está'])
  })

  it('celdas: números como números, el resto legible', () => {
    expect(celda({ id: 'n', tipo: 'numero', etiqueta: 'N' }, '12,5')).toBe(12.5)
    expect(celda({ id: 'c', tipo: 'contador', etiqueta: 'C' }, { contador: 152340, creditos: 15 })).toBe(152340)
    expect(celda({ id: 'm', tipo: 'multiple', etiqueta: 'M', opciones: ['a', 'b'] }, ['a', 'b'])).toBe('a, b')
    expect(celda({ id: 'f', tipo: 'fotos', etiqueta: 'F' }, ['x', 'y'])).toBe('2 fotos')
    expect(celda({ id: 'e', tipo: 'equipo', etiqueta: 'E' }, 'id1', new Map([['id1', 'Ricoh · E123']]))).toBe('Ricoh · E123')
    expect(
      celda({ id: 't', tipo: 'tabla', etiqueta: 'T' }, [
        ['a', '1'],
        ['b', '2'],
      ]),
    ).toBe('a · 1\nb · 2')
    expect(celda({ id: 'x', tipo: 'texto', etiqueta: 'X' }, '')).toBeNull()
  })
})
