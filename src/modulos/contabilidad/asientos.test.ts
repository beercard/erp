import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { asientos, asientosLineas, cuentasTesoreria, ejercicios, empresas } from '../../db/schema'
import { anularAsientoManual, asientoManual, cerrarHasta, obtenerAsiento, registrarAsiento } from './asientos'
import { guardarCuenta, iniciarContabilidad, mapaDeCuentas, planDeCuentas } from './plan'

const U = '00000000-0000-4000-8000-000000000001'

describe('plan de cuentas y asientos', () => {
  let empresa: string
  let m: Map<string, string>
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Contable S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    await en((tx) =>
      tx.insert(cuentasTesoreria).values([
        { codigo: 'CAJA', nombre: 'Caja central', tipo: 'caja' },
        { codigo: 'GAL', nombre: 'Banco Galicia', tipo: 'banco' },
      ]),
    )
  })

  it('pone en marcha la contabilidad con el plan modelo y una cuenta por caja y banco', async () => {
    expect(await en((tx) => iniciarContabilidad(tx, U, { inicio: '2026-01-01' }))).toEqual({ ok: true })
    expect(await en((tx) => iniciarContabilidad(tx, U, { inicio: '2026-01-01' }))).toMatchObject({ ok: false })
    const plan = await en((tx) => planDeCuentas(tx))
    expect(plan.find((c) => c.codigo === '1.1.02.01')).toMatchObject({
      nombre: 'Deudores por ventas',
      imputable: true,
      claves: ['deudores'],
    })
    expect(plan.find((c) => c.codigo === '1.1')).toMatchObject({ imputable: false })
    expect(plan.filter((c) => c.claves.some((k) => k.startsWith('tesoreria:'))).map((c) => [c.codigo, c.nombre])).toEqual([
      ['1.1.01.10', 'Caja central'],
      ['1.1.01.11', 'Banco Galicia'],
    ])
    m = await en((tx) => mapaDeCuentas(tx))
  })

  it('registra asientos balanceados y rechaza los que no', async () => {
    const ok = await en((tx) =>
      asientoManual(tx, U, {
        fecha: '2026-03-31',
        concepto: 'Amortización del trimestre',
        lineas: [
          { cuentaId: m.get('gastos_a_imputar'), debe: '1000.50' },
          { cuentaId: m.get('otras_deudas'), haber: '1000.50' },
        ],
      }),
    )
    expect(ok).toMatchObject({ ok: true, numero: 1 })
    const mal = await en((tx) =>
      asientoManual(tx, U, {
        fecha: '2026-03-31',
        concepto: 'No balancea',
        lineas: [
          { cuentaId: m.get('gastos_a_imputar'), debe: 10 },
          { cuentaId: m.get('otras_deudas'), haber: 9.99 },
        ],
      }),
    )
    expect(mal).toMatchObject({ ok: false, error: expect.stringContaining('No balancea') })
    const plan = await en((tx) => planDeCuentas(tx))
    const rubro = plan.find((c) => c.codigo === '1.1.01')!
    const agrupa = await en((tx) =>
      asientoManual(tx, U, {
        fecha: '2026-03-31',
        concepto: 'Al rubro',
        lineas: [
          { cuentaId: rubro.id, debe: 1 },
          { cuentaId: m.get('otras_deudas'), haber: 1 },
        ],
      }),
    )
    expect(agrupa).toMatchObject({ ok: false, error: expect.stringContaining('agrupa') })
  })

  it('la base no acepta un asiento que no balancea aunque se saltee el código', async () => {
    await expect(
      en(async (tx) => {
        const [a] = await tx.insert(asientos).values({ numero: 999, fecha: '2026-03-31', concepto: 'trampa' }).returning()
        await tx.insert(asientosLineas).values({ asientoId: a.id, orden: 1, cuentaId: m.get('caja')!, debe: '5' })
      }),
    ).rejects.toThrow()
  })

  it('anular es un contraasiento; cerrar el período bloquea; un ejercicio nuevo se abre solo', async () => {
    const [a] = await en((tx) => tx.select().from(asientos).where(eq(asientos.numero, 1)))
    const r = await en((tx) => anularAsientoManual(tx, U, a.id, '2026-04-01'))
    expect(r).toMatchObject({ ok: true })
    expect(await en((tx) => anularAsientoManual(tx, U, a.id, '2026-04-01'))).toMatchObject({ ok: false })
    const ver = (await en((tx) => obtenerAsiento(tx, a.id)))!
    expect(ver.revertidoPor).toMatchObject({ numero: 2 })

    await en((tx) => cerrarHasta(tx, U, '2026-04-30'))
    const cerrado = await en((tx) =>
      registrarAsiento(tx, U, {
        fecha: '2026-04-15',
        concepto: 'x',
        origen: 'manual',
        lineas: [
          { cuentaId: m.get('caja')!, debe: 1 },
          { cuentaId: m.get('otras_deudas')!, haber: 1 },
        ],
      }),
    )
    expect(cerrado).toMatchObject({ ok: false, error: expect.stringContaining('cerrada hasta') })
    const siguiente = await en((tx) =>
      registrarAsiento(tx, U, {
        fecha: '2027-02-10',
        concepto: 'x',
        origen: 'manual',
        lineas: [
          { cuentaId: m.get('caja')!, debe: 1 },
          { cuentaId: m.get('otras_deudas')!, haber: 1 },
        ],
      }),
    )
    expect(siguiente.ok).toBe(true)
    expect((await en((tx) => tx.select().from(ejercicios))).map((e) => [e.inicio, e.fin])).toEqual([
      ['2026-01-01', '2026-12-31'],
      ['2027-01-01', '2027-12-31'],
    ])
  })

  it('agregar una subcuenta vuelve no imputable a la que agrupa', async () => {
    expect(await en((tx) => guardarCuenta(tx, U, { codigo: '5.8.01', nombre: 'Alquiler del local' }))).toEqual({ ok: true })
    const plan = await en((tx) => planDeCuentas(tx))
    expect(plan.find((c) => c.codigo === '5.8')).toMatchObject({ imputable: false })
    expect(await en((tx) => guardarCuenta(tx, U, { codigo: '9.1', nombre: 'Huérfana' }))).toMatchObject({ ok: false })
  })
})
