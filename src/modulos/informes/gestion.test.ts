import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { articulos, comprobantes, comprobantesItems, empresas, terceros } from '../../db/schema'
import { informeGestion } from './gestion'

describe('informes de gestión', () => {
  let empresa: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Gestión S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    await en(async (tx) => {
      const [a, b] = await tx
        .insert(terceros)
        .values([
          { codigo: 'A', razonSocial: 'Grande', tipoDocumento: 99, condicionIva: 5 },
          { codigo: 'B', razonSocial: 'Chico', tipoDocumento: 99, condicionIva: 5 },
        ])
        .returning()
      const [toner] = await tx.insert(articulos).values({ codigo: 'TN', nombre: 'Tóner', alicuotaIva: 5 }).returning()
      const cbte = async (v: {
        tercero: string
        clase?: string
        fecha: string
        neto: string
        cotizacion?: string
        numero: number
        cant?: string
      }) => {
        const [c] = await tx
          .insert(comprobantes)
          .values({
            clase: v.clase ?? 'factura',
            letra: 'B',
            tipo: v.clase === 'nota_credito' ? 8 : 6,
            puntoVenta: 1,
            numero: v.numero,
            fecha: v.fecha,
            estado: 'autorizado',
            cae: '1',
            terceroId: v.tercero,
            neto: v.neto,
            total: v.neto,
            cotizacion: v.cotizacion ?? '1',
            moneda: v.cotizacion ? 'DOL' : 'PES',
          })
          .returning()
        await tx.insert(comprobantesItems).values({
          comprobanteId: c.id,
          orden: 1,
          articuloId: toner.id,
          descripcion: 'Tóner',
          cantidad: v.cant ?? '1',
          precioUnitario: v.neto,
          alicuotaIva: 5,
          neto: v.neto,
          iva: '0',
        })
      }
      await cbte({ tercero: a.id, fecha: '2026-10-02', neto: '1000', numero: 1, cant: '2' })
      await cbte({ tercero: a.id, fecha: '2026-10-03', neto: '10', cotizacion: '1000', numero: 2 }) // US$ 10 a $ 1000
      await cbte({ tercero: a.id, clase: 'nota_credito', fecha: '2026-10-04', neto: '500', numero: 3, cant: '1' })
      await cbte({ tercero: b.id, fecha: '2026-10-05', neto: '200', numero: 4 })
      await cbte({ tercero: b.id, fecha: '2026-09-15', neto: '300', numero: 5 })
      // Un borrador no cuenta.
      await tx.insert(comprobantes).values({
        clase: 'factura',
        letra: 'B',
        tipo: 6,
        puntoVenta: 1,
        fecha: '2026-10-06',
        terceroId: b.id,
        neto: '99999',
        total: '99999',
      })
    })
  })

  it('ventas netas en pesos, la nota de crédito resta', async () => {
    const d = await en((tx) => informeGestion(tx, { desde: '2026-10-01', hasta: '2026-10-31' }))
    expect(d.resumen).toMatchObject({ neto: 10700, facturas: 3, clientes: 2 })
    expect(d.clientes.map((c) => [c.nombre, c.neto])).toEqual([
      ['Grande', 10500],
      ['Chico', 200],
    ])
    expect(d.articulos).toMatchObject([{ codigo: 'TN', cantidad: 3, neto: 10700 }])
    expect(d.vendedores).toMatchObject([{ nombre: 'Sin vendedor', neto: 10700 }])
    expect(d.meses).toHaveLength(12)
    expect(d.meses.at(-1)).toEqual({ mes: '2026-10', neto: 10700 })
    expect(d.meses.at(-2)).toEqual({ mes: '2026-09', neto: 300 })
  })
})
