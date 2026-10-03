import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { cuentasTesoreria, empresas, terceros, usuarios } from '../../db/schema'
import { bloqueos, controlarBloqueo, fijarBloqueo } from '../empresa/bloqueos'
import { anularRecibo, emitirRecibo } from '../facturacion/cuentas'
import { anularDeposito, canjearCheques, listarCheques, rechazarCheque } from './cheques'
import { saldoCuenta } from './cuentas'
import { registrarMovimiento } from './movimientos'
import { anularVale, entregarVale, gastosPorConcepto, listarVales, rendirVale } from './vales'

describe('Vales, canje de cheques y cierre de períodos', () => {
  let empresa: string
  let caja: string
  let banco: string
  let cliente: string
  let u: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)
  const saldo = (c: string) => en((tx) => saldoCuenta(tx, c))

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Vales S.A.', cuit: '30716108946', condicionIva: 1 }).returning()
    empresa = e.id
    ;[{ id: u }] = await db
      .insert(usuarios)
      .values({ email: 'tesorero@vales.com', nombre: 'Tesorero', hashClave: 'x' })
      .returning()
    ;[{ id: caja }, { id: banco }] = await en((tx) =>
      tx
        .insert(cuentasTesoreria)
        .values([
          { codigo: 'CAJA', nombre: 'Caja', tipo: 'caja' },
          { codigo: 'BCO', nombre: 'Banco', tipo: 'banco' },
        ])
        .returning(),
    )
    ;[{ id: cliente }] = await en((tx) =>
      tx
        .insert(terceros)
        .values({
          codigo: 'C1',
          razonSocial: 'Cliente Cheques',
          tipoDocumento: 80,
          numeroDocumento: '30999176522',
          condicionIva: 1,
        })
        .returning(),
    )
    await en((tx) =>
      registrarMovimiento(tx, u, {
        cuentaId: caja,
        fecha: '2026-09-01',
        sentido: 'ingreso',
        importe: '50000',
        concepto: 'Aporte',
      }),
    )
  })

  it('vale a rendir: sale de la caja, al rendir vuelve lo que sobró y los gastos quedan por concepto', async () => {
    const v = await en((tx) =>
      entregarVale(tx, u, { cuentaId: caja, persona: 'Juan Cadete', fecha: '2026-09-10', importe: '10000', motivo: 'Trámites' }),
    )
    expect(v).toMatchObject({ ok: true, numero: 1 })
    expect(await saldo(caja)).toBe('40000.00')
    // No se puede sacar un vale del banco.
    expect((await en((tx) => entregarVale(tx, u, { cuentaId: banco, persona: 'X', fecha: '2026-09-10', importe: '1' }))).ok).toBe(
      false,
    )

    const id = v.ok ? v.id : ''
    const r = await en((tx) =>
      rendirVale(tx, u, id, {
        fecha: '2026-09-11',
        gastos: [
          { concepto: 'Combustible', importe: '6000', comprobante: 'B 0001-123' },
          { concepto: 'Estacionamiento', importe: '1500' },
        ],
      }),
    )
    expect(r.ok).toBe(true)
    expect(await saldo(caja)).toBe('42500.00')
    expect((await en((tx) => rendirVale(tx, u, id, { fecha: '2026-09-11', gastos: [] }))).ok).toBe(false)
    const [l] = await en((tx) => listarVales(tx, { estado: 'rendido' }))
    expect(l).toMatchObject({ gastado: '7500.00', devuelto: '2500.00' })

    // Gastó más que el vale: se le reintegra.
    const v2 = await en((tx) => entregarVale(tx, u, { cuentaId: caja, persona: 'Ana', fecha: '2026-09-12', importe: '1000' }))
    await en((tx) =>
      rendirVale(tx, u, v2.ok ? v2.id : '', { fecha: '2026-09-12', gastos: [{ concepto: 'Combustible', importe: '1200' }] }),
    )
    expect(await saldo(caja)).toBe('41300.00')
    expect(await en((tx) => gastosPorConcepto(tx, '2026-09-01', '2026-09-30'))).toEqual([
      { concepto: 'Combustible', total: '7200.00', cantidad: 2 },
      { concepto: 'Estacionamiento', total: '1500.00', cantidad: 1 },
    ])

    // Un vale sin rendir se anula y la plata vuelve.
    const v3 = await en((tx) => entregarVale(tx, u, { cuentaId: caja, persona: 'Pedro', fecha: '2026-09-13', importe: '300' }))
    expect(await saldo(caja)).toBe('41000.00')
    expect((await en((tx) => anularVale(tx, u, v3.ok ? v3.id : ''))).ok).toBe(true)
    expect(await saldo(caja)).toBe('41300.00')
  })

  it('canje de cheques: salen de la cartera, entra lo recibido y el costo queda como gasto; se puede deshacer o rechazar', async () => {
    const r = await en((tx) =>
      emitirRecibo(tx, u, {
        terceroId: cliente,
        fecha: '2026-09-15',
        valores: [
          { medio: 'cheque', importe: '20000', banco: 'Nación', numeroValor: '11', fechaPago: '2026-12-15' },
          { medio: 'echeq', importe: '10000', banco: 'Galicia', numeroValor: '12', fechaPago: '2027-01-15' },
        ],
      }),
    )
    expect(r.ok).toBe(true)
    const cheques = await en((tx) => listarCheques(tx, { estado: 'cartera' }))
    const ids = cheques.map((c) => c.id)
    expect(
      (
        await en((tx) =>
          canjearCheques(tx, u, { cuentaId: caja, fecha: '2026-09-16', cheques: ids, neto: '31000', entidad: 'Fin' }),
        )
      ).ok,
    ).toBe(false)
    const c = await en((tx) =>
      canjearCheques(tx, u, {
        cuentaId: caja,
        fecha: '2026-09-16',
        cheques: ids,
        neto: '27000',
        entidad: 'Financiera del Centro',
      }),
    )
    expect(c).toMatchObject({ ok: true, bruto: '30000.00', costo: '3000.00' })
    expect(await saldo(caja)).toBe('68300.00')
    expect((await en((tx) => listarCheques(tx, { ids }))).map((x) => x.estado)).toEqual(['canjeado', 'canjeado'])

    // Deshacer el canje devuelve todos los cheques y saca la plata.
    expect((await en((tx) => anularDeposito(tx, u, ids[0]))).ok).toBe(true)
    expect(await saldo(caja)).toBe('41300.00')
    expect((await en((tx) => listarCheques(tx, { ids }))).map((x) => x.estado)).toEqual(['cartera', 'cartera'])

    // Canjeado y rebotado: lo debita la cuenta y vuelve la deuda del cliente.
    await en((tx) =>
      canjearCheques(tx, u, {
        cuentaId: banco,
        fecha: '2026-09-17',
        cheques: [ids[0]],
        neto: cheques[0].importe,
        entidad: 'Otro comercio',
      }),
    )
    const rech = await en((tx) => rechazarCheque(tx, u, { chequeId: ids[0], fecha: '2026-09-20', motivo: 'Sin fondos' }))
    expect(rech.ok).toBe(true)
    expect(await saldo(banco)).toBe('0.00')
  })

  it('cierre de períodos por módulo: nada con fecha hasta el cierre se carga ni se anula', async () => {
    const hoy = '2026-10-03'
    expect((await en((tx) => fijarBloqueo(tx, u, { modulo: 'tesoreria', cerradoHasta: hoy }, hoy))).ok).toBe(false)
    expect((await en((tx) => fijarBloqueo(tx, u, { modulo: 'tesoreria', cerradoHasta: '2026-09-30' }, hoy))).ok).toBe(true)
    expect((await en((tx) => fijarBloqueo(tx, u, { modulo: 'ventas', cerradoHasta: '2026-09-15' }, hoy))).ok).toBe(true)
    expect(await en((tx) => bloqueos(tx))).toEqual({ tesoreria: '2026-09-30', ventas: '2026-09-15' })
    expect(await en((tx) => controlarBloqueo(tx, 'tesoreria', '2026-09-30'))).toContain('cerrado hasta el 30/09/2026')
    expect(await en((tx) => controlarBloqueo(tx, 'tesoreria', '2026-10-01'))).toBeNull()

    const mov = await en((tx) =>
      registrarMovimiento(tx, u, { cuentaId: caja, fecha: '2026-09-20', sentido: 'egreso', importe: '10', concepto: 'Atrasado' }),
    )
    expect(mov).toMatchObject({ ok: false, error: expect.stringContaining('Tesorería está cerrado') })
    expect(
      await en((tx) => entregarVale(tx, u, { cuentaId: caja, persona: 'Xavier', fecha: '2026-09-29', importe: '1' })),
    ).toMatchObject({ ok: false, error: expect.stringContaining('cerrado') })
    expect(
      await en((tx) => entregarVale(tx, u, { cuentaId: caja, persona: 'Xavier', fecha: '2026-10-01', importe: '1' })),
    ).toMatchObject({ ok: true })

    // El recibo del 15/09 ya no se anula; uno nuevo con esa fecha tampoco entra.
    const [rec] = await en((tx) => listarCheques(tx, {}))
    expect((await en((tx) => anularRecibo(tx, u, rec.reciboId))).ok).toBe(false)
    const nuevo = await en((tx) =>
      emitirRecibo(tx, u, {
        terceroId: cliente,
        fecha: '2026-09-15',
        valores: [{ medio: 'transferencia', importe: '1', cuentaId: banco }],
      }),
    )
    expect(nuevo).toMatchObject({ ok: false, error: expect.stringContaining('Ventas y cobranzas está cerrado') })

    // Reabrir: sin fecha.
    expect((await en((tx) => fijarBloqueo(tx, u, { modulo: 'ventas', cerradoHasta: null }, hoy))).ok).toBe(true)
    expect(await en((tx) => bloqueos(tx))).toEqual({ tesoreria: '2026-09-30' })
  })
})
