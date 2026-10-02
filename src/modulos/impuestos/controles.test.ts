import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { compras, comprasTributos, comprobantes, empresas, terceros } from '../../db/schema'
import { controlesIva } from './controles'

describe('controles antes de presentar el Libro IVA', () => {
  let empresa: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Controles S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    await en(async (tx) => {
      const [bien, mal, mono, sinCuit] = await tx
        .insert(terceros)
        .values([
          {
            codigo: 'C1',
            razonSocial: 'Bien S.A.',
            tipoDocumento: 80,
            numeroDocumento: '30999176522',
            condicionIva: 1,
            esProveedor: true,
          },
          { codigo: 'C2', razonSocial: 'CUIT Malo', tipoDocumento: 80, numeroDocumento: '30999176521', condicionIva: 1 },
          {
            codigo: 'P1',
            razonSocial: 'Mono',
            tipoDocumento: 80,
            numeroDocumento: '20123456786',
            condicionIva: 6,
            esProveedor: true,
          },
          { codigo: 'P2', razonSocial: 'Sin CUIT', tipoDocumento: 99, condicionIva: 1, esProveedor: true },
        ])
        .returning()
      const v = (x: Record<string, unknown>) => ({
        clase: 'factura',
        letra: 'A',
        tipo: 1,
        puntoVenta: 1,
        estado: 'autorizado',
        cae: '1',
        terceroId: bien.id,
        receptorDocTipo: 80,
        receptorDocNumero: '30999176522',
        total: '100',
        ...x,
      })
      await tx.insert(comprobantes).values([
        v({ numero: 10, fecha: '2026-09-30' }), // último de septiembre
        v({ numero: 12, fecha: '2026-10-02' }), // falta el 11
        v({ numero: 13, fecha: '2026-10-03', terceroId: mal.id, receptorDocNumero: '30999176521' }),
        v({ numero: 14, fecha: '2026-10-04', moneda: 'DOL', cotizacion: '1' }),
        v({ clase: 'nota_credito', tipo: 3, numero: 1, fecha: '2026-10-05' }),
        v({ numero: null, cae: null, estado: 'borrador', fecha: '2026-10-06' }),
        v({ numero: null, cae: null, estado: 'pendiente_verificacion', fecha: '2026-10-07' }),
      ])
      const c = (x: Record<string, unknown>) => ({
        clase: 'factura',
        letra: 'A',
        tipo: 1,
        puntoVenta: 5,
        fecha: '2026-10-01',
        periodoIva: '2026-10',
        terceroId: bien.id,
        neto: '100',
        iva: '21',
        total: '121',
        ...x,
      })
      const [conPercepcion] = await tx
        .insert(compras)
        .values([
          c({ numero: 1 }),
          c({ numero: 2, terceroId: sinCuit.id }),
          c({ numero: 3, fecha: '2026-11-05' }),
          c({ numero: 4, terceroId: mono.id }),
          c({ numero: 5, iva: '0' }),
          c({ numero: 6, periodoIva: '2026-11' }),
        ])
        .returning()
      await tx.insert(comprasTributos).values({ compraId: conPercepcion.id, tipo: 'percepcion_iibb', importe: '10' })
    })
  })

  it('encuentra cada problema y lo explica', async () => {
    const l = await en((tx) => controlesIva(tx, '2026-10'))
    const hay = (texto: string, gravedad?: 'error' | 'aviso') =>
      expect(l.some((c) => c.problema.includes(texto) && (!gravedad || c.gravedad === gravedad))).toBe(true)
    hay('sin confirmar con ARCA', 'error')
    hay('borrador', 'aviso')
    hay('CUIT del cliente inválido', 'error')
    hay('sin cotización', 'error')
    hay('sin el comprobante que corrige', 'aviso')
    hay('Falta el número 11', 'aviso')
    hay('proveedor no tiene un CUIT válido', 'error')
    hay('posterior al período', 'error')
    hay('cargado como monotributista', 'aviso')
    hay('sin IVA', 'aviso')
    hay('Percepción de IIBB sin jurisdicción', 'aviso')
    hay('cargada para el período 11/2026', 'aviso')
    // Los errores van primero y cada uno lleva a su comprobante.
    expect(l[0].gravedad).toBe('error')
    expect(l.every((c) => c.enlace.startsWith('/facturas/') || c.enlace.startsWith('/compras/'))).toBe(true)
    // La factura 12 con CUIT válido y en pesos no tiene más que el hueco.
    expect(l.filter((c) => c.comprobante.startsWith('FC A 00001-00000012'))).toHaveLength(1)
  })

  it('un mes sin problemas no tiene controles', async () => {
    expect(await en((tx) => controlesIva(tx, '2027-01'))).toEqual([])
  })
})
