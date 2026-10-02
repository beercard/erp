import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { comprobantes, comprobantesItems, empresas, facturacionesContrato, puntosVenta, terceros } from '../../db/schema'
import { calcularContrato, renglonesFactura, type ContratoCalculo } from './calculo'
import { guardarContrato, guardarEquipo, importarLecturas, obtenerContrato, registrarLectura, retirarEquipo } from './contratos'
import { anularFacturacion, generarFacturas, prepararMes } from './facturacion'

const U = '00000000-0000-4000-8000-000000000001'
const lectura = (serie: string, anterior: number, actual: number, creditos = 0) => ({
  equipoId: serie,
  serie,
  anterior,
  actual,
  creditos,
})
const contrato = (c: Partial<ContratoCalculo>): ContratoCalculo => ({
  modalidad: 'abono',
  facturacion: 'vencida',
  moneda: 'DOL',
  cargoFijo: '0',
  copiasLibres: 0,
  precioExcedente: '0',
  porEquipo: false,
  ...c,
})

describe('cálculo (casos reales de PYMEXIS)', () => {
  it('abono en dólares con excedente', () => {
    const c = calcularContrato(
      contrato({ cargoFijo: '540', copiasLibres: 20000, precioExcedente: '0.0392' }),
      [lectura('A', 100000, 123420)],
      '1465',
    )
    expect(c.copias).toBe(23420)
    expect(c.copiasExcedentes).toBe(3420)
    expect(c.cargoPesos).toBe('791100.00')
    expect(c.precioExcedentePesos).toBe('57.4280')
    expect(c.excedentePesos).toBe('196403.76')
    expect(c.totalPesos).toBe('987503.76')
  })

  it('abono agrupado: suma las copias de todos los equipos contra las libres', () => {
    const equipos = Array.from({ length: 29 }, (_, i) => lectura(`E${i}`, 1000, 1000 + (i < 28 ? 3163 : 91716 - 3163 * 28)))
    const c = calcularContrato(contrato({ cargoFijo: '3262.5', copiasLibres: 87000, precioExcedente: '0.0375' }), equipos, '1460')
    expect(c.copias).toBe(91716)
    expect(c.copiasExcedentes).toBe(4716)
    expect(c.cargoPesos).toBe('4763250.00')
    expect(c.excedentePesos).toBe('258201.00')
  })

  it('solo excedente: todas las copias', () => {
    const c = calcularContrato(contrato({ modalidad: 'excedente', precioExcedente: '0.0222' }), [lectura('X', 0, 12294)], '1418')
    expect(c.cargoPesos).toBe('0.00')
    expect(c.copiasExcedentes).toBe(12294)
    expect(c.excedentePesos).toBe('387010.20')
  })

  it('por equipo multiplica el cargo y las libres; descuenta créditos; contador hacia atrás cuenta 0', () => {
    const c = calcularContrato(
      contrato({ moneda: 'PES', cargoFijo: '10000', copiasLibres: 1000, precioExcedente: '5', porEquipo: true }),
      [lectura('A', 0, 1500, 100), lectura('B', 5000, 4000)],
      '1',
    )
    expect(c.cargoPesos).toBe('20000.00')
    expect(c.copias).toBe(1400)
    expect(c.copiasLibres).toBe(2000)
    expect(c.copiasExcedentes).toBe(0)
    expect(c.avisos).toHaveLength(1)
  })

  it('renglones: abono adelantado del mes siguiente, excedente del mes y datos informativos', () => {
    const c = contrato({ cargoFijo: '540', copiasLibres: 20000, precioExcedente: '0.0392', facturacion: 'adelantada' })
    const calc = calcularContrato(c, [lectura('A', 100000, 123420)], '1465')
    const r = renglonesFactura({ ...c, alicuotaIva: 5, tipo: 'Servicio de fotocopiado', leyenda: null }, calc, '2026-12', '1465')
    expect(r[0].descripcion).toContain('Enero/2027')
    expect(r[1]).toMatchObject({ descripcion: 'Copias excedentes Diciembre/2026', cantidad: '3420', precioUnitario: '57.4280' })
    expect(r.slice(2).every((x) => x.precioUnitario === '0')).toBe(true)
    expect(r.some((x) => x.descripcion.includes('Dólar BNA'))).toBe(true)
  })
})

describe('contratos, lecturas y facturación del mes', () => {
  let empresa: string
  let cliente: string
  let otro: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Copiadora S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    await en(async (tx) => {
      await tx.insert(puntosVenta).values({ numero: 5, nombre: 'ERP', tipo: 'electronico' })
      ;[cliente, otro] = (
        await tx
          .insert(terceros)
          .values([
            { codigo: 'C1', razonSocial: 'Escuela', tipoDocumento: 80, numeroDocumento: '30999176522', condicionIva: 1 },
            { codigo: 'C2', razonSocial: 'Otro', tipoDocumento: 99, condicionIva: 5 },
          ])
          .returning()
      ).map((t) => t.id)
    })
  })

  it('arma el contrato, instala equipos, carga lecturas y factura en borrador', async () => {
    const c = await en((tx) =>
      guardarContrato(tx, U, {
        terceroId: cliente,
        tipo: 'Servicio de fotocopiado',
        modalidad: 'abono',
        facturacion: 'vencida',
        moneda: 'DOL',
        cargoFijo: '100',
        copiasLibres: 1000,
        precioExcedente: '0.03',
      }),
    )
    if (!c.ok) throw new Error(c.error)
    const a = await en((tx) => guardarEquipo(tx, U, { serie: 'AAA111', contratoId: c.id, contadorInicial: 5000 }))
    const b = await en((tx) => guardarEquipo(tx, U, { serie: 'BBB222', contratoId: c.id, contadorInicial: 0 }))
    if (!a.ok || !b.ok) throw new Error('equipos')
    expect((await en((tx) => guardarEquipo(tx, U, { serie: 'AAA111' }))).ok).toBe(false)
    expect((await en((tx) => guardarEquipo(tx, U, { serie: 'CCC333', contratoId: c.id, terceroId: otro }))).ok).toBe(false)

    expect((await en((tx) => registrarLectura(tx, U, { equipoId: a.id, fecha: '2026-10-28', contador: 5800 }))).ok).toBe(true)
    const r = await en((tx) =>
      importarLecturas(tx, U, [
        { serie: 'bbb222', fecha: '2026-10-29', contador: 700 },
        { serie: 'ZZZ', fecha: '2026-10-29', contador: 1 },
      ]),
    )
    expect(r.cargadas).toBe(1)
    expect(r.errores[0]).toContain('ZZZ')

    const [p] = await en((tx) => prepararMes(tx, '2026-10', '1500'))
    expect(p.calculo.copias).toBe(1500)
    expect(p.calculo.copiasExcedentes).toBe(500)
    expect(p.calculo.totalPesos).toBe('172500.00')
    expect(p.sinLectura).toEqual([])

    const g = await en((tx) =>
      generarFacturas(tx, U, { periodo: '2026-10', contratoIds: [c.id], puntoVenta: 5, fecha: '2026-11-02', cotizacion: '1500' }),
    )
    expect(g.errores).toEqual([])
    expect(g.generadas).toHaveLength(1)
    const [f] = await en((tx) => tx.select().from(comprobantes).where(eq(comprobantes.id, g.generadas[0].comprobanteId)))
    expect(f.estado).toBe('borrador')
    expect(f.neto).toBe('172500.00')
    const items = await en((tx) => tx.select().from(comprobantesItems).where(eq(comprobantesItems.comprobanteId, f.id)))
    expect(items.length).toBeGreaterThanOrEqual(3)

    // No se factura dos veces el mismo mes.
    const otra = await en((tx) =>
      generarFacturas(tx, U, { periodo: '2026-10', contratoIds: [c.id], puntoVenta: 5, fecha: '2026-11-02', cotizacion: '1500' }),
    )
    expect(otra.generadas).toHaveLength(0)

    // El mes siguiente parte de lo facturado.
    await en((tx) => registrarLectura(tx, U, { equipoId: a.id, fecha: '2026-11-27', contador: 6000 }))
    const [nov] = await en((tx) => prepararMes(tx, '2026-11', '1500'))
    expect(nov.calculo.copias).toBe(200)
    expect(nov.sinLectura).toEqual(['BBB222'])

    // Un contador menor que el anterior se rechaza.
    expect((await en((tx) => registrarLectura(tx, U, { equipoId: a.id, fecha: '2026-11-30', contador: 10 }))).ok).toBe(false)

    // Anular la facturación borra el borrador y libera el mes.
    const [fc] = await en((tx) => tx.select().from(facturacionesContrato).where(eq(facturacionesContrato.contratoId, c.id)))
    expect((await en((tx) => anularFacturacion(tx, U, fc.id))).ok).toBe(true)
    expect(await en((tx) => tx.select().from(comprobantes).where(eq(comprobantes.id, f.id)))).toHaveLength(0)
    const [oct] = await en((tx) => prepararMes(tx, '2026-10', '1500'))
    expect(oct.facturado).toBe(false)

    // Retirar un equipo lo saca del contrato.
    expect((await en((tx) => retirarEquipo(tx, U, b.id, '2026-11-30', 'Fin de contrato'))).ok).toBe(true)
    const detalle = await en((tx) => obtenerContrato(tx, c.id))
    expect(detalle?.equipos.filter((e) => e.estado === 'instalado')).toHaveLength(1)
  })

  it('lo facturado no se puede modificar ni borrar', async () => {
    const [f] = await en((tx) => tx.select().from(facturacionesContrato).limit(1))
    await expect(
      en((tx) => tx.update(facturacionesContrato).set({ total: '1' }).where(eq(facturacionesContrato.id, f.id))),
    ).rejects.toThrow()
  })
})
