import { beforeAll, describe, expect, it } from 'vitest'

import type { BaseDeDatos } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas } from '../../db/schema'
import { guardarDiseno, guardarLogo, LOGO_MAXIMO, obtenerMarca, quitarLogo, tipoDeImagen } from './marca'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50])
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

describe('tipoDeImagen', () => {
  it('reconoce PNG, JPG y WebP por su contenido, no por el nombre', () => {
    expect(tipoDeImagen(PNG)).toBe('image/png')
    expect(tipoDeImagen(JPG)).toBe('image/jpeg')
    expect(tipoDeImagen(WEBP)).toBe('image/webp')
    expect(tipoDeImagen(SVG)).toBeNull()
    expect(tipoDeImagen(new Uint8Array())).toBeNull()
  })
})

describe('marca de la empresa', () => {
  let base: BaseDeDatos
  let a: string
  let b: string
  beforeAll(async () => {
    base = await baseDePrueba()
    const filas = await base
      .insert(empresas)
      .values([
        { razonSocial: 'Alfa S.A.', cuit: '30111111118', condicionIva: 1 },
        { razonSocial: 'Beta S.A.', cuit: '30222222226', condicionIva: 1 },
      ])
      .returning()
    a = filas[0].id
    b = filas[1].id
  })

  it('sin configurar usa el diseño clásico y no tiene logo', async () => {
    expect(await conEmpresa(a, (tx) => obtenerMarca(tx))).toEqual({ diseno: 'clasico', color: '#0f766e', logo: null })
  })

  it('guarda el diseño y el color, y rechaza lo inválido', async () => {
    expect((await conEmpresa(a, (tx) => guardarDiseno(tx, 'barroco', '#000000'))).ok).toBe(false)
    expect((await conEmpresa(a, (tx) => guardarDiseno(tx, 'moderno', 'rojo'))).ok).toBe(false)
    expect((await conEmpresa(a, (tx) => guardarDiseno(tx, 'moderno', '#1D4ED8'))).ok).toBe(true)
    const m = await conEmpresa(a, (tx) => obtenerMarca(tx))
    expect(m.diseno).toBe('moderno')
    expect(m.color).toBe('#1d4ed8')
  })

  it('guarda el logo como data URL, rechaza SVG y archivos grandes, y lo quita', async () => {
    expect((await conEmpresa(a, (tx) => guardarLogo(tx, SVG))).ok).toBe(false)
    const grande = new Uint8Array(LOGO_MAXIMO + 1)
    grande.set(PNG)
    expect((await conEmpresa(a, (tx) => guardarLogo(tx, grande))).ok).toBe(false)
    expect((await conEmpresa(a, (tx) => guardarLogo(tx, PNG))).ok).toBe(true)
    const m = await conEmpresa(a, (tx) => obtenerMarca(tx))
    expect(m.logo).toMatch(/^data:image\/png;base64,/)
    expect(m.diseno).toBe('moderno')
    await conEmpresa(a, (tx) => quitarLogo(tx))
    expect((await conEmpresa(a, (tx) => obtenerMarca(tx))).logo).toBeNull()
  })

  it('cada empresa ve solo su marca', async () => {
    await conEmpresa(a, (tx) => guardarLogo(tx, JPG))
    expect(await conEmpresa(b, (tx) => obtenerMarca(tx))).toEqual({ diseno: 'clasico', color: '#0f766e', logo: null })
  })
})
