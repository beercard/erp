import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { articulos, depositos, empresas, ordenesCompraItems, terceros } from '../../db/schema'
import { cantidadSugerida, faltantes, generarOrdenesReposicion } from './reposicion'
import { registrarMovimientos } from './stock'

const U = '00000000-0000-4000-8000-000000000001'

describe('Reposición de stock', () => {
  let empresa: string
  let toner: string
  let papel: string
  let proveedor: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Stock S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
    empresa = e.id
    await en(async (tx) => {
      const [dep] = await tx.insert(depositos).values({ codigo: '01', nombre: 'Central' }).returning()
      ;[{ id: proveedor }] = await tx
        .insert(terceros)
        .values({
          codigo: 'P1',
          razonSocial: 'Insumos SRL',
          esCliente: false,
          esProveedor: true,
          tipoDocumento: 80,
          numeroDocumento: '30711222339',
          condicionIva: 1,
        })
        .returning()
      const arts = await tx
        .insert(articulos)
        .values([
          { codigo: 'T1', nombre: 'Tóner negro', stockMinimo: '10', proveedorId: proveedor, costo: '15000' },
          { codigo: 'P1', nombre: 'Resma A4', stockMinimo: '50', loteReposicion: '100' },
          { codigo: 'OK', nombre: 'Con stock', stockMinimo: '5' },
        ])
        .returning()
      ;[{ id: toner }, { id: papel }] = arts
      const ok = arts[2].id
      await registrarMovimientos(tx, U, [
        { articuloId: toner, depositoId: dep.id, cantidad: '3', tipo: 'inicial' },
        { articuloId: papel, depositoId: dep.id, cantidad: '40', tipo: 'inicial' },
        { articuloId: ok, depositoId: dep.id, cantidad: '9', tipo: 'inicial' },
      ])
    })
  })

  it('sugiere reponer hasta el doble del mínimo o el lote, y nunca menos de lo que falta', () => {
    expect(cantidadSugerida('10', '3', null)).toBe('17')
    expect(cantidadSugerida('50', '40', '100')).toBe('100')
    expect(cantidadSugerida('50', '10', '20')).toBe('40')
    expect(cantidadSugerida('10', '12', null)).toBe('0')
  })

  it('lista los que están bajo el mínimo y arma una orden por proveedor; lo pedido cuenta como en camino', async () => {
    const f = await en((tx) => faltantes(tx))
    expect(f.map((x) => [x.nombre, x.stock, x.sugerido, x.proveedor])).toEqual([
      ['Tóner negro', '3', '17', 'Insumos SRL'],
      ['Resma A4', '40', '100', null],
    ])
    const r = await en((tx) => generarOrdenesReposicion(tx, U, '2026-10-03'))
    expect(r).toMatchObject({ ok: true, sinProveedor: ['Resma A4'] })
    if (!r.ok) return
    expect(r.ordenes).toHaveLength(1)
    const items = await en((tx) => tx.select().from(ordenesCompraItems))
    expect(items[0]).toMatchObject({ articuloId: toner, cantidad: '17.0000', precioUnitario: '15000.0000' })
    // Ya pedido: el tóner deja de faltar.
    expect((await en((tx) => faltantes(tx))).map((x) => x.nombre)).toEqual(['Resma A4'])
  })
})
