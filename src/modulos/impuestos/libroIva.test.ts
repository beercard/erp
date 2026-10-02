import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { comprobantes, comprobantesIva, comprobantesTributos, empresas, terceros } from '../../db/schema'
import { anularCompra, registrarCompra } from '../compras/compras'
import { importe, LARGOS, libroIva, limitesPeriodo, texto, tipoCambio } from './libroIva'
import { guardarGenerada, marcarPresentada, periodoCerrado, reabrirPeriodo } from './presentaciones'

const U = '00000000-0000-4000-8000-000000000001'

describe('formato de ancho fijo', () => {
  it('importes, textos y tipo de cambio', () => {
    expect(importe('1234.5')).toBe('000000000123450')
    expect(importe(0)).toBe('000000000000000')
    expect(texto('Ñandú & Cía. S.R.L.', 10)).toBe('NANDU & CI')
    expect(texto('ab', 5)).toBe('AB   ')
    expect(tipoCambio('1')).toBe('0001000000')
    expect(tipoCambio('1385.5')).toBe('1385500000')
    expect(limitesPeriodo('2026-02')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
  })
})

describe('Libro IVA Digital', () => {
  let empresa: string
  let cliente: string
  let consumidor: string
  let proveedor: string
  let monotributista: string
  let compraOct: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Libros S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
    empresa = e.id
    ;[cliente, consumidor, proveedor, monotributista] = (
      await en((tx) =>
        tx
          .insert(terceros)
          .values([
            {
              codigo: 'C1',
              razonSocial: 'Estudio Pérez S.A.',
              tipoDocumento: 80,
              numeroDocumento: '30999176522',
              condicionIva: 1,
            },
            { codigo: 'C2', razonSocial: 'Consumidor', tipoDocumento: 99, condicionIva: 5 },
            {
              codigo: 'P1',
              razonSocial: 'Mayorista S.A.',
              esCliente: false,
              esProveedor: true,
              tipoDocumento: 80,
              numeroDocumento: '30711222337',
              condicionIva: 1,
            },
            {
              codigo: 'P2',
              razonSocial: 'Técnico',
              esCliente: false,
              esProveedor: true,
              tipoDocumento: 80,
              numeroDocumento: '20123456786',
              condicionIva: 6,
            },
          ])
          .returning(),
      )
    ).map((x) => x.id)

    // Ventas de octubre: una A con IVA 21 % y 10,5 % y percepción de IIBB; una B a consumidor final; una NC A.
    await en(async (tx) => {
      const [a] = await tx
        .insert(comprobantes)
        .values({
          clase: 'factura',
          letra: 'A',
          tipo: 1,
          puntoVenta: 2,
          numero: 15,
          fecha: '2026-10-05',
          estado: 'autorizado',
          cae: '76000000000001',
          terceroId: cliente,
          receptorNombre: 'Estudio Pérez S.A.',
          receptorDocTipo: 80,
          receptorDocNumero: '30999176522',
          receptorCondicionIva: 1,
          neto: '1500',
          iva: '262.5',
          tributos: '45',
          total: '1807.5',
        })
        .returning()
      await tx.insert(comprobantesIva).values([
        { comprobanteId: a.id, alicuotaIva: 5, base: '1000', importe: '210' },
        { comprobanteId: a.id, alicuotaIva: 4, base: '500', importe: '52.5' },
      ])
      await tx
        .insert(comprobantesTributos)
        .values({ comprobanteId: a.id, tributo: 7, descripcion: 'Percepción IIBB', base: '1500', alicuota: '3', importe: '45' })
      const [b] = await tx
        .insert(comprobantes)
        .values({
          clase: 'factura',
          letra: 'B',
          tipo: 6,
          puntoVenta: 2,
          numero: 40,
          fecha: '2026-10-06',
          estado: 'autorizado',
          cae: '76000000000002',
          terceroId: consumidor,
          receptorDocTipo: 99,
          receptorDocNumero: '0',
          neto: '100',
          iva: '21',
          total: '121',
        })
        .returning()
      await tx.insert(comprobantesIva).values({ comprobanteId: b.id, alicuotaIva: 5, base: '100', importe: '21' })
      const [nc] = await tx
        .insert(comprobantes)
        .values({
          clase: 'nota_credito',
          letra: 'A',
          tipo: 3,
          puntoVenta: 2,
          numero: 3,
          fecha: '2026-10-20',
          estado: 'autorizado',
          cae: '76000000000003',
          terceroId: cliente,
          receptorDocTipo: 80,
          receptorDocNumero: '30999176522',
          neto: '100',
          iva: '21',
          total: '121',
        })
        .returning()
      await tx.insert(comprobantesIva).values({ comprobanteId: nc.id, alicuotaIva: 5, base: '100', importe: '21' })
      // Un borrador y una de noviembre no entran.
      await tx.insert(comprobantes).values({
        clase: 'factura',
        letra: 'A',
        tipo: 1,
        puntoVenta: 2,
        fecha: '2026-10-25',
        terceroId: cliente,
        neto: '1',
        total: '1',
      })
      await tx.insert(comprobantes).values({
        clase: 'factura',
        letra: 'A',
        tipo: 1,
        puntoVenta: 2,
        numero: 16,
        fecha: '2026-11-01',
        estado: 'autorizado',
        cae: '1',
        terceroId: cliente,
        total: '1',
      })
    })

    // Compras: una A (período octubre) con percepción de IVA, y una C de un monotributista.
    const a = await en((tx) =>
      registrarCompra(tx, U, {
        terceroId: proveedor,
        clase: 'factura',
        letra: 'A',
        puntoVenta: 3,
        numero: 100,
        fecha: '2026-10-01',
        periodoIva: '2026-10',
        items: [],
        iva: [{ alicuotaIva: 5, base: '10000', importe: '2100' }],
        tributos: [{ tipo: 'percepcion_iva', importe: '300' }],
      }),
    )
    if (!a.ok) throw new Error(a.error)
    compraOct = a.id
    const c = await en((tx) =>
      registrarCompra(tx, U, {
        terceroId: monotributista,
        clase: 'factura',
        letra: 'C',
        puntoVenta: 1,
        numero: 7,
        fecha: '2026-10-02',
        periodoIva: '2026-10',
        items: [],
        iva: [{ alicuotaIva: 5, base: '5000' }],
      }),
    )
    if (!c.ok) throw new Error(c.error)
  })

  it('genera los cuatro archivos con el largo exacto', async () => {
    const l = await en((tx) => libroIva(tx, '2026-10'))
    expect(l.ventas.lineas.cbte).toHaveLength(3)
    expect(l.ventas.lineas.alicuotas).toHaveLength(4)
    expect(l.compras.lineas.cbte).toHaveLength(2)
    expect(l.compras.lineas.alicuotas).toHaveLength(1) // la C no lleva alícuotas
    for (const x of l.ventas.lineas.cbte) expect(x).toHaveLength(LARGOS.ventasCbte)
    for (const x of l.ventas.lineas.alicuotas) expect(x).toHaveLength(LARGOS.ventasAlicuotas)
    for (const x of l.compras.lineas.cbte) expect(x).toHaveLength(LARGOS.comprasCbte)
    for (const x of l.compras.lineas.alicuotas) expect(x).toHaveLength(LARGOS.comprasAlicuotas)
    expect(new TextDecoder().decode(l.archivos[0].datos).endsWith('\r\n')).toBe(true)
  })

  it('cada campo en su posición', async () => {
    const l = await en((tx) => libroIva(tx, '2026-10'))
    const v = l.ventas.lineas.cbte[0]
    expect(v.slice(0, 8)).toBe('20261005') // fecha
    expect(v.slice(8, 11)).toBe('001') // factura A
    expect(v.slice(11, 16)).toBe('00002') // punto de venta
    expect(v.slice(16, 36)).toBe('00000000000000000015')
    expect(v.slice(56, 58)).toBe('80')
    expect(v.slice(58, 78)).toBe('00000000030999176522')
    expect(v.slice(78, 108)).toBe(texto('Estudio Pérez S.A.', 30))
    expect(v.slice(108, 123)).toBe(importe('1807.5')) // total
    expect(v.slice(183, 198)).toBe(importe('45')) // percepción IIBB
    expect(v.slice(228, 231)).toBe('PES')
    expect(v.slice(231, 241)).toBe('0001000000')
    expect(v.slice(241, 242)).toBe('2') // dos alícuotas
    expect(v.slice(242, 243)).toBe(' ')
    // La B a consumidor final: documento 99 y número en cero.
    const b = l.ventas.lineas.cbte[1]
    expect([b.slice(8, 11), b.slice(56, 58), b.slice(58, 78)]).toEqual(['006', '99', '0'.repeat(20)])
    // Alícuota: base, código y IVA.
    expect(l.ventas.lineas.alicuotas.slice(0, 2).map((x) => x.slice(28))).toEqual([
      importe('500') + '0004' + importe('52.5'),
      importe('1000') + '0005' + importe('210'),
    ])

    const c = l.compras.lineas.cbte[0]
    expect(c.slice(8, 11)).toBe('001')
    expect(c.slice(36, 52)).toBe(' '.repeat(16)) // sin despacho
    expect(c.slice(54, 74)).toBe('00000000030711222337')
    expect(c.slice(149, 164)).toBe(importe('300')) // percepción de IVA
    expect(c.slice(239, 254)).toBe(importe('2100')) // crédito fiscal computable
    const mono = l.compras.lineas.cbte[1]
    expect([mono.slice(8, 11), mono.slice(237, 238), mono.slice(239, 254)]).toEqual(['011', '0', importe(0)])
  })

  it('totales en pesos: la nota de crédito resta', async () => {
    const l = await en((tx) => libroIva(tx, '2026-10'))
    expect(l.ventas.resumen).toMatchObject({ cantidad: 3, neto: 1500, iva: 262.5, percepciones: 45, total: 1807.5 })
    expect(l.ventas.resumen.porAlicuota['21']).toEqual({ base: 1000, iva: 210 })
    expect(l.compras.resumen).toMatchObject({ cantidad: 2, iva: 2100 })
  })

  it('presentado, el período se cierra; reabierto, va la rectificativa', async () => {
    const l = await en((tx) => libroIva(tx, '2026-10'))
    const g = await en((tx) =>
      guardarGenerada(tx, U, {
        impuesto: 'iva_digital',
        periodo: '2026-10',
        archivo: l.archivos[0].datos,
        nombreArchivo: 'libro.zip',
        resumen: {},
      }),
    )
    expect(g.secuencia).toBe(0)
    expect(await en((tx) => marcarPresentada(tx, U, g.id, { transaccion: '123456' }))).toEqual({ ok: true })
    expect(await en((tx) => periodoCerrado(tx, 'iva_digital', '2026-10'))).toMatchObject({ transaccion: '123456' })

    // Con el período cerrado no se registra ni se anula una compra de octubre.
    const nueva = await en((tx) =>
      registrarCompra(tx, U, {
        terceroId: proveedor,
        clase: 'factura',
        letra: 'A',
        puntoVenta: 3,
        numero: 101,
        fecha: '2026-10-30',
        periodoIva: '2026-10',
        items: [],
        iva: [{ alicuotaIva: 5, base: '100', importe: '21' }],
      }),
    )
    expect(nueva).toMatchObject({ ok: false, error: expect.stringContaining('ya se presentó') })
    expect(await en((tx) => anularCompra(tx, U, compraOct))).toMatchObject({ ok: false })

    expect(await en((tx) => reabrirPeriodo(tx, U, g.id, 'x'))).toMatchObject({ ok: false })
    expect(await en((tx) => reabrirPeriodo(tx, U, g.id, 'Faltó una factura de compra'))).toEqual({ ok: true })
    expect(await en((tx) => periodoCerrado(tx, 'iva_digital', '2026-10'))).toBeNull()
    const r = await en((tx) =>
      guardarGenerada(tx, U, {
        impuesto: 'iva_digital',
        periodo: '2026-10',
        archivo: l.archivos[0].datos,
        nombreArchivo: 'libro.zip',
        resumen: {},
      }),
    )
    expect(r.secuencia).toBe(1)
  })
})
