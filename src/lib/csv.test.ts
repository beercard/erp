import { describe, expect, it } from 'vitest'

import { leerCsv } from './csv'

describe('leerCsv', () => {
  it('lee comillas, comillas escapadas, campos vacíos y saltos de línea dentro de un campo', () => {
    const texto = '﻿codigo,nombre,precio\r\n"001","Tóner ""negro""",10.5\r\n"002","Línea uno\r\nlínea dos",\r\n"003",,7\r\n'
    expect(leerCsv(texto)).toEqual([
      { codigo: '001', nombre: 'Tóner "negro"', precio: '10.5' },
      { codigo: '002', nombre: 'Línea uno\r\nlínea dos', precio: '' },
      { codigo: '003', nombre: '', precio: '7' },
    ])
  })

  it('sin salto final y con archivo vacío', () => {
    expect(leerCsv('a,b\n1,2')).toEqual([{ a: '1', b: '2' }])
    expect(leerCsv('')).toEqual([])
  })
})
