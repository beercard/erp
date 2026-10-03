import { eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  asientos,
  comprobantes,
  comprobantesTributos,
  cuentasTesoreria,
  empresas,
  pagos,
  pagosValores,
  recibos,
  recibosValores,
  retenciones,
  terceros,
} from '../../db/schema'
import { anularCompra, filasDe, registrarCompra } from '../compras/compras'
import { anularMovimiento, registrarMovimiento, transferir } from '../tesoreria/movimientos'
import { contabilizar, pendientesDeContabilizar } from './automaticos'
import { asignarClave, iniciarContabilidad, mapaDeCuentas } from './plan'

const U = '00000000-0000-4000-8000-000000000001'

describe('asientos automáticos', () => {
  let empresa: string
  let cliente: string
  let proveedor: string
  let caja: string
  let banco: string
  let compra: string
  let movimiento: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  /** Saldo (debe − haber) de la cuenta de una clave. */
  const saldo = async (clave: string) => {
    const m = await en((tx) => mapaDeCuentas(tx))
    const [f] = filasDe<{ s: number }>(
      await en((tx) =>
        tx.execute(
          sql`select coalesce(sum(debe - haber), 0)::float as s from asientos_lineas l join asientos a on a.id = l.asiento_id where l.cuenta_id = ${m.get(clave)} and a.estado = 'registrado'`,
        ),
      ),
    )
    return Math.round(Number(f?.s ?? 0) * 100) / 100
  }

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Asientos S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    ;[caja, banco] = (
      await en((tx) =>
        tx
          .insert(cuentasTesoreria)
          .values([
            { codigo: 'CAJA', nombre: 'Caja central', tipo: 'caja' },
            { codigo: 'GAL', nombre: 'Banco Galicia', tipo: 'banco' },
          ])
          .returning(),
      )
    ).map((c) => c.id)
    ;[cliente, proveedor] = (
      await en((tx) =>
        tx
          .insert(terceros)
          .values([
            { codigo: 'C1', razonSocial: 'Cliente S.A.', tipoDocumento: 80, numeroDocumento: '30999176522', condicionIva: 1 },
            {
              codigo: 'P1',
              razonSocial: 'Proveedor S.A.',
              esCliente: false,
              esProveedor: true,
              tipoDocumento: 80,
              numeroDocumento: '30711222337',
              condicionIva: 1,
            },
          ])
          .returning(),
      )
    ).map((x) => x.id)
    expect(await en((tx) => iniciarContabilidad(tx, U, { inicio: '2026-01-01' }))).toEqual({ ok: true })

    await en(async (tx) => {
      // Factura A 1000 + IVA 210 + percepción IIBB 30, y una NC de 100 + 21.
      const [f] = await tx
        .insert(comprobantes)
        .values({
          clase: 'factura',
          letra: 'A',
          tipo: 1,
          puntoVenta: 1,
          numero: 1,
          fecha: '2026-02-01',
          estado: 'autorizado',
          cae: '76000000000001',
          terceroId: cliente,
          neto: '1000',
          iva: '210',
          tributos: '30',
          total: '1240',
        })
        .returning()
      await tx
        .insert(comprobantesTributos)
        .values({ comprobanteId: f.id, tributo: 7, descripcion: 'Percepción IIBB', base: '1000', alicuota: '3', importe: '30' })
      await tx.insert(comprobantes).values({
        clase: 'nota_credito',
        letra: 'A',
        tipo: 3,
        puntoVenta: 1,
        numero: 1,
        fecha: '2026-02-10',
        estado: 'autorizado',
        cae: '76000000000001',
        terceroId: cliente,
        neto: '100',
        iva: '21',
        total: '121',
      })
      // Anterior a la puesta en marcha: no se contabiliza.
      await tx.insert(comprobantes).values({
        clase: 'factura',
        letra: 'A',
        tipo: 1,
        puntoVenta: 1,
        numero: 0,
        fecha: '2025-12-30',
        estado: 'autorizado',
        cae: '76000000000001',
        terceroId: cliente,
        neto: '50',
        total: '50',
      })
      // Cobranza: 500 en efectivo a caja, un cheque de 600 y una retención de IIBB de 19.
      const [r] = await tx
        .insert(recibos)
        .values({ puntoVenta: 1, numero: 1, fecha: '2026-02-15', terceroId: cliente, total: '1119' })
        .returning()
      await tx.insert(recibosValores).values([
        { reciboId: r.id, medio: 'efectivo', importe: '500', cuentaId: caja },
        { reciboId: r.id, medio: 'cheque', importe: '600', banco: 'Nación', numeroValor: '123' },
        { reciboId: r.id, medio: 'retencion_iibb', importe: '19', numeroValor: 'C-1' },
      ])
      // Pago: transferencia de 300 desde el banco, cheque propio diferido de 400 y retención de Ganancias de 20.
      const [p] = await tx
        .insert(pagos)
        .values({ numero: 1, fecha: '2026-02-20', terceroId: proveedor, total: '720' })
        .returning()
      await tx.insert(pagosValores).values([
        { pagoId: p.id, medio: 'transferencia', importe: '300', cuentaId: banco },
        { pagoId: p.id, medio: 'cheque_propio', importe: '400', numeroValor: '9001', fechaPago: '2026-03-20', cuentaId: banco },
      ])
      await tx.insert(retenciones).values({ pagoId: p.id, impuesto: 'ganancias', numero: 1, base: '1000', importe: '20' })
    })

    const c = await en((tx) =>
      registrarCompra(tx, U, {
        terceroId: proveedor,
        clase: 'factura',
        letra: 'A',
        puntoVenta: 3,
        numero: 100,
        fecha: '2026-02-05',
        periodoIva: '2026-02',
        items: [],
        iva: [{ alicuotaIva: 5, base: '2000', importe: '420' }],
        tributos: [{ tipo: 'percepcion_iva', importe: '60' }],
      }),
    )
    if (!c.ok) throw new Error(c.error)
    compra = c.id
    const t = await en((tx) => transferir(tx, U, { origenId: caja, destinoId: banco, fecha: '2026-02-25', importe: '200' }))
    if (!t.ok) throw new Error(t.error)
    const g = await en((tx) =>
      registrarMovimiento(tx, U, { cuentaId: caja, fecha: '2026-02-26', sentido: 'egreso', importe: '50', concepto: 'Librería' }),
    )
    if (!g.ok) throw new Error(g.error)
    movimiento = g.id
  })

  it('contabiliza cada operación desde la puesta en marcha', async () => {
    expect(await en((tx) => pendientesDeContabilizar(tx, '2026-02-28'))).toMatchObject({
      ventas: 2,
      compras: 1,
      cobranzas: 1,
      pagos: 1,
    })
    const r = await en((tx) => contabilizar(tx, null, '2026-02-28'))
    expect(r.errores).toEqual([])
    // 2 ventas, 1 compra, 1 cobranza, 1 pago, 1 transferencia, 1 egreso (el cheque diferido vence en marzo).
    expect(r.generados).toBe(7)

    expect(await saldo('deudores')).toBe(1240 - 121 - 1119)
    expect(await saldo('ventas_productos')).toBe(-900)
    expect(await saldo('iva_debito')).toBe(-189)
    expect(await saldo('percepciones_iibb_a_depositar')).toBe(-30)
    expect(await saldo('gastos_a_imputar')).toBe(2000 + 50)
    expect(await saldo('iva_credito')).toBe(420)
    expect(await saldo('percepciones_iva_sufridas')).toBe(60)
    expect(await saldo('proveedores')).toBe(-2480 + 720)
    expect(await saldo('valores_a_depositar')).toBe(600)
    expect(await saldo('retenciones_iibb_sufridas')).toBe(19)
    expect(await saldo('cheques_diferidos')).toBe(-400)
    expect(await saldo('retenciones_ganancias_a_depositar')).toBe(-20)
    expect(await saldo(`tesoreria:${caja}`)).toBe(500 - 200 - 50)
    expect(await saldo(`tesoreria:${banco}`)).toBe(-300 + 200)
  })

  it('es idempotente y sigue con lo que vence después', async () => {
    expect(await en((tx) => contabilizar(tx, null, '2026-02-28'))).toMatchObject({ generados: 0, revertidos: 0, errores: [] })
    const r = await en((tx) => contabilizar(tx, null, '2026-03-31'))
    expect(r).toMatchObject({ generados: 1, errores: [] })
    expect(await saldo('cheques_diferidos')).toBe(0)
    expect(await saldo(`tesoreria:${banco}`)).toBe(-300 + 200 - 400)
  })

  it('las anulaciones generan su contraasiento', async () => {
    expect(await en((tx) => anularCompra(tx, U, compra))).toMatchObject({ ok: true })
    expect(await en((tx) => anularMovimiento(tx, U, movimiento))).toMatchObject({ ok: true })
    const r = await en((tx) => contabilizar(tx, null, '2026-03-31'))
    expect(r).toMatchObject({ generados: 0, revertidos: 2, errores: [] })
    expect(await saldo('gastos_a_imputar')).toBe(0)
    expect(await saldo('proveedores')).toBe(720)
    expect(await saldo(`tesoreria:${caja}`)).toBe(500 - 200)
    expect(await en((tx) => contabilizar(tx, null, '2026-03-31'))).toMatchObject({ generados: 0, revertidos: 0 })
  })

  it('usa la cuenta de gasto asignada al proveedor y avisa si falta una cuenta', async () => {
    const m = await en((tx) => mapaDeCuentas(tx))
    expect(await en((tx) => asignarClave(tx, U, `proveedor:${proveedor}`, m.get('impuestos_tasas')!))).toMatchObject({ ok: true })
    const c = await en((tx) =>
      registrarCompra(tx, U, {
        terceroId: proveedor,
        clase: 'factura',
        letra: 'A',
        puntoVenta: 3,
        numero: 101,
        fecha: '2026-03-05',
        periodoIva: '2026-03',
        items: [],
        iva: [{ alicuotaIva: 5, base: '100', importe: '21' }],
      }),
    )
    expect(c.ok).toBe(true)
    expect(await en((tx) => contabilizar(tx, null, '2026-03-31'))).toMatchObject({ generados: 1, errores: [] })
    expect(await saldo('impuestos_tasas')).toBe(100)
    const total = await en((tx) =>
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(asientos)
        .where(eq(asientos.automatico, true)),
    )
    expect(total[0].n).toBe(11)
  })
})
