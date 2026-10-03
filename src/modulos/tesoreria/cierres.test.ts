import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { arqueos, cuentasTesoreria, empresas, terceros, usuarios } from '../../db/schema'
import { hoyArgentina } from '../../lib/fechas'
import { emitirRecibo } from '../facturacion/cuentas'
import { cerrarCaja, inicioTurno, listarCierres, resumenTurno } from './cierres'
import { saldoCuenta } from './cuentas'
import { registrarMovimiento } from './movimientos'

describe('Cierre de caja', () => {
  let empresa: string
  let caja: string
  let banco: string
  let cliente: string
  let ana: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Caja S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
    empresa = e.id
    ;[{ id: ana }] = await db.insert(usuarios).values({ email: 'ana@caja.com', nombre: 'Ana Caja', hashClave: 'x' }).returning()
    ;[{ id: caja }, { id: banco }] = await en((tx) =>
      tx
        .insert(cuentasTesoreria)
        .values([
          { codigo: 'CAJA', nombre: 'Caja mostrador', tipo: 'caja' },
          { codigo: 'BCO', nombre: 'Banco', tipo: 'banco' },
        ])
        .returning(),
    )
    ;[{ id: cliente }] = await en((tx) =>
      tx
        .insert(terceros)
        .values({ codigo: 'C1', razonSocial: 'Cliente', tipoDocumento: 80, numeroDocumento: '30999176522', condicionIva: 1 })
        .returning(),
    )
  })

  it('resume el turno: cobranzas por medio y cajero, retiros, efectivo esperado; al cerrar con faltante queda el arqueo', async () => {
    const hoy = hoyArgentina()
    const r = await en((tx) =>
      emitirRecibo(tx, ana, {
        terceroId: cliente,
        fecha: hoy,
        valores: [
          { medio: 'efectivo', importe: '15000', cuentaId: caja },
          { medio: 'transferencia', importe: '5000', cuentaId: banco },
        ],
      }),
    )
    expect(r.ok).toBe(true)
    await en((tx) =>
      registrarMovimiento(tx, ana, {
        cuentaId: caja,
        fecha: hoy,
        sentido: 'egreso',
        importe: '2000',
        concepto: 'Retiro para cambio',
      }),
    )

    const desde = await en((tx) => inicioTurno(tx, caja))
    const res = await en((tx) => resumenTurno(tx, caja, desde))
    expect(res).toMatchObject({
      saldoInicial: '0.00',
      ingresos: '15000.00',
      egresos: '2000.00',
      esperado: '13000.00',
      cobrado: '20000.00',
      recibos: 1,
      promedio: '20000.00',
    })
    expect(res.porMedio.map((m) => [m.nombre, m.total])).toEqual([
      ['Efectivo', '15000.00'],
      ['Transferencia', '5000.00'],
    ])
    expect(res.porCajero).toEqual([{ usuario: 'Ana Caja', total: '20000.00', recibos: 1 }])
    expect(res.otrosMovimientos.map((m) => m.importe)).toEqual(['-2000.00'])

    // Una cuenta que no es caja no se cierra.
    expect((await en((tx) => cerrarCaja(tx, ana, { cuentaId: banco, contado: '0' }))).ok).toBe(false)
    const c = await en((tx) =>
      cerrarCaja(tx, ana, {
        cuentaId: caja,
        contado: '12900',
        conteo: { '10000': 1, '1000': 2, '100': 9 },
        observaciones: 'Faltan 100',
      }),
    )
    expect(c).toMatchObject({ ok: true, diferencia: '-100.00' })
    // La caja queda en lo contado, con el arqueo y su ajuste.
    expect(await en((tx) => saldoCuenta(tx, caja))).toBe('12900.00')
    const [a] = await en((tx) => tx.select().from(arqueos).where(eq(arqueos.cuentaId, caja)))
    expect(a.diferencia).toBe('-100.00')

    // El próximo turno arranca del cierre, con lo contado como saldo inicial.
    const sig = await en((tx) => inicioTurno(tx, caja))
    const r2 = await en((tx) => resumenTurno(tx, caja, sig))
    expect(r2).toMatchObject({ saldoInicial: '12900.00', ingresos: '0.00', cobrado: '0.00', esperado: '12900.00' })
    // Sin diferencia no hay arqueo.
    expect(await en((tx) => cerrarCaja(tx, ana, { cuentaId: caja, contado: '12900' }))).toMatchObject({
      ok: true,
      diferencia: '0.00',
    })
    const lista = await en((tx) => listarCierres(tx, { cuentaId: caja }))
    expect(lista.map((x) => x.diferencia)).toEqual(['0.00', '-100.00'])
    expect(await en((tx) => tx.select().from(arqueos).where(eq(arqueos.cuentaId, caja)))).toHaveLength(1)
  })
})
