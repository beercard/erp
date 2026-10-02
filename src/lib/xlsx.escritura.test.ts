import { describe, expect, it } from 'vitest'

import { escribirXlsx, leerXlsx } from './xlsx'
import { crc32 } from './zip'

describe('escribir planillas', () => {
  it('crc32 conocido', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('lo que se escribe se vuelve a leer igual', async () => {
    const datos = escribirXlsx([
      {
        nombre: 'Jornadas',
        filas: [
          ['Técnico', 'Horas', 'Nota'],
          ['Martín Gómez', 7.5, 'a < b & "c"'],
          ['Laura', null, 'ñandú'],
        ],
      },
      { nombre: 'Otra/hoja', filas: [['x']] },
    ])
    expect(await leerXlsx(datos)).toEqual([
      ['Técnico', 'Horas', 'Nota'],
      ['Martín Gómez', '7.5', 'a < b & "c"'],
      ['Laura', '', 'ñandú'],
    ])
  })
})
