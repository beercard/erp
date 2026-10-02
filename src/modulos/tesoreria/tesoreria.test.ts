import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, movimientosTesoreria, terceros } from '../../db/schema'
import { pendientesCompras, registrarCompra } from '../compras/compras'
import { chequesEnCartera, emitirPago } from '../compras/pagos'
import { anularRecibo, cuentaCorriente, emitirRecibo } from '../facturacion/cuentas'
import { listarCheques, depositarCheques, rechazarCheque, anularDeposito } from './cheques'
import {
  estadoConciliacion,
  conciliar,
  conciliarVarias,
  importarExtracto,
  interpretarExtracto,
  leerExtracto,
} from './conciliacion'
import { guardarCuenta, movimientosCuenta, saldoCuenta, saldosCuentas } from './cuentas'
import { acreditarCupones, anularMovimiento, arquear, cargarSaldoInicial, registrarMovimiento, transferir } from './movimientos'

const U = '00000000-0000-4000-8000-000000000001'
let empresa: string
let cliente: string
let proveedor: string
const cta: Record<string, string> = {}
const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

async function cuenta(codigo: string, tipo: string, medios: string[] = [], moneda = 'PES') {
  const r = await en((tx) => guardarCuenta(tx, U, { codigo, nombre: codigo, tipo, moneda, mediosPredeterminados: medios }))
  if (!r.ok) throw new Error(r.error)
  cta[codigo] = r.id
}

const recibo = (valores: Record<string, unknown>[], fecha = '2026-10-01') =>
  en((tx) => emitirRecibo(tx, U, { terceroId: cliente, fecha, valores })).then((r) => {
    if (!r.ok) throw new Error(r.error)
    return r.id
  })
const saldo = (codigo: string, hasta?: string) => en((tx) => saldoCuenta(tx, cta[codigo], hasta))

beforeAll(async () => {
  const db = await baseDePrueba()
  const [e] = await db.insert(empresas).values({ razonSocial: 'Tesorera S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
  empresa = e.id
  await en(async (tx) => {
    ;[cliente, proveedor] = (
      await tx
        .insert(terceros)
        .values([
          { codigo: 'C1', razonSocial: 'Cliente que paga', tipoDocumento: 99, condicionIva: 5 },
          {
            codigo: 'P1',
            razonSocial: 'Proveedor',
            esCliente: false,
            esProveedor: true,
            tipoDocumento: 80,
            numeroDocumento: '30999176522',
            condicionIva: 1,
          },
        ])
        .returning()
    ).map((x) => x.id)
  })
  await cuenta('CAJA', 'caja', ['efectivo'])
  await cuenta('ICBC', 'banco', ['transferencia', 'cheque_propio'])
  await cuenta('GALICIA', 'banco')
  await cuenta('MP', 'billetera', ['mercado_pago'])
  await cuenta('CUPONES', 'cupones', ['tarjeta_credito'])
  await cuenta('VISA', 'tarjeta', ['tarjeta'])
  await cuenta('USD', 'caja', [], 'DOL')
})

describe('cuentas y saldos', () => {
  it('cada medio tiene una sola cuenta predeterminada', async () => {
    await cuenta('CAJA2', 'caja', ['efectivo'])
    const todas = await en((tx) => saldosCuentas(tx))
    expect(todas.find((c) => c.codigo === 'CAJA')?.mediosPredeterminados).toEqual([])
    expect(todas.find((c) => c.codigo === 'CAJA2')?.mediosPredeterminados).toEqual(['efectivo'])
    // Se vuelve a dejar la caja principal.
    const r = await en((tx) =>
      guardarCuenta(tx, U, { codigo: 'CAJA', nombre: 'CAJA', tipo: 'caja', mediosPredeterminados: ['efectivo'] }, cta.CAJA),
    )
    expect(r.ok).toBe(true)
  })

  it('los cobros entran a la cuenta de su medio y anular el recibo los saca', async () => {
    await en((tx) => cargarSaldoInicial(tx, U, cta.CAJA, '2026-09-30', '1000'))
    const id = await recibo([
      { medio: 'efectivo', importe: '500' },
      { medio: 'transferencia', importe: '2000' },
      { medio: 'mercado_pago', importe: '300' },
      { medio: 'tarjeta_credito', importe: '700' },
    ])
    expect([await saldo('CAJA'), await saldo('ICBC'), await saldo('MP'), await saldo('CUPONES')]).toEqual([
      '1500.00',
      '2000.00',
      '300.00',
      '700.00',
    ])
    // Una transferencia a otra cuenta, elegida a mano.
    await recibo([{ medio: 'transferencia', importe: '100', cuentaId: cta.GALICIA }])
    expect(await saldo('GALICIA')).toBe('100.00')
    await en((tx) => anularRecibo(tx, U, id))
    expect([await saldo('CAJA'), await saldo('ICBC')]).toEqual(['1000.00', '0.00'])
  })

  it('no deja cobrar a una cuenta en dólares', async () => {
    const r = await en((tx) =>
      emitirRecibo(tx, U, {
        terceroId: cliente,
        fecha: '2026-10-01',
        valores: [{ medio: 'efectivo', importe: '1', cuentaId: cta.USD }],
      }),
    )
    expect(r.ok).toBe(false)
  })
})

describe('movimientos', () => {
  it('gastos, transferencias y anulación de la pareja', async () => {
    await en((tx) =>
      registrarMovimiento(tx, U, {
        cuentaId: cta.CAJA,
        fecha: '2026-10-02',
        sentido: 'egreso',
        importe: '150',
        concepto: 'Librería',
      }),
    )
    expect(await saldo('CAJA')).toBe('850.00')
    const t = await en((tx) =>
      transferir(tx, U, { origenId: cta.CAJA, destinoId: cta.GALICIA, fecha: '2026-10-02', importe: '800' }),
    )
    if (!t.ok) throw new Error(t.error)
    expect([await saldo('CAJA'), await saldo('GALICIA')]).toEqual(['50.00', '900.00'])
    await en((tx) => anularMovimiento(tx, U, t.id))
    expect([await saldo('CAJA'), await saldo('GALICIA')]).toEqual(['850.00', '100.00'])
  })

  it('entre monedas distintas pide cuánto entra', async () => {
    const mal = await en((tx) =>
      transferir(tx, U, { origenId: cta.GALICIA, destinoId: cta.USD, fecha: '2026-10-02', importe: '100' }),
    )
    expect(mal.ok).toBe(false)
  })

  it('la acreditación de cupones deja la comisión en la cuenta de cupones', async () => {
    await recibo([{ medio: 'tarjeta_credito', importe: '1000' }])
    const r = await en((tx) =>
      acreditarCupones(tx, U, { cuponesId: cta.CUPONES, bancoId: cta.ICBC, fecha: '2026-10-05', bruto: '1000', neto: '960' }),
    )
    expect(r.ok).toBe(true)
    // Quedan los 700 del recibo anulado (no: ese recibo se anuló), así que la cuenta de cupones queda en 0.
    expect([await saldo('CUPONES'), await saldo('ICBC')]).toEqual(['0.00', '960.00'])
  })

  it('el arqueo ajusta la diferencia y deja constancia', async () => {
    const r = await en((tx) => arquear(tx, U, { cuentaId: cta.CAJA, fecha: '2026-10-05', contado: '840' }))
    expect(r.ok && [r.saldoSistema, r.diferencia]).toEqual(['850.00', '-10.00'])
    expect(await saldo('CAJA')).toBe('840.00')
    const r2 = await en((tx) => arquear(tx, U, { cuentaId: cta.CAJA, fecha: '2026-10-05', contado: '840' }))
    expect(r2.ok && r2.diferencia).toBe('0.00')
  })

  it('un movimiento no se modifica ni desde la base', async () => {
    const [m] = await en((tx) => tx.select().from(movimientosTesoreria).where(eq(movimientosTesoreria.cuentaId, cta.CAJA)))
    await expect(
      en((tx) => tx.update(movimientosTesoreria).set({ importe: '1' }).where(eq(movimientosTesoreria.id, m.id))),
    ).rejects.toThrow()
  })
})

describe('pagos y cheques', () => {
  let chequeA: string
  let chequeB: string
  it('los pagos salen de la cuenta de cada medio; el cheque propio debita en su fecha', async () => {
    const c = await en((tx) =>
      registrarCompra(tx, U, {
        terceroId: proveedor,
        clase: 'factura',
        letra: 'A',
        puntoVenta: 1,
        numero: 10,
        fecha: '2026-10-01',
        iva: [{ alicuotaIva: 5, base: '1000' }],
      }),
    )
    if (!c.ok) throw new Error(c.error)
    const p = await en((tx) =>
      emitirPago(tx, U, {
        terceroId: proveedor,
        fecha: '2026-10-06',
        imputaciones: [{ compraId: c.id, importe: '1210' }],
        valores: [
          { medio: 'cheque_propio', importe: '1000', banco: 'ICBC', numeroValor: '77', fechaPago: '2026-11-15' },
          { medio: 'tarjeta', importe: '210' },
        ],
      }),
    )
    if (!p.ok) throw new Error(p.error)
    expect(await saldo('ICBC', '2026-10-31')).toBe('960.00')
    expect([await saldo('ICBC'), await saldo('VISA')]).toEqual(['-40.00', '-210.00'])
    const [deuda] = await en((tx) => pendientesCompras(tx, { ids: [c.id] }))
    expect(deuda.saldo).toBe('0.00')
  })

  it('los cheques recibidos van a la cartera; depositados salen de ella y entran al banco', async () => {
    await recibo([
      { medio: 'cheque', importe: '5000', banco: 'Nación', numeroValor: '1', fechaPago: '2026-10-10' },
      { medio: 'echeq', importe: '3000', banco: 'Galicia', numeroValor: '2', fechaPago: '2026-10-20' },
    ])
    const cartera = await en((tx) => listarCheques(tx, { estado: 'cartera' }))
    expect(cartera.map((c) => c.importe).sort()).toEqual(['3000.00', '5000.00'])
    chequeA = cartera.find((c) => c.importe === '5000.00')!.id
    chequeB = cartera.find((c) => c.importe === '3000.00')!.id
    const d = await en((tx) => depositarCheques(tx, U, { cuentaId: cta.GALICIA, fecha: '2026-10-10', cheques: [chequeA] }))
    expect(d.ok && d.total).toBe('5000.00')
    expect(await saldo('GALICIA')).toBe('5100.00')
    expect((await en((tx) => chequesEnCartera(tx))).map((c) => c.id)).toEqual([chequeB])
    // No se puede depositar dos veces.
    const otra = await en((tx) => depositarCheques(tx, U, { cuentaId: cta.GALICIA, fecha: '2026-10-10', cheques: [chequeA] }))
    expect(otra.ok).toBe(false)
  })

  it('anular un depósito devuelve el cheque a la cartera', async () => {
    await en((tx) => anularDeposito(tx, U, chequeA))
    expect((await en((tx) => listarCheques(tx, { ids: [chequeA] })))[0].estado).toBe('cartera')
    await en((tx) => depositarCheques(tx, U, { cuentaId: cta.GALICIA, fecha: '2026-10-10', cheques: [chequeA] }))
  })

  it('un cheque depositado que rebota: lo debita el banco y vuelve la deuda del cliente con los gastos', async () => {
    const antes = await en((tx) => cuentaCorriente(tx, cliente))
    const r = await en((tx) =>
      rechazarCheque(tx, U, { chequeId: chequeA, fecha: '2026-10-12', motivo: 'Sin fondos', gastos: '150' }),
    )
    if (!r.ok) throw new Error(r.error)
    expect(await saldo('GALICIA')).toBe('-50.00')
    const despues = await en((tx) => cuentaCorriente(tx, cliente))
    expect(Number(despues.saldo) - Number(antes.saldo)).toBe(5150)
    expect((await en((tx) => listarCheques(tx, { ids: [chequeA] })))[0].estado).toBe('rechazado')
  })

  it('un cheque entregado a un proveedor que rebota: vuelve la deuda con el proveedor', async () => {
    const p = await en((tx) =>
      emitirPago(tx, U, {
        terceroId: proveedor,
        fecha: '2026-10-15',
        aCuenta: '3000',
        valores: [{ medio: 'cheque_tercero', importe: '3000', reciboValorId: chequeB }],
      }),
    )
    if (!p.ok) throw new Error(p.error)
    expect((await en((tx) => listarCheques(tx, { ids: [chequeB] })))[0]).toMatchObject({
      estado: 'entregado',
      destino: 'Proveedor',
    })
    const r = await en((tx) => rechazarCheque(tx, U, { chequeId: chequeB, fecha: '2026-10-25' }))
    expect(r.ok && r.notaDebitoProveedorId).toBeTruthy()
    const [nd] = await en((tx) => pendientesCompras(tx, { terceroId: proveedor }))
    expect([nd.tipo, nd.saldo]).toEqual([99, '3000.00'])
  })
})

describe('conciliación bancaria', () => {
  it('lee extractos con débito y crédito separados o un importe con signo', () => {
    const a = interpretarExtracto([
      ['Banco ICBC - Movimientos'],
      ['Fecha', 'Concepto', 'Nro. Comprobante', 'Débito', 'Crédito', 'Saldo'],
      ['05/10/2026', 'ACREDITACION VISA', '123', '', '960,00', '960,00'],
      ['06/10/2026', 'COMISION MANTENIMIENTO', '', '1.250,50', '', '-290,50'],
    ])
    expect(a.lineas.map((l) => [l.fecha, l.importe, l.saldo])).toEqual([
      ['2026-10-05', '960.00', '960.00'],
      ['2026-10-06', '-1250.50', '-290.50'],
    ])
    const b = interpretarExtracto([
      ['fecha', 'descripcion', 'importe'],
      ['2026-10-07', 'TRANSF', '-1.000,00'],
    ])
    expect(b.lineas[0].importe).toBe('-1000.00')
  })

  it('importa sin duplicar, sugiere la pareja obvia y concilia', async () => {
    const csv =
      'Fecha;Concepto;Débito;Crédito;Saldo\n05/10/2026;ACREDITACION VISA;;960,00;960,00\n06/10/2026;COMISION MANTENIMIENTO;1.250,50;;-290,50\n'
    const { lineas } = await leerExtracto(new TextEncoder().encode(csv))
    const r = await en((tx) => importarExtracto(tx, U, cta.ICBC, 'icbc.csv', lineas))
    expect(r.ok && r.nuevas).toBe(2)
    const r2 = await en((tx) => importarExtracto(tx, U, cta.ICBC, 'icbc.csv', lineas))
    expect(r2.ok && [r2.nuevas, r2.repetidas]).toEqual([0, 2])

    const e = await en((tx) => estadoConciliacion(tx, cta.ICBC))
    expect(e.sugerencias).toHaveLength(1)
    expect(await en((tx) => conciliarVarias(tx, U, e.sugerencias))).toBe(1)
    // La comisión no está en el sistema: se registra y se concilia a mano.
    const g = await en((tx) =>
      registrarMovimiento(tx, U, {
        cuentaId: cta.ICBC,
        fecha: '2026-10-06',
        sentido: 'egreso',
        importe: '1250.50',
        concepto: 'Gastos bancarios',
      }),
    )
    if (!g.ok) throw new Error(g.error)
    const linea = (await en((tx) => estadoConciliacion(tx, cta.ICBC))).pendientesBanco[0]
    const mal = await en((tx) =>
      conciliar(tx, U, linea.id, [
        { origen: 'movimiento', id: g.id },
        { origen: 'movimiento', id: g.id },
      ]),
    )
    expect(mal.ok).toBe(false)
    expect(await en((tx) => conciliar(tx, U, linea.id, [{ origen: 'movimiento', id: g.id }]))).toEqual({ ok: true })
    const fin = await en((tx) => estadoConciliacion(tx, cta.ICBC))
    expect([fin.pendientesBanco.length, fin.saldoBanco]).toEqual([0, '-290.50'])
  })

  it('el libro de la cuenta muestra el saldo anterior al período', async () => {
    const l = await en((tx) => movimientosCuenta(tx, cta.CAJA, { desde: '2026-10-02' }))
    expect(l.saldoAnterior).toBe('1000.00')
  })
})
