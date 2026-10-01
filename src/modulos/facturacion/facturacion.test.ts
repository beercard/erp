import { eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { comprobantes, empresas, percepcionesIibb, puntosVenta, terceros } from '../../db/schema'
import type { ClienteArca } from '../arca/cliente'
import { ErrorIncierto } from '../arca/soap'
import type { SolicitudCae } from '../arca/wsfe'
import { eliminarBorrador, emitirComprobante, guardarComprobante, obtenerComprobante, verificarComprobante } from './comprobantes'
import { anularRecibo, cuentaCorriente, emitirRecibo, imputar, ReciboInvalido } from './cuentas'
import { codigoComprobante, datosTipo, documentoReceptor, letraPara, urlQr } from './tipos'

const U = '00000000-0000-4000-8000-000000000001'
const HOY = '2026-10-01'
let empresa: string
let inscripto: string
let consumidor: string
let sinCuit: string

const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

/** ARCA de mentira: numera, aprueba o rechaza, y recuerda lo autorizado. */
class ArcaFalso implements ClienteArca {
  ambiente = 'homologacion' as const
  modo: 'aprobar' | 'rechazar' | 'incierto' | 'incierto_pero_autoriza' = 'aprobar'
  ultimo = new Map<string, number>()
  autorizados = new Map<string, { total: string; docNumero: string; cae: string }>()
  pedidos: SolicitudCae[] = []
  async ultimoAutorizado(pv: number, tipo: number) {
    return this.ultimo.get(`${pv}-${tipo}`) ?? 0
  }
  async solicitarCae(s: SolicitudCae) {
    this.pedidos.push(s)
    const clave = `${s.puntoVenta}-${s.tipo}`
    if (s.numero !== (this.ultimo.get(clave) ?? 0) + 1) throw new Error('número fuera de secuencia')
    if (this.modo === 'incierto') throw new ErrorIncierto('ARCA no respondió a tiempo.')
    if (this.modo === 'rechazar') {
      return {
        resultado: 'R' as const,
        cae: null,
        caeVence: null,
        observaciones: [{ codigo: '10015', mensaje: 'DocNro invalido' }],
        errores: [],
      }
    }
    const cae = String(76400000000000 + this.autorizados.size)
    this.ultimo.set(clave, s.numero)
    this.autorizados.set(`${clave}-${s.numero}`, { total: s.total, docNumero: s.docNumero, cae })
    if (this.modo === 'incierto_pero_autoriza') throw new ErrorIncierto('Se cortó después de autorizar.')
    return { resultado: 'A' as const, cae, caeVence: '2026-10-11', observaciones: [], errores: [] }
  }
  async consultar(pv: number, tipo: number, numero: number) {
    const a = this.autorizados.get(`${pv}-${tipo}-${numero}`)
    return a
      ? { numero, fecha: HOY, total: a.total, docNumero: a.docNumero, cae: a.cae, caeVence: '2026-10-11', resultado: 'A' }
      : null
  }
}

const arca = new ArcaFalso()
const crear = async () => arca

const item = (precio: string, alicuotaIva = 5, cantidad = '1') => ({
  descripcion: 'Tóner',
  cantidad,
  precioUnitario: precio,
  alicuotaIva,
})
const factura = (terceroId: string, extra: Record<string, unknown> = {}) => ({
  clase: 'factura',
  puntoVenta: 5,
  terceroId,
  fecha: HOY,
  moneda: 'PES',
  cotizacion: '1',
  items: [item('1000')],
  ...extra,
})

async function guardar(datos: unknown) {
  const r = await en((tx) => guardarComprobante(tx, U, datos))
  if (!r.ok) throw new Error(r.error)
  return r.id
}

beforeAll(async () => {
  const db = await baseDePrueba()
  const [e] = await db.insert(empresas).values({ razonSocial: 'Emisora S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
  empresa = e.id
  await en(async (tx) => {
    await tx.insert(puntosVenta).values([
      { numero: 5, nombre: 'ERP', tipo: 'electronico' },
      { numero: 3, nombre: 'Manual', tipo: 'manual' },
    ])
    const [a, b, c] = await tx
      .insert(terceros)
      .values([
        {
          codigo: 'RI',
          razonSocial: 'Inscripto S.A.',
          tipoDocumento: 80,
          numeroDocumento: '30999176522',
          condicionIva: 1,
          percepcionIibb: '3.5',
        },
        { codigo: 'CF', razonSocial: 'Consumidor', tipoDocumento: 99, condicionIva: 5 },
        { codigo: 'MAL', razonSocial: 'Inscripto sin CUIT', tipoDocumento: 80, condicionIva: 1 },
      ])
      .returning()
    inscripto = a.id
    consumidor = b.id
    sinCuit = c.id
    await tx.insert(percepcionesIibb).values({ nombre: 'Percepción IIBB Chaco', alicuota: '2', minimoBase: '500', activa: true })
  })
})

describe('tipos de comprobante', () => {
  it('elige la letra según el emisor y el receptor', () => {
    expect(letraPara(1, 'A')).toBe('A')
    expect(letraPara(1, 'B')).toBe('B')
    expect(letraPara(6, 'A')).toBe('C')
    expect([
      codigoComprobante('A', 'factura'),
      codigoComprobante('B', 'nota_credito'),
      codigoComprobante('A', 'factura', true),
    ]).toEqual([1, 8, 201])
    expect(datosTipo(203)).toEqual({ letra: 'A', clase: 'nota_credito', fce: true })
    expect(documentoReceptor(96, '30.123.456')).toEqual({ docTipo: 96, docNumero: '30123456' })
    expect(documentoReceptor(null, null)).toEqual({ docTipo: 99, docNumero: '0' })
  })

  it('arma el QR de ARCA con los datos del comprobante', () => {
    const url = urlQr({
      fecha: HOY,
      cuit: '30715974823',
      puntoVenta: 5,
      tipo: 1,
      numero: 7,
      total: '1210.00',
      moneda: 'PES',
      cotizacion: '1',
      docTipo: 80,
      docNumero: '30999176522',
      cae: '76400000000001',
    })
    const datos = JSON.parse(atob(url.split('?p=')[1]))
    expect(datos).toMatchObject({
      ver: 1,
      cuit: 30715974823,
      ptoVta: 5,
      tipoCmp: 1,
      nroCmp: 7,
      importe: 1210,
      tipoDocRec: 80,
      tipoCodAut: 'E',
      codAut: 76400000000001,
    })
  })
})

describe('borradores', () => {
  it('una factura a un inscripto es A, con IVA por alícuota y la percepción del padrón', async () => {
    const id = await guardar(factura(inscripto, { items: [item('1000'), item('200', 4)] }))
    const c = await en((tx) => obtenerComprobante(tx, id))
    expect([c?.letra, c?.tipo, c?.estado, c?.numero]).toEqual(['A', 1, 'borrador', null])
    expect(c?.detalleIva.map((a) => [a.alicuotaIva, a.base, a.importe])).toEqual([
      [4, '200.00', '21.00'],
      [5, '1000.00', '210.00'],
    ])
    // 3,5 % del cliente (no el 2 % general) sobre 1.200 de neto.
    expect(c?.detalleTributos.map((t) => [t.importe, t.alicuota])).toEqual([['42.00', '3.5000']])
    expect(c?.total).toBe('1473.00')
    await en((tx) => eliminarBorrador(tx, U, id))
  })

  it('a un consumidor final es B y sin percepción (solo se percibe en A)', async () => {
    const id = await guardar(factura(consumidor))
    const c = await en((tx) => obtenerComprobante(tx, id))
    expect([c?.letra, c?.tipo, c?.receptorDocTipo, c?.detalleTributos.length, c?.total]).toEqual(['B', 6, 99, 0, '1210.00'])
    await en((tx) => eliminarBorrador(tx, U, id))
  })

  it('valida punto de venta, servicios y notas sin comprobante asociado', async () => {
    const r1 = await en((tx) => guardarComprobante(tx, U, factura(inscripto, { puntoVenta: 3 })))
    expect(r1).toMatchObject({ ok: false, error: expect.stringContaining('no está habilitado') })
    const r2 = await en((tx) => guardarComprobante(tx, U, factura(inscripto, { concepto: 2 })))
    expect(r2).toMatchObject({ ok: false, error: expect.stringContaining('período') })
    const r3 = await en((tx) => guardarComprobante(tx, U, factura(inscripto, { clase: 'nota_credito' })))
    expect(r3).toMatchObject({ ok: false, error: expect.stringContaining('comprobante que corrige') })
  })
})

describe('emisión con ARCA', () => {
  it('pide el número a ARCA, autoriza y guarda el CAE', async () => {
    arca.modo = 'aprobar'
    arca.ultimo.set('5-1', 41)
    const id = await guardar(factura(inscripto))
    const r = await emitirComprobante(empresa, U, id, crear, HOY)
    expect(r).toMatchObject({ ok: true, numero: 42 })
    const c = await en((tx) => obtenerComprobante(tx, id))
    expect([c?.estado, c?.numero, c?.cae]).toEqual(['autorizado', 42, (r as { cae: string }).cae])
    const pedido = arca.pedidos.at(-1)!
    expect([pedido.docTipo, pedido.docNumero, pedido.neto, pedido.iva, pedido.tributos, pedido.total]).toEqual([
      80,
      '30999176522',
      '1000.00',
      '210.00',
      '35.00',
      '1245.00',
    ])
  })

  it('un comprobante autorizado no se puede tocar, ni desde la base', async () => {
    const [c] = await en((tx) => tx.select().from(comprobantes).where(eq(comprobantes.estado, 'autorizado')))
    await expect(en((tx) => tx.update(comprobantes).set({ total: '1' }).where(eq(comprobantes.id, c.id)))).rejects.toThrow()
    await expect(en((tx) => tx.delete(comprobantes).where(eq(comprobantes.id, c.id)))).rejects.toThrow()
    expect(await en((tx) => eliminarBorrador(tx, U, c.id))).toMatchObject({ ok: false })
  })

  it('si ARCA rechaza, vuelve a borrador sin consumir el número', async () => {
    arca.modo = 'rechazar'
    const id = await guardar(factura(inscripto))
    const r = await emitirComprobante(empresa, U, id, crear, HOY)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('DocNro invalido') })
    const c = await en((tx) => obtenerComprobante(tx, id))
    expect([c?.estado, c?.numero]).toEqual(['borrador', null])
    // Con el problema resuelto, sale con el número siguiente al último autorizado.
    arca.modo = 'aprobar'
    expect(await emitirComprobante(empresa, U, id, crear, HOY)).toMatchObject({ ok: true, numero: 43 })
  })

  it('si se corta la conexión queda pendiente, y al verificar toma el CAE que ARCA sí dio', async () => {
    arca.modo = 'incierto_pero_autoriza'
    const id = await guardar(factura(inscripto))
    const r = await emitirComprobante(empresa, U, id, crear, HOY)
    expect(r).toMatchObject({ ok: false, pendiente: true })
    expect((await en((tx) => obtenerComprobante(tx, id)))?.estado).toBe('pendiente_verificacion')
    // Otro comprobante del mismo tipo espera a que se resuelva el pendiente.
    const otro = await guardar(factura(inscripto))
    expect(await emitirComprobante(empresa, U, otro, crear, HOY)).toMatchObject({
      ok: false,
      error: expect.stringContaining('esperando confirmación'),
    })
    arca.modo = 'aprobar'
    expect(await verificarComprobante(empresa, U, id, crear)).toMatchObject({ ok: true, numero: 44 })
    expect(await emitirComprobante(empresa, U, otro, crear, HOY)).toMatchObject({ ok: true, numero: 45 })
  })

  it('si ARCA nunca lo recibió, al verificar vuelve a borrador', async () => {
    arca.modo = 'incierto'
    const id = await guardar(factura(inscripto))
    expect(await emitirComprobante(empresa, U, id, crear, HOY)).toMatchObject({ ok: false, pendiente: true })
    expect(await verificarComprobante(empresa, U, id, crear)).toMatchObject({
      ok: false,
      error: expect.stringContaining('no llegó'),
    })
    expect((await en((tx) => obtenerComprobante(tx, id)))?.estado).toBe('borrador')
    await en((tx) => eliminarBorrador(tx, U, id))
    arca.modo = 'aprobar'
  })

  it('controla fecha, CUIT de los A y la identificación del consumidor final', async () => {
    const vieja = await guardar(factura(inscripto, { fecha: '2026-09-20' }))
    expect(await emitirComprobante(empresa, U, vieja, crear, HOY)).toMatchObject({
      ok: false,
      error: expect.stringContaining('5 días'),
    })
    const a = await guardar(factura(sinCuit))
    expect(await emitirComprobante(empresa, U, a, crear, HOY)).toMatchObject({
      ok: false,
      error: expect.stringContaining('CUIT'),
    })
    const grande = await guardar(factura(consumidor, { items: [item('9000000')] }))
    expect(await emitirComprobante(empresa, U, grande, crear, HOY)).toMatchObject({
      ok: false,
      error: expect.stringContaining('identificar'),
    })
    for (const id of [vieja, a, grande]) await en((tx) => eliminarBorrador(tx, U, id))
  })
})

describe('cuenta corriente, notas de crédito y cobranzas', () => {
  let fa: string

  it('una nota de crédito A se asocia a la factura y cancela su deuda', async () => {
    fa = await guardar(factura(inscripto, { items: [item('2000')] }))
    await emitirComprobante(empresa, U, fa, crear, HOY)
    const nc = await guardar(factura(inscripto, { clase: 'nota_credito', asociadoId: fa, items: [item('500')] }))
    const r = await emitirComprobante(empresa, U, nc, crear, HOY)
    expect(r).toMatchObject({ ok: true, numero: 1 })
    expect(arca.pedidos.at(-1)?.asociados).toEqual([{ tipo: 1, puntoVenta: 5, numero: 46, cuit: '30715974823', fecha: HOY }])
    const cc = await en((tx) => cuentaCorriente(tx, inscripto))
    // 2.000 + IVA 420 + percepción 70 = 2.490; la NC: 500 + 105 + 17,50 = 622,50.
    expect(cc.pendientes.find((p) => p.id === fa)?.saldo).toBe('1867.50')
  })

  it('un recibo cobra con varios valores, imputa a la factura y lo que sobra queda a cuenta', async () => {
    const antes = await en((tx) => cuentaCorriente(tx, inscripto))
    const r = await en((tx) =>
      emitirRecibo(tx, U, {
        terceroId: inscripto,
        fecha: HOY,
        valores: [
          { medio: 'transferencia', importe: '1500' },
          { medio: 'echeq', importe: '500', banco: 'Nación', numeroValor: '123', fechaPago: '2026-11-01' },
          { medio: 'retencion_iibb', importe: '20' },
        ],
        imputaciones: [{ comprobanteId: fa, importe: '1867.50' }],
      }),
    )
    expect(r).toMatchObject({ ok: true, numero: 1 })
    const cc = await en((tx) => cuentaCorriente(tx, inscripto))
    expect(cc.pendientes.find((p) => p.id === fa)).toBeUndefined()
    expect(Number(cc.saldo)).toBeCloseTo(Number(antes.saldo) - 2020, 2)
    expect(cc.aCuenta).toBe('152.50')
  })

  it('no deja imputar más que la deuda ni cheques sin datos, y revierte el recibo entero', async () => {
    const otra = await guardar(factura(inscripto))
    await emitirComprobante(empresa, U, otra, crear, HOY)
    await expect(
      en((tx) =>
        emitirRecibo(tx, U, {
          terceroId: inscripto,
          fecha: HOY,
          valores: [{ medio: 'efectivo', importe: '99999' }],
          imputaciones: [{ comprobanteId: otra, importe: '99999' }],
        }),
      ),
    ).rejects.toThrow(ReciboInvalido)
    const sinDatos = await en((tx) =>
      emitirRecibo(tx, U, { terceroId: inscripto, fecha: HOY, valores: [{ medio: 'cheque', importe: '10' }] }),
    )
    expect(sinDatos).toMatchObject({ ok: false, error: expect.stringContaining('banco') })
    // El número 2 no se perdió: el recibo revertido no lo consumió.
    const ok = await en((tx) =>
      emitirRecibo(tx, U, { terceroId: inscripto, fecha: HOY, valores: [{ medio: 'efectivo', importe: '100' }] }),
    )
    expect(ok).toMatchObject({ ok: true, numero: 2 })
    // Imputar lo que estaba a cuenta del recibo 2 contra la factura nueva.
    const r = await en((tx) =>
      imputar(tx, U, { reciboId: (ok as { id: string }).id }, [{ comprobanteId: otra, importe: '150' }], HOY),
    )
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('disponibles $ 100.00') })
  })

  it('al anular un recibo la deuda vuelve', async () => {
    const [primero] = await en((tx) => tx.execute(sql`select id from recibos where numero = 1`)).then((x) =>
      Array.isArray(x) ? x : (x as { rows: { id: string }[] }).rows,
    )
    await en((tx) => anularRecibo(tx, U, (primero as { id: string }).id))
    const cc = await en((tx) => cuentaCorriente(tx, inscripto))
    expect(cc.pendientes.find((p) => p.id === fa)?.saldo).toBe('1867.50')
  })
})
