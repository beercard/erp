import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, terceros } from '../../db/schema'
import { registrarCompra } from '../compras/compras'
import { leerMisComprobantes, registrarFaltantes } from '../compras/misComprobantes'
import { cruceCompras } from './cruceArca'

const U = '00000000-0000-4000-8000-000000000001'

const fila = (f: {
  fecha: string
  tipo: number
  pv: number
  nro: number
  cuit: string
  nombre: string
  neto: string
  iva: string
  total: string
}) =>
  `"${f.fecha}";"${f.tipo}";"${f.pv}";"${f.nro}";"${f.nro}";"7612";"80";"${f.cuit}";"${f.nombre}";"80";"30715974823";"1";"PES";"0";"0";"0";"0";"0";"0";"0";"${f.iva}";"${f.neto}";"0";"0";"${f.neto}";"0";"0";"0";"${f.iva}";"${f.total}"`
const CABECERA =
  '"Fecha de Emisión";"Tipo de Comprobante";"Punto de Venta";"Número Desde";"Número Hasta";"Cód. Autorización";"Tipo Doc. Emisor";"Nro. Doc. Emisor";"Denominación Emisor";"Tipo Doc. Receptor";"Nro. Doc. Receptor";"Tipo Cambio";"Moneda";"Imp. Neto Gravado IVA 0%";"IVA 2,5%";"Imp. Neto Gravado IVA 2,5%";"IVA 5%";"Imp. Neto Gravado IVA 5%";"IVA 10,5%";"Imp. Neto Gravado IVA 10,5%";"IVA 21%";"Imp. Neto Gravado IVA 21%";"IVA 27%";"Imp. Neto Gravado IVA 27%";"Imp. Neto Gravado Total";"Imp. Neto No Gravado";"Imp. Op. Exentas";"Otros Tributos";"IVA";"Imp. Total"'

describe('cruce del libro de compras con Mis Comprobantes', () => {
  let empresa: string
  let proveedor: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)
  const compra = (numero: number, extra: Record<string, unknown> = {}) =>
    en((tx) =>
      registrarCompra(tx, U, {
        terceroId: proveedor,
        clase: 'factura',
        letra: 'A',
        puntoVenta: 2,
        numero,
        fecha: '2026-10-05',
        periodoIva: '2026-10',
        items: [],
        iva: [{ alicuotaIva: 5, base: '1000', importe: '210' }],
        ...extra,
      }),
    )

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Cruce S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
    empresa = e.id
    ;[{ id: proveedor }] = await en((tx) =>
      tx
        .insert(terceros)
        .values({
          codigo: 'P1',
          razonSocial: 'Mayorista S.A.',
          esCliente: false,
          esProveedor: true,
          tipoDocumento: 80,
          numeroDocumento: '30999176522',
          condicionIva: 1,
        })
        .returning(),
    )
    for (const r of [
      await compra(1), // coincide
      await compra(2, { iva: [{ alicuotaIva: 5, base: '2000', importe: '420' }] }), // ARCA dice 1000 + 210
      await compra(3, { periodoIva: '2026-11' }), // coincide, pero se computa en noviembre
      await compra(9), // ARCA no lo tiene
    ])
      if (!r.ok) throw new Error(r.error)
  })

  it('separa lo que falta, las diferencias, lo de otro período y lo que ARCA no tiene', async () => {
    const csv = [
      CABECERA,
      ...[1, 2, 3].map((n) =>
        fila({
          fecha: '2026-10-05',
          tipo: 1,
          pv: 2,
          nro: n,
          cuit: '30999176522',
          nombre: 'MAYORISTA SA',
          neto: '1000',
          iva: '210',
          total: '1210',
        }),
      ),
      fila({
        fecha: '2026-10-20',
        tipo: 1,
        pv: 2,
        nro: 4,
        cuit: '30999176522',
        nombre: 'MAYORISTA SA',
        neto: '5000',
        iva: '1050',
        total: '6050',
      }),
      fila({
        fecha: '2026-10-21',
        tipo: 11,
        pv: 1,
        nro: 7,
        cuit: '20123456786',
        nombre: 'JUAN PEREZ',
        neto: '0',
        iva: '0',
        total: '800',
      }),
      fila({
        fecha: '2026-09-30',
        tipo: 1,
        pv: 2,
        nro: 99,
        cuit: '30999176522',
        nombre: 'MAYORISTA SA',
        neto: '1',
        iva: '0.21',
        total: '1.21',
      }),
    ].join('\r\n')
    const { filas } = await leerMisComprobantes(new TextEncoder().encode(csv))
    const c = await en((tx) => cruceCompras(tx, '2026-10', filas))
    expect(c).toMatchObject({ leidos: 6, delMes: 5, fueraDelMes: 1, coinciden: 1, creditoSinComputar: 1050 })
    expect(c.faltan.map((f) => f.numero).sort()).toEqual([4, 7])
    expect(c.diferencias).toMatchObject([{ totalSistema: 2420, totalArca: 1210, ivaSistema: 420, ivaArca: 210 }])
    expect(c.otroPeriodo).toMatchObject([{ periodoIva: '2026-11' }])
    expect(c.soloEnSistema.map((x) => x.numero)).toEqual([9])

    // Registrar los que faltan los deja coincidiendo.
    const r = await en((tx) => registrarFaltantes(tx, U, c.faltan))
    expect(r.registrados).toBe(2)
    const despues = await en((tx) => cruceCompras(tx, '2026-10', filas))
    expect([despues.faltan.length, despues.coinciden]).toEqual([0, 3])
  })
})
