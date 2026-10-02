import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  asientos,
  comprobantes,
  cuentasTesoreria,
  ejercicios,
  empresas,
  presentaciones,
  recibos,
  recibosValores,
  terceros,
} from '../../db/schema'
import { registrarCompra } from '../compras/compras'
import { cargarSaldoInicial } from '../tesoreria/movimientos'
import { contabilizar } from './automaticos'
import { cerrarEjercicio, controlesContables, gastosAImputarPorProveedor, liquidarIva, reclasificarProveedor } from './cierre'
import { estadoResultados, hojasLibros, libroDiario, mayor, situacionPatrimonial, sumasYSaldos } from './libros'
import { iniciarContabilidad, mapaDeCuentas } from './plan'

const U = '00000000-0000-4000-8000-000000000001'

describe('libros, liquidación de IVA y cierre', () => {
  let empresa: string
  let proveedor: string
  let caja: string
  let m: Map<string, string>
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Cierre S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
    empresa = e.id
    ;[caja] = (
      await en((tx) => tx.insert(cuentasTesoreria).values({ codigo: 'CAJA', nombre: 'Caja', tipo: 'caja' }).returning())
    ).map((c) => c.id)
    const [cliente, prov] = await en((tx) =>
      tx
        .insert(terceros)
        .values([
          { codigo: 'C1', razonSocial: 'Cliente S.A.', tipoDocumento: 80, numeroDocumento: '30999176522', condicionIva: 1 },
          {
            codigo: 'P1',
            razonSocial: 'Estudio Contable',
            esCliente: false,
            esProveedor: true,
            tipoDocumento: 80,
            numeroDocumento: '30711222337',
            condicionIva: 1,
          },
        ])
        .returning(),
    )
    proveedor = prov.id
    expect(await en((tx) => iniciarContabilidad(tx, U, { inicio: '2025-01-01' }))).toEqual({ ok: true })
    m = await en((tx) => mapaDeCuentas(tx))
    // Saldo inicial de caja 1000; venta de 2000 + IVA 420 cobrada en efectivo; honorarios 500 + IVA 105.
    expect(await en((tx) => cargarSaldoInicial(tx, U, caja, '2025-01-01', '1000'))).toMatchObject({ ok: true })
    await en(async (tx) => {
      await tx.insert(comprobantes).values({
        clase: 'factura',
        letra: 'A',
        tipo: 1,
        puntoVenta: 1,
        numero: 1,
        fecha: '2025-03-10',
        estado: 'autorizado',
        cae: '76000000000001',
        terceroId: cliente.id,
        neto: '2000',
        iva: '420',
        total: '2420',
      })
      const [r] = await tx
        .insert(recibos)
        .values({ puntoVenta: 1, numero: 1, fecha: '2025-03-15', terceroId: cliente.id, total: '2420' })
        .returning()
      await tx.insert(recibosValores).values({ reciboId: r.id, medio: 'efectivo', importe: '2420', cuentaId: caja })
    })
    const c = await en((tx) =>
      registrarCompra(tx, U, {
        terceroId: proveedor,
        clase: 'factura',
        letra: 'A',
        puntoVenta: 1,
        numero: 50,
        fecha: '2025-03-20',
        periodoIva: '2025-03',
        items: [],
        iva: [{ alicuotaIva: 5, base: '500', importe: '105' }],
      }),
    )
    if (!c.ok) throw new Error(c.error)
    expect(await en((tx) => contabilizar(tx, null, '2025-03-31'))).toMatchObject({ generados: 4, errores: [] })
  })

  it('libro diario, mayor y sumas y saldos', async () => {
    const diario = await en((tx) => libroDiario(tx, '2025-01-01', '2025-03-31'))
    expect(diario.map((a) => a.orden)).toEqual([1, 2, 3, 4])
    for (const a of diario) expect(a.lineas.reduce((s, l) => s + l.debe - l.haber, 0)).toBeCloseTo(0, 2)
    const mc = await en((tx) => mayor(tx, m.get(`tesoreria:${caja}`)!, '2025-03-01', '2025-03-31'))
    expect(mc).toMatchObject({ saldoAnterior: 1000, debe: 2420, haber: 0, saldo: 3420 })
    const b = await en((tx) => sumasYSaldos(tx, '2025-01-01', '2025-03-31'))
    const raiz = b.filter((f) => f.nivel === 1)
    expect(raiz.reduce((s, f) => s + f.debe, 0)).toBeCloseTo(
      raiz.reduce((s, f) => s + f.haber, 0),
      2,
    )
    expect(b.find((f) => f.codigo === '1.1.01')?.saldo).toBe(3420)
  })

  it('estado de resultados y situación patrimonial cuadran', async () => {
    const er = await en((tx) => estadoResultados(tx, null, '2025-03-31'))
    expect(er).toMatchObject({ desde: '2025-01-01', totalIngresos: 2000, totalEgresos: 500, resultado: 1500 })
    const sp = await en((tx) => situacionPatrimonial(tx, '2025-03-31'))
    expect(sp).toMatchObject({ totalActivo: 3420 + 105, totalPasivo: 605 + 420, resultadoNoCerrado: 1500, diferencia: 0 })
    const hojas = await en((tx) => hojasLibros(tx, '2025-01-01', '2025-03-31'))
    expect(hojas.map((h) => h.nombre)).toEqual([
      'Libro diario',
      'Sumas y saldos',
      'Estado de resultados',
      'Situación patrimonial',
    ])
  })

  it('asienta la liquidación de IVA al presentar, y la rehace con la rectificativa', async () => {
    const posicion = {
      debito: 420,
      credito: 105,
      anterior: { tecnico: 0, libre: 0 },
      saldoTecnico: 315,
      saldoTecnicoAFavor: 0,
      percepciones: 0,
      retenciones: 0,
      pagosACuenta: 0,
      aPagar: 315,
      libreDisponibilidad: 0,
    }
    const [p] = await en((tx) =>
      tx
        .insert(presentaciones)
        .values({
          impuesto: 'iva_digital',
          periodo: '2025-03',
          estado: 'presentada',
          archivo: Buffer.from('x'),
          nombreArchivo: 'x.zip',
          resumen: { posicion },
        })
        .returning(),
    )
    const r = await en((tx) => liquidarIva(tx, U, p.id))
    expect(r).toMatchObject({ ok: true })
    expect(await en((tx) => liquidarIva(tx, U, p.id))).toMatchObject({ ok: true, omitido: 'ya liquidado' })
    const saldo = async (clave: string) => (await en((tx) => mayor(tx, m.get(clave)!, '2025-01-01', '2025-12-31'))).saldo
    expect(await saldo('iva_debito')).toBe(0)
    expect(await saldo('iva_credito')).toBe(0)
    expect(await saldo('iva_a_pagar')).toBe(-315)

    // Rectificativa: se reabre la primera y se presenta otra con otro importe.
    await en((tx) => tx.update(presentaciones).set({ estado: 'reabierta' }).where(eq(presentaciones.id, p.id)))
    const [p2] = await en((tx) =>
      tx
        .insert(presentaciones)
        .values({
          impuesto: 'iva_digital',
          periodo: '2025-03',
          secuencia: 1,
          estado: 'presentada',
          archivo: Buffer.from('y'),
          nombreArchivo: 'y.zip',
          resumen: { posicion: { ...posicion, credito: 100, saldoTecnico: 320, aPagar: 320 } },
        })
        .returning(),
    )
    expect(await en((tx) => liquidarIva(tx, U, p2.id))).toMatchObject({ ok: true })
    expect(await saldo('iva_a_pagar')).toBe(-320)
    expect(await saldo('iva_credito')).toBe(5)
  })

  it('controla contra tesorería y avisa lo que queda a imputar', async () => {
    const c = await en((tx) => controlesContables(tx, '2025-03-31'))
    expect(c.filter((x) => x.gravedad === 'error')).toEqual([])
    expect(c.map((x) => x.tema)).toEqual(expect.arrayContaining(['Gastos a imputar', 'Saldos iniciales a imputar']))
    // Un asiento manual contra la caja la descuadra con tesorería.
    await en((tx) =>
      import('./asientos').then(({ asientoManual }) =>
        asientoManual(tx, U, {
          fecha: '2025-03-31',
          concepto: 'Error de carga',
          lineas: [
            { cuentaId: m.get('gastos_a_imputar'), debe: 10 },
            { cuentaId: m.get(`tesoreria:${caja}`), haber: 10 },
          ],
        }),
      ),
    )
    const c2 = await en((tx) => controlesContables(tx, '2025-03-31'))
    expect(c2.find((x) => x.tema === 'Saldo de Caja')).toMatchObject({ gravedad: 'error', diferencia: -10 })
  })

  it('reclasifica los gastos a imputar del proveedor y recuerda la cuenta', async () => {
    expect(await en((tx) => gastosAImputarPorProveedor(tx))).toEqual([
      expect.objectContaining({ terceroId: proveedor, importe: 500, cantidad: 1 }),
    ])
    const honorarios = (await en((tx) => sumasYSaldos(tx, '2025-01-01', '2025-12-31', true))).find((f) => f.codigo === '5.11')!
    expect(await en((tx) => reclasificarProveedor(tx, U, proveedor, honorarios.id))).toEqual({ ok: true, reclasificados: 1 })
    expect(await en((tx) => gastosAImputarPorProveedor(tx))).toEqual([])
    expect(await en((tx) => reclasificarProveedor(tx, U, proveedor, honorarios.id))).toEqual({ ok: true, reclasificados: 0 })
    expect((await en((tx) => mayor(tx, honorarios.id, '2025-01-01', '2025-12-31'))).saldo).toBe(500)
    expect((await en((tx) => mapaDeCuentas(tx))).get(`proveedor:${proveedor}`)).toBe(honorarios.id)
  })

  it('cierra el ejercicio: refundición, apertura y fechas bloqueadas', async () => {
    const [e] = await en((tx) => tx.select().from(ejercicios))
    const r = await en((tx) => cerrarEjercicio(tx, U, e.id))
    expect(r).toMatchObject({ ok: true, resultado: 1500 - 10 })
    const er = await en((tx) => estadoResultados(tx, '2025-01-01', '2025-12-31'))
    expect(er.resultado).toBe(1490)
    const sp = await en((tx) => situacionPatrimonial(tx, '2026-01-01'))
    expect(sp).toMatchObject({ resultadoNoCerrado: 0, diferencia: 0 })
    expect(sp.patrimonio.find((x) => x.nombre === 'Resultados no asignados')?.importe).toBe(1490)
    expect(await en((tx) => cerrarEjercicio(tx, U, e.id))).toMatchObject({ ok: false })
    const tardio = await en((tx) =>
      import('./asientos').then(({ asientoManual }) =>
        asientoManual(tx, U, {
          fecha: '2025-12-31',
          concepto: 'Tarde',
          lineas: [
            { cuentaId: m.get('gastos_a_imputar'), debe: 1 },
            { cuentaId: m.get('otras_deudas'), haber: 1 },
          ],
        }),
      ),
    )
    expect(tardio).toMatchObject({ ok: false })
    const tipos = await en((tx) => tx.select({ origen: asientos.origen }).from(asientos).where(eq(asientos.origenId, e.id)))
    expect(tipos.map((t) => t.origen).sort()).toEqual(['apertura', 'refundicion'])
  })
})
