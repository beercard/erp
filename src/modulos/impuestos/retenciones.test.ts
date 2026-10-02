import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  comprobantes,
  comprobantesTributos,
  empresas,
  pagos,
  percepcionesIibb,
  recibos,
  recibosValores,
  retenciones,
  terceros,
} from '../../db/schema'
import {
  baseIibb,
  importeSicore,
  LARGO_SICORE,
  lineasSicore,
  percepcionesPracticadas,
  retencionesPracticadas,
  retencionesSufridas,
} from './retenciones'

describe('IIBB y retenciones', () => {
  let empresa: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Agente S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
    empresa = e.id
    await en(async (tx) => {
      const [cliente, cordoba, proveedor] = await tx
        .insert(terceros)
        .values([
          {
            codigo: 'C1',
            razonSocial: 'Cliente Porteño',
            tipoDocumento: 80,
            numeroDocumento: '30999176522',
            condicionIva: 1,
            provincia: 'C',
          },
          {
            codigo: 'C2',
            razonSocial: 'Cliente Cordobés',
            tipoDocumento: 80,
            numeroDocumento: '30711222337',
            condicionIva: 1,
            provincia: 'X',
          },
          {
            codigo: 'P1',
            razonSocial: 'Proveedor',
            esCliente: false,
            esProveedor: true,
            tipoDocumento: 80,
            numeroDocumento: '20123456786',
            condicionIva: 1,
            gananciasInscripto: true,
          },
        ])
        .returning()
      const [perc] = await tx
        .insert(percepcionesIibb)
        .values({ nombre: 'IIBB CABA', provincia: 'C', alicuota: '3', activa: true })
        .returning()
      const [f1] = await tx
        .insert(comprobantes)
        .values({
          clase: 'factura',
          letra: 'A',
          tipo: 1,
          puntoVenta: 1,
          numero: 1,
          fecha: '2026-10-05',
          estado: 'autorizado',
          cae: '1',
          terceroId: cliente.id,
          neto: '3000',
          iva: '630',
          tributos: '90',
          total: '3720',
        })
        .returning()
      await tx.insert(comprobantesTributos).values({
        comprobanteId: f1.id,
        tributo: 7,
        descripcion: 'IIBB',
        base: '3000',
        alicuota: '3',
        importe: '90',
        percepcionId: perc.id,
      })
      await tx.insert(comprobantes).values({
        clase: 'factura',
        letra: 'A',
        tipo: 1,
        puntoVenta: 1,
        numero: 2,
        fecha: '2026-10-06',
        estado: 'autorizado',
        cae: '2',
        terceroId: cordoba.id,
        neto: '1000',
        iva: '210',
        total: '1210',
      })
      const [pago] = await tx
        .insert(pagos)
        .values({ numero: 25, fecha: '2026-10-10', terceroId: proveedor.id, total: '980000' })
        .returning()
      await tx.insert(retenciones).values({
        pagoId: pago.id,
        impuesto: 'ganancias',
        regimen: '78',
        numero: 12,
        base: '756000',
        alicuota: '2',
        importe: '15120',
      })
      const [anulado] = await tx
        .insert(pagos)
        .values({ numero: 26, fecha: '2026-10-11', terceroId: proveedor.id, total: '1', estado: 'anulado' })
        .returning()
      await tx
        .insert(retenciones)
        .values({ pagoId: anulado.id, impuesto: 'ganancias', regimen: '78', numero: 13, base: '1', importe: '1' })
      const [rec] = await tx
        .insert(recibos)
        .values({ puntoVenta: 1, numero: 8, fecha: '2026-10-15', terceroId: cliente.id, total: '3720' })
        .returning()
      await tx.insert(recibosValores).values([
        { reciboId: rec.id, medio: 'transferencia', importe: '3600' },
        { reciboId: rec.id, medio: 'retencion_iibb', importe: '120', numeroValor: 'CERT-55' },
      ])
    })
  })

  it('percepciones por jurisdicción y base por provincia del cliente', async () => {
    const p = await en((tx) => percepcionesPracticadas(tx, '2026-10'))
    expect(p).toMatchObject([{ jurisdiccion: expect.any(String), base: 3000, importe: 90, comprobante: 'FC A 00001-00000001' }])
    const b = await en((tx) => baseIibb(tx, '2026-10'))
    expect(b.total).toBe(4000)
    expect(b.lista[0]).toMatchObject({ provincia: 'C', neto: 3000, porcentaje: 75 })
    const s = await en((tx) => retencionesSufridas(tx, '2026-10'))
    expect(s).toMatchObject([{ impuesto: 'iibb', importe: 120, certificado: 'CERT-55' }])
  })

  it('archivo de SICORE: 144 caracteres y cada campo en su lugar', async () => {
    expect(importeSicore('1234.5', 14)).toBe('00000001234,50')
    const lista = await en((tx) => retencionesPracticadas(tx, '2026-10'))
    expect(lista).toHaveLength(1) // el pago anulado no cuenta
    const [l] = lineasSicore(lista)
    expect(l).toHaveLength(LARGO_SICORE)
    expect(l.slice(0, 2)).toBe('06')
    expect(l.slice(2, 12)).toBe('10/10/2026')
    expect(l.slice(12, 28)).toBe('0000000000000025')
    expect(l.slice(28, 44)).toBe('0000000980000,00')
    expect(l.slice(44, 47)).toBe('217')
    expect(l.slice(47, 50)).toBe('078')
    expect(l.slice(50, 51)).toBe('1')
    expect(l.slice(51, 65)).toBe('00000756000,00')
    expect(l.slice(75, 77)).toBe('01')
    expect(l.slice(78, 92)).toBe('00000015120,00')
    expect(l.slice(108, 110)).toBe('80')
    expect(l.slice(110, 130)).toBe('00000000020123456786')
    expect(l.slice(130, 144)).toBe('00000000000012')
  })
})
