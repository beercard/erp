import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, listasPrecios } from '../../db/schema'
import { fijarPrecio, guardarArticulo, preciosDeArticulo } from './articulo'

let empresa: string
let general: string
let tarjeta: string
const USUARIO = '00000000-0000-4000-8000-000000000001'
const base = { codigo: 'TN-1', nombre: 'Tóner negro', tipo: 'producto', alicuotaIva: '5', llevaStock: true, llevaSerie: false, monedaCosto: 'PES', unidad: 'unidad' }

beforeAll(async () => {
  const db = await baseDePrueba()
  const [e] = await db.insert(empresas).values({ razonSocial: 'Prueba S.A.', cuit: '30111111118', condicionIva: 1 }).returning()
  empresa = e.id
  ;[general, tarjeta] = await conEmpresa(empresa, async (tx) => {
    const [g] = await tx.insert(listasPrecios).values({ codigo: '001', nombre: 'General' }).returning()
    const [t] = await tx.insert(listasPrecios).values({ codigo: '002', nombre: 'Tarjeta', listaBaseId: g.id, porcentaje: '10' }).returning()
    return [g.id, t.id]
  })
})

describe('artículos', () => {
  it('valida y no deja repetir el código', async () => {
    const r = await conEmpresa(empresa, (tx) => guardarArticulo(tx, USUARIO, { ...base, costo: '-5' }))
    expect(r).toMatchObject({ ok: false, errores: { costo: expect.any(String) } })
    const ok = await conEmpresa(empresa, (tx) => guardarArticulo(tx, USUARIO, { ...base, costo: '1.234,50' }))
    expect(ok.ok).toBe(true)
    const repetido = await conEmpresa(empresa, (tx) => guardarArticulo(tx, USUARIO, { ...base, nombre: 'Otro' }))
    expect(repetido).toMatchObject({ ok: false, errores: { codigo: 'Ese código ya lo tiene otro artículo.' } })
  })

  it('un servicio nunca lleva stock', async () => {
    const r = await conEmpresa(empresa, (tx) => guardarArticulo(tx, USUARIO, { ...base, codigo: 'SV-1', tipo: 'servicio' }))
    if (!r.ok) throw new Error('no grabó')
    const [p] = await conEmpresa(empresa, (tx) => preciosDeArticulo(tx, r.id))
    expect(p.vigente).toBeNull()
  })

  it('el precio guarda historial, programa aumentos y la lista derivada lo sigue', async () => {
    const art = await conEmpresa(empresa, (tx) => guardarArticulo(tx, USUARIO, { ...base, codigo: 'TN-2' }))
    if (!art.ok) throw new Error('no grabó')
    await conEmpresa(empresa, (tx) => fijarPrecio(tx, USUARIO, art.id, general, { precio: '1000', desde: '2025-01-01' }))
    await conEmpresa(empresa, (tx) => fijarPrecio(tx, USUARIO, art.id, general, { precio: '1.200,50', desde: '2026-01-01' }))
    await conEmpresa(empresa, (tx) => fijarPrecio(tx, USUARIO, art.id, general, { precio: '5000', desde: '2999-01-01' }))
    const [g, t] = await conEmpresa(empresa, (tx) => preciosDeArticulo(tx, art.id))
    expect(g.vigente).toBe('1200.50')
    expect(g.historial.map((h) => h.precio)).toEqual(['1200.50', '1000.00'])
    expect(g.programado).toEqual({ precio: '5000.00', desde: '2999-01-01' })
    // Tarjeta = General + 10 %: 1200,50 × 1,10 = 1320,55
    expect(t.vigente).toBe('1320.55')
    const enDerivada = await conEmpresa(empresa, (tx) => fijarPrecio(tx, USUARIO, art.id, tarjeta, { precio: '1', desde: '2026-01-01' }))
    expect(enDerivada.ok).toBe(false)
  })
})
