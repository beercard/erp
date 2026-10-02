import { eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  articulos,
  compras,
  depositos,
  empresas,
  escalaGanancias,
  regimenesGanancias,
  retencionesConfiguracion,
  terceros,
} from '../../db/schema'
import { saldos } from '../comercial/stock'
import { emitirRecibo } from '../facturacion/cuentas'
import { anularCompra, aplicarNotaCredito, obtenerCompra, pendientesCompras, registrarCompra } from './compras'
import { cuentaProveedor, saldosPorProveedor } from './cuentas'
import { calcularRetencionGanancias, type RegimenGanancias } from './ganancias'
import { guardarOrden, obtenerOrden } from './ordenes'
import { anularPago, chequesEnCartera, emitirPago, liquidarPago, EsquemaPago } from './pagos'
import { abreviaturaCompra, codigoCompra, datosTipoCompra } from './tipos'

const U = '00000000-0000-4000-8000-000000000001'
let empresa: string
let proveedor: string
let monotributista: string
let cliente: string
let toner: string
let central: string

const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

const factura = (extra: Record<string, unknown> = {}) => ({
  terceroId: proveedor,
  clase: 'factura',
  letra: 'A',
  puntoVenta: 3,
  numero: 100,
  fecha: '2026-10-01',
  depositoId: central,
  items: [{ articuloId: toner, descripcion: 'Tóner', cantidad: '10', precioUnitario: '1000', alicuotaIva: 5 }],
  ...extra,
})

async function registrar(datos: unknown) {
  const r = await en((tx) => registrarCompra(tx, U, datos))
  if (!r.ok) throw new Error(r.error)
  return r.id
}

const stockToner = async () =>
  Number((await en((tx) => saldos(tx, [toner]))).find((s) => s.depositoId === central)?.cantidad ?? 0)

beforeAll(async () => {
  const db = await baseDePrueba()
  const [e] = await db
    .insert(empresas)
    .values({ razonSocial: 'Compradora S.A.', cuit: '30715974823', condicionIva: 1 })
    .returning()
  empresa = e.id
  await en(async (tx) => {
    ;[proveedor, monotributista, cliente] = (
      await tx
        .insert(terceros)
        .values([
          {
            codigo: 'P1',
            razonSocial: 'Mayorista S.A.',
            esCliente: false,
            esProveedor: true,
            tipoDocumento: 80,
            numeroDocumento: '30999176522',
            condicionIva: 1,
            regimenGanancias: '78',
          },
          {
            codigo: 'P2',
            razonSocial: 'Técnico Monotributista',
            esCliente: false,
            esProveedor: true,
            tipoDocumento: 80,
            numeroDocumento: '20123456786',
            condicionIva: 6,
            regimenGanancias: '78',
          },
          { codigo: 'C1', razonSocial: 'Cliente que paga con cheque', tipoDocumento: 99, condicionIva: 5 },
        ])
        .returning()
    ).map((x) => x.id)
    toner = (await tx.insert(articulos).values({ codigo: 'TN', nombre: 'Tóner', alicuotaIva: 5 }).returning())[0].id
    central = (await tx.insert(depositos).values({ codigo: '001', nombre: 'Central' }).returning())[0].id
    await tx.insert(regimenesGanancias).values({
      codigo: '78',
      concepto: 'Enajenación de bienes muebles y bienes de cambio',
      alicuotaInscripto: '2',
      alicuotaNoInscripto: '10',
      minimoNoSujeto: '224000',
      minimoRetencion: '240',
    })
    await tx.insert(retencionesConfiguracion).values({ gananciasActiva: true })
  })
})

describe('tipos de comprobante de compra', () => {
  it('reconoce A, B, C, M y FCE', () => {
    expect(codigoCompra('M', 'factura')).toBe(51)
    expect(codigoCompra('A', 'nota_credito', true)).toBe(203)
    expect(codigoCompra('M', 'factura', true)).toBeNull()
    expect(datosTipoCompra(53)).toEqual({ letra: 'M', clase: 'nota_credito', fce: false })
    expect(abreviaturaCompra(201)).toBe('FCEA')
    expect(datosTipoCompra(999)).toBeNull()
  })
})

describe('retención de Ganancias (RG 830)', () => {
  const r78: RegimenGanancias = {
    codigo: '78',
    concepto: 'Bienes',
    alicuotaInscripto: '2',
    alicuotaNoInscripto: '10',
    minimoNoSujeto: '224000',
    minimoRetencion: '240',
    usaEscala: false,
  }
  const calc = (o: Partial<Parameters<typeof calcularRetencionGanancias>[0]>) =>
    calcularRetencionGanancias({
      regimen: r78,
      escala: [],
      inscripto: true,
      baseAnteriorMes: '0',
      basePago: '0',
      retenidoMes: '0',
      ...o,
    })

  it('descuenta el mínimo no sujeto y aplica la alícuota', () => {
    expect(calc({ basePago: '500000' })).toMatchObject({ base: '276000.00', importe: '5520.00', alicuota: '2.0000' })
    expect(calc({ basePago: '200000' }).importe).toBe('0.00')
  })

  it('acumula los pagos del mes y resta lo ya retenido', () => {
    // 200.000 antes (sin retención) + 100.000 ahora: sujeto 76.000 → 1.520.
    expect(calc({ baseAnteriorMes: '200000', basePago: '100000' }).importe).toBe('1520.00')
    expect(calc({ baseAnteriorMes: '500000', basePago: '100000', retenidoMes: '5520' }).importe).toBe('2000.00')
  })

  it('no retiene menos que el mínimo de retención', () => {
    expect(calc({ basePago: '235000' }).importe).toBe('0.00')
    expect(calc({ basePago: '236000' }).importe).toBe('240.00')
  })

  it('a no inscriptos: sin mínimo no sujeto y con su alícuota', () => {
    expect(calc({ inscripto: false, basePago: '10000' }).importe).toBe('1000.00')
  })

  it('con escala, fijo más el porcentaje sobre el excedente del tramo', () => {
    const escala = [
      { desde: '0', hasta: '8000', fijo: '0', porcentaje: '5' },
      { desde: '8000', hasta: '16000', fijo: '400', porcentaje: '9' },
      { desde: '16000', hasta: null, fijo: '1120', porcentaje: '31' },
    ]
    const r = calcularRetencionGanancias({
      regimen: { ...r78, usaEscala: true, minimoNoSujeto: '0', minimoRetencion: '0' },
      escala,
      inscripto: true,
      baseAnteriorMes: '0',
      basePago: '10000',
      retenidoMes: '0',
    })
    expect([r.importe, r.alicuota]).toEqual(['580.00', null])
  })
})

describe('comprobantes de compra', () => {
  it('registra una factura A con artículos: IVA por alícuota, percepciones y stock', async () => {
    const id = await registrar(
      factura({
        tributos: [
          { tipo: 'percepcion_iibb', provincia: 'H', importe: '300' },
          { tipo: 'percepcion_iva', importe: '150' },
        ],
      }),
    )
    const c = await en((tx) => obtenerCompra(tx, id))
    expect([c?.neto, c?.iva, c?.tributos, c?.total, c?.periodoIva]).toEqual([
      '10000.00',
      '2100.00',
      '450.00',
      '12550.00',
      '2026-10',
    ])
    expect(c?.detalleIva.map((i) => [i.alicuotaIva, i.base, i.importe])).toEqual([[5, '10000.00', '2100.00']])
    expect(await stockToner()).toBe(10)
  })

  it('no deja registrar dos veces el mismo comprobante del proveedor', async () => {
    const r = await en((tx) => registrarCompra(tx, U, factura()))
    expect(r).toEqual({ ok: false, error: 'Ese comprobante del proveedor ya está registrado.' })
  })

  it('respeta el IVA impreso si difiere en centavos, y rechaza diferencias grandes', async () => {
    const ok = await registrar(
      factura({ numero: 101, items: [], iva: [{ alicuotaIva: 5, base: '1000.33', importe: '210.06' }], depositoId: null }),
    )
    expect((await en((tx) => obtenerCompra(tx, ok)))?.iva).toBe('210.06')
    const mal = await en((tx) =>
      registrarCompra(tx, U, factura({ numero: 102, items: [], iva: [{ alicuotaIva: 5, base: '1000', importe: '250' }] })),
    )
    expect(mal.ok).toBe(false)
  })

  it('en una factura C no hay IVA: todo es precio final', async () => {
    const id = await registrar(
      factura({ terceroId: monotributista, letra: 'C', numero: 7, items: [], iva: [{ alicuotaIva: 5, base: '5000' }] }),
    )
    const c = await en((tx) => obtenerCompra(tx, id))
    expect([c?.tipo, c?.iva, c?.total, c?.detalleIva.length]).toEqual([11, '0.00', '5000.00', 0])
  })

  it('un comprobante registrado no se modifica ni desde la base; anularlo devuelve el stock', async () => {
    const id = await registrar(factura({ numero: 103 }))
    expect(await stockToner()).toBe(20)
    await expect(en((tx) => tx.update(compras).set({ total: '1' }).where(eq(compras.id, id)))).rejects.toThrow()
    const r = await en((tx) => anularCompra(tx, U, id))
    expect(r.ok).toBe(true)
    expect(await stockToner()).toBe(10)
    // Anulado, se puede volver a cargar.
    await registrar(factura({ numero: 103 }))
    expect(await stockToner()).toBe(20)
  })

  it('una nota de crédito se aplica a la factura y saca la mercadería devuelta', async () => {
    const [f] = (await en((tx) => pendientesCompras(tx, { terceroId: proveedor }))).filter((p) => p.numero === 103)
    const nc = await registrar(
      factura({
        clase: 'nota_credito',
        numero: 5,
        aplicarA: f.id,
        items: [{ articuloId: toner, descripcion: 'Tóner', cantidad: '2', precioUnitario: '1000', alicuotaIva: 5 }],
      }),
    )
    expect(await stockToner()).toBe(18)
    const [despues] = await en((tx) => pendientesCompras(tx, { ids: [f.id] }))
    expect(despues.saldo).toBe('9680.00')
    // La nota ya no tiene saldo: no se puede volver a aplicar.
    const r = await en((tx) => aplicarNotaCredito(tx, U, nc, [{ compraId: f.id, importe: '1' }], '2026-10-01'))
    expect(r.ok).toBe(false)
  })
})

describe('pagos a proveedores', () => {
  let grande: string
  it('retiene Ganancias sobre lo pagado sin IVA y pide valores por el neto de la retención', async () => {
    grande = await registrar(
      factura({
        numero: 200,
        fecha: '2026-11-02',
        items: [{ articuloId: toner, descripcion: 'Tóner', cantidad: '100', precioUnitario: '5000', alicuotaIva: 5 }],
      }),
    )
    // Factura de 605.000 (500.000 + IVA). Se paga entera: base 500.000, sujeto 276.000, retención 5.520.
    const entrada = { terceroId: proveedor, fecha: '2026-11-10', imputaciones: [{ compraId: grande, importe: '605000' }] }
    const l = await en((tx) => liquidarPago(tx, EsquemaPago.parse(entrada)))
    expect(l.ok && [l.liquidacion.basePesos, l.liquidacion.retencion?.importe, l.liquidacion.aPagar]).toEqual([
      '500000.00',
      '5520.00',
      '599480.00',
    ])
    const corto = await en((tx) => emitirPago(tx, U, { ...entrada, valores: [{ medio: 'transferencia', importe: '605000' }] }))
    expect(corto.ok).toBe(false)
    const r = await en((tx) => emitirPago(tx, U, { ...entrada, valores: [{ medio: 'transferencia', importe: '599480' }] }))
    expect(r.ok).toBe(true)
    const [p] = await en((tx) => pendientesCompras(tx, { ids: [grande] }))
    expect(p.saldo).toBe('0.00')
  })

  it('el segundo pago del mes acumula y descuenta lo ya retenido', async () => {
    const otra = await registrar(
      factura({
        numero: 201,
        fecha: '2026-11-12',
        items: [{ articuloId: toner, descripcion: 'Tóner', cantidad: '20', precioUnitario: '5000', alicuotaIva: 5 }],
      }),
    )
    const l = await en((tx) =>
      liquidarPago(
        tx,
        EsquemaPago.parse({ terceroId: proveedor, fecha: '2026-11-20', imputaciones: [{ compraId: otra, importe: '121000' }] }),
      ),
    )
    // Mes: 600.000 − 224.000 = 376.000 al 2 % = 7.520, menos 5.520 ya retenidos = 2.000.
    expect(l.ok && l.liquidacion.retencion?.importe).toBe('2000.00')
  })

  it('a un monotributista no se le retiene', async () => {
    const c = await registrar(
      factura({ terceroId: monotributista, letra: 'C', numero: 8, items: [], iva: [{ alicuotaIva: 5, base: '900000' }] }),
    )
    const l = await en((tx) =>
      liquidarPago(
        tx,
        EsquemaPago.parse({ terceroId: monotributista, fecha: '2026-11-10', imputaciones: [{ compraId: c, importe: '900000' }] }),
      ),
    )
    expect(l.ok && l.liquidacion.retencion).toBeNull()
  })

  it('una factura en dólares se cancela en dólares aunque se pague en pesos', async () => {
    const usd = await registrar(
      factura({
        numero: 300,
        moneda: 'DOL',
        cotizacion: '1500',
        items: [{ articuloId: toner, descripcion: 'Tóner', cantidad: '1', precioUnitario: '100', alicuotaIva: 5 }],
      }),
    )
    // US$ 121. Se pagan US$ 60,50 en pesos a 1.600: $ 96.800.
    const r = await en((tx) =>
      emitirPago(tx, U, {
        terceroId: proveedor,
        fecha: '2026-10-05',
        moneda: 'PES',
        cotizacion: '1600',
        imputaciones: [{ compraId: usd, importe: '60.50' }],
        valores: [{ medio: 'efectivo', importe: '96800' }],
      }),
    )
    expect(r.ok).toBe(true)
    const [p] = await en((tx) => pendientesCompras(tx, { ids: [usd] }))
    expect([p.moneda, p.saldo]).toEqual(['DOL', '60.50'])
    const cc = await en((tx) => cuentaProveedor(tx, proveedor))
    expect(cc.cuentas.find((c) => c.moneda === 'DOL')?.saldo).toBe('60.50')
  })

  it('entrega un cheque de terceros de la cartera y al anular el pago vuelve', async () => {
    const rec = await en((tx) =>
      emitirRecibo(tx, U, {
        terceroId: cliente,
        fecha: '2026-10-01',
        valores: [{ medio: 'cheque', importe: '5000', banco: 'Nación', numeroValor: '123', fechaPago: '2026-10-30' }],
      }),
    )
    expect(rec.ok).toBe(true)
    const [cheque] = await en((tx) => chequesEnCartera(tx))
    expect(cheque.importe).toBe('5000.00')
    const r = await en((tx) =>
      emitirPago(tx, U, {
        terceroId: proveedor,
        fecha: '2026-10-06',
        aCuenta: '5000',
        valores: [{ medio: 'cheque_tercero', importe: '5000', reciboValorId: cheque.id }],
      }),
    )
    if (!r.ok) throw new Error(r.error)
    expect(await en((tx) => chequesEnCartera(tx))).toHaveLength(0)
    const otra = await en((tx) =>
      emitirPago(tx, U, {
        terceroId: proveedor,
        fecha: '2026-10-06',
        aCuenta: '5000',
        valores: [{ medio: 'cheque_tercero', importe: '5000', reciboValorId: cheque.id }],
      }),
    )
    expect(otra).toEqual({ ok: false, error: 'Uno de los cheques de terceros ya no está en cartera.' })
    await en((tx) => anularPago(tx, U, r.id))
    expect(await en((tx) => chequesEnCartera(tx))).toHaveLength(1)
  })

  it('al anular un pago la deuda vuelve, y una factura pagada no se anula', async () => {
    const bloqueada = await en((tx) => anularCompra(tx, U, grande))
    expect(bloqueada.ok).toBe(false)
    const [pago] = await en((tx) =>
      tx
        .execute(sql`select pago_id as id from imputaciones_compras where compra_id = ${grande}`)
        .then((r) => (Array.isArray(r) ? r : (r as { rows: { id: string }[] }).rows)),
    )
    await en((tx) => anularPago(tx, U, (pago as { id: string }).id))
    const [p] = await en((tx) => pendientesCompras(tx, { ids: [grande] }))
    expect(p.saldo).toBe('605000.00')
  })

  it('el saldo por proveedor coincide con la cuenta corriente', async () => {
    const cc = await en((tx) => cuentaProveedor(tx, proveedor))
    const lista = await en((tx) => saldosPorProveedor(tx))
    for (const c of cc.cuentas) {
      expect(lista.find((s) => s.id === proveedor && s.moneda === c.moneda)?.saldo).toBe(c.saldo)
    }
  })
})

describe('órdenes de compra', () => {
  it('pasa a parcial y a recibida según lo que llega en los comprobantes', async () => {
    const o = await en((tx) =>
      guardarOrden(tx, U, {
        terceroId: proveedor,
        fecha: '2026-10-01',
        items: [{ articuloId: toner, descripcion: 'Tóner', cantidad: '10', precioUnitario: '900', alicuotaIva: 5 }],
      }),
    )
    if (!o.ok) throw new Error(o.error)
    const orden = await en((tx) => obtenerOrden(tx, o.id))
    const renglon = orden!.items[0].id
    const recibir = (numero: number, cantidad: string) =>
      registrar(
        factura({
          numero,
          ordenCompraId: o.id,
          items: [
            { articuloId: toner, descripcion: 'Tóner', cantidad, precioUnitario: '900', alicuotaIva: 5, ordenItemId: renglon },
          ],
        }),
      )
    await recibir(400, '4')
    expect((await en((tx) => obtenerOrden(tx, o.id)))?.estado).toBe('parcial')
    await recibir(401, '6')
    const final = await en((tx) => obtenerOrden(tx, o.id))
    expect([final?.estado, final?.items[0].pendiente]).toEqual(['recibida', '0'])
  })
})

describe('aislamiento', () => {
  it('otra empresa no ve las compras', async () => {
    const db = await baseDePrueba()
    const [otra] = await db.insert(empresas).values({ razonSocial: 'Otra', cuit: '30999176522', condicionIva: 1 }).returning()
    const filas = await conEmpresa(otra.id, (tx) => tx.select().from(compras))
    expect(filas).toHaveLength(0)
    const config = await conEmpresa(otra.id, (tx) => tx.select().from(escalaGanancias))
    expect(config).toHaveLength(0)
  })
})
