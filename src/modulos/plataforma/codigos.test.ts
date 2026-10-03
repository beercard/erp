import { beforeAll, describe, expect, it } from 'vitest'

import { comoPlataforma } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas } from '../../db/schema'
import { cambiarCodigo, codigoLibre, empresaPorCodigo } from './codigos'

describe('Códigos de ingreso de las empresas', () => {
  let alfa: string
  beforeAll(async () => {
    const db = await baseDePrueba()
    ;[{ id: alfa }] = await db
      .insert(empresas)
      .values([
        { razonSocial: 'Alfa S.A.', cuit: '30111111118', condicionIva: 1, codigo: 'alfa' },
        { razonSocial: 'Alfa Dos', cuit: '30222222226', condicionIva: 1, codigo: 'alfa-2' },
      ])
      .returning()
  })

  it('propone un código libre a partir del nombre', async () => {
    expect(await comoPlataforma((tx) => codigoLibre(tx, 'ALFA S.A.'))).toBe('alfa-3')
    expect(await comoPlataforma((tx) => codigoLibre(tx, 'Gamma S.R.L.'))).toBe('gamma')
  })

  it('encuentra la empresa por su código y lo cambia sin pisar otro', async () => {
    expect(await empresaPorCodigo('ALFA')).toMatchObject({ id: alfa, nombre: 'Alfa S.A.' })
    expect(await empresaPorCodigo('no-existe')).toBeNull()
    expect(await empresaPorCodigo('www')).toBeNull()
    expect(await cambiarCodigo(alfa, 'alfa-2')).toMatchObject({ ok: false })
    expect(await cambiarCodigo(alfa, 'admin')).toMatchObject({ ok: false })
    expect(await cambiarCodigo(alfa, 'Alfa-Nueva')).toEqual({ ok: true, codigo: 'alfa-nueva' })
    expect(await empresaPorCodigo('alfa')).toBeNull()
  })
})
