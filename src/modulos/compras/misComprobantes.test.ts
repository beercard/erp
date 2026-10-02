import { deflateRawSync } from 'node:zlib'

import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, escalaGanancias, regimenesGanancias, terceros } from '../../db/schema'
import { obtenerCompra } from './compras'
import { conciliar, interpretarTabla, leerMisComprobantes, registrarFaltantes } from './misComprobantes'
import { cargarValoresRg830 } from './rg830'

const U = '00000000-0000-4000-8000-000000000001'
let empresa: string
const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

// Formato nuevo (desde septiembre de 2025), CSV de ARCA: ";" y coma decimal.
const CSV_NUEVO = [
  '"Fecha de Emisión";"Tipo de Comprobante";"Punto de Venta";"Número Desde";"Número Hasta";"Cód. Autorización";"Tipo Doc. Emisor";"Nro. Doc. Emisor";"Denominación Emisor";"Tipo Doc. Receptor";"Nro. Doc. Receptor";"Tipo Cambio";"Moneda";"Imp. Neto Gravado IVA 0%";"IVA 2,5%";"Imp. Neto Gravado IVA 2,5%";"IVA 5%";"Imp. Neto Gravado IVA 5%";"IVA 10,5%";"Imp. Neto Gravado IVA 10,5%";"IVA 21%";"Imp. Neto Gravado IVA 21%";"IVA 27%";"Imp. Neto Gravado IVA 27%";"Imp. Neto Gravado Total";"Imp. Neto No Gravado";"Imp. Op. Exentas";"Otros Tributos";"IVA";"Imp. Total"',
  // Factura A con 21 % y 10,5 % y percepciones.
  '"2026-09-03";"1";"2";"1201";"1201";"76123456789012";"80";"30999176522";"MAYORISTA SA";"80";"30715974823";"1";"PES";"0";"0";"0";"0";"0";"105";"1000";"2100";"10000";"0";"0";"11000";"0";"0";"300";"2205";"13505"',
  // Factura C de un monotributista nuevo.
  '"2026-09-10";"11";"1";"55";"55";"76123456789013";"80";"20123456786";"JUAN PEREZ";"80";"30715974823";"1";"PES";"0";"0";"0";"0";"0";"0";"0";"0";"0";"0";"0";"0";"0";"0";"0";"0";"8000"',
  // Nota de crédito A (ARCA la manda en positivo).
  '"2026-09-15";"3";"2";"40";"40";"76123456789014";"80";"30999176522";"MAYORISTA SA";"80";"30715974823";"1";"PES";"0";"0";"0";"0";"0";"0";"0";"210";"1000";"0";"0";"1000";"0";"0";"0";"210";"1210"',
].join('\r\n')

// Formato viejo (Excel hasta agosto de 2025): un solo neto.
const TABLA_VIEJA = [
  ['Mis Comprobantes Recibidos - CUIT 30715974823'],
  [
    'Fecha',
    'Tipo',
    'Punto de Venta',
    'Número Desde',
    'Número Hasta',
    'Cód. Autorización',
    'Tipo Doc. Emisor',
    'Nro. Doc. Emisor',
    'Denominación Emisor',
    'Tipo Cambio',
    'Moneda',
    'Imp. Neto Gravado',
    'Imp. Neto No Gravado',
    'Imp. Op. Exentas',
    'Otros Tributos',
    'IVA',
    'Imp. Total',
  ],
  [
    '03/09/2026',
    '1 - Factura A',
    '2',
    '1300',
    '1300',
    '761',
    'CUIT',
    '30999176522',
    'MAYORISTA SA',
    '1',
    '$',
    '1000',
    '0',
    '0',
    '0',
    '210',
    '1210',
  ],
  [
    '04/09/2026',
    '1 - Factura A',
    '2',
    '1301',
    '1301',
    '762',
    'CUIT',
    '30999176522',
    'MAYORISTA SA',
    '1',
    '$',
    '2000',
    '0',
    '0',
    '0',
    '315',
    '2315',
  ],
]

/** ZIP de un solo archivo comprimido (como el que baja ARCA). */
function zip(nombre: string, contenido: string) {
  const datos = Buffer.from(contenido, 'utf8')
  const comprimido = deflateRawSync(datos)
  const n = Buffer.from(nombre)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(comprimido.length, 18)
  local.writeUInt32LE(datos.length, 22)
  local.writeUInt16LE(n.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(comprimido.length, 20)
  central.writeUInt32LE(datos.length, 24)
  central.writeUInt16LE(n.length, 28)
  central.writeUInt32LE(0, 42)
  const inicioCentral = local.length + n.length + comprimido.length
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0)
  fin.writeUInt16LE(1, 8)
  fin.writeUInt16LE(1, 10)
  fin.writeUInt32LE(central.length + n.length, 12)
  fin.writeUInt32LE(inicioCentral, 16)
  return new Uint8Array(Buffer.concat([local, n, comprimido, central, n, fin]))
}

beforeAll(async () => {
  const db = await baseDePrueba()
  const [e] = await db.insert(empresas).values({ razonSocial: 'KOMSA', cuit: '30715974823', condicionIva: 1 }).returning()
  empresa = e.id
  await en((tx) =>
    tx.insert(terceros).values({
      codigo: 'P1',
      razonSocial: 'Mayorista S.A.',
      esCliente: false,
      esProveedor: true,
      tipoDocumento: 80,
      numeroDocumento: '30999176522',
      condicionIva: 1,
    }),
  )
})

describe('Mis Comprobantes de ARCA', () => {
  it('lee el CSV nuevo dentro del ZIP, con IVA por alícuota', async () => {
    const { filas, errores } = await leerMisComprobantes(zip('comprobantes.csv', CSV_NUEVO))
    expect(errores).toEqual([])
    expect(filas).toHaveLength(3)
    expect(filas[0]).toMatchObject({
      fecha: '2026-09-03',
      tipo: 1,
      puntoVenta: 2,
      numero: 1201,
      cuit: '30999176522',
      total: '13505',
      otrosTributos: '300',
    })
    expect(filas[0].alicuotas).toEqual([
      { alicuotaIva: 4, base: '1000', importe: '105' },
      { alicuotaIva: 5, base: '10000', importe: '2100' },
    ])
  })

  it('lee el formato viejo y deduce la alícuota del IVA, o avisa si hay varias', () => {
    const { filas } = interpretarTabla(TABLA_VIEJA)
    expect(filas[0].alicuotas).toEqual([{ alicuotaIva: 5, base: '1000', importe: '210' }])
    expect(filas[1].avisos[0]).toContain('más de una alícuota')
  })

  it('concilia, registra lo que falta (creando el proveedor) y no duplica', async () => {
    const { filas } = await leerMisComprobantes(new TextEncoder().encode(CSV_NUEVO))
    const antes = await en((tx) => conciliar(tx, filas))
    expect(antes.filas.map((f) => f.estado)).toEqual(['falta', 'proveedor_nuevo', 'falta'])
    const r = await en((tx) => registrarFaltantes(tx, U, filas))
    expect(r).toEqual({ registrados: 3, errores: [] })
    const despues = await en((tx) => conciliar(tx, filas))
    expect(despues.filas.every((f) => f.estado === 'registrado')).toBe(true)
    const factura = await en((tx) => obtenerCompra(tx, despues.filas[0].compraId!))
    expect([factura?.total, factura?.iva, factura?.origen, factura?.cae]).toEqual([
      '13505.00',
      '2205.00',
      'mis_comprobantes',
      '76123456789012',
    ])
    const c = await en((tx) => obtenerCompra(tx, despues.filas[1].compraId!))
    expect([c?.letra, c?.total, c?.proveedor?.razonSocial, c?.proveedor?.condicionIva]).toEqual(['C', '8000.00', 'JUAN PEREZ', 6])
    const nc = await en((tx) => obtenerCompra(tx, despues.filas[2].compraId!))
    expect([nc?.clase, nc?.total]).toEqual(['nota_credito', '1210.00'])
    expect((await en((tx) => registrarFaltantes(tx, U, filas))).registrados).toBe(0)
  })
})

describe('valores de la RG 830', () => {
  it('carga los regímenes y la escala, y se pueden recargar sin duplicar', async () => {
    await en((tx) => cargarValoresRg830(tx, U))
    await en((tx) => cargarValoresRg830(tx, U))
    const regs = await en((tx) => tx.select().from(regimenesGanancias))
    const r78 = regs.find((r) => r.codigo === '78')
    expect([Number(r78?.minimoNoSujeto), Number(r78?.alicuotaInscripto), Number(r78?.minimoRetencion)]).toEqual([224000, 2, 240])
    expect(await en((tx) => tx.select().from(escalaGanancias))).toHaveLength(8)
  })
})
