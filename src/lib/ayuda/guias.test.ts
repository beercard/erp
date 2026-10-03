import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { buscarGuias, GUIAS } from './guias'

describe('guías de ayuda', () => {
  it('tienen ids únicos y las relacionadas existen', () => {
    const ids = GUIAS.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const g of GUIAS) for (const r of g.relacionadas ?? []) expect(ids, `${g.id} → ${r}`).toContain(r)
  })

  it('cada guía lleva a una pantalla que existe', () => {
    for (const g of GUIAS.filter((x) => x.pantalla)) {
      const ruta = g.pantalla!.href.replace(/^\//, '')
      const dir = join(process.cwd(), 'src/app/(app)', ruta)
      // Los catálogos de configuración salen de una ruta dinámica.
      const existe =
        existsSync(join(dir, 'page.tsx')) || existsSync(join(process.cwd(), 'src/app/(app)/configuracion/[clave]/page.tsx'))
      expect(existe && (existsSync(join(dir, 'page.tsx')) || ruta.startsWith('configuracion/')), g.id).toBe(true)
    }
  })

  it('se buscan sin importar tildes', () => {
    expect(buscarGuias('certificado').map((g) => g.id)).toContain('arca')
    expect(buscarGuias('padrón').map((g) => g.id)).toContain('padron-arca')
    expect(buscarGuias('zzz')).toEqual([])
  })
})
