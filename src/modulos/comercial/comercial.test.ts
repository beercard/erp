import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { articulos, depositos, empresas, listasPrecios, precios, puntosVenta, terceros } from '../../db/schema'
import { normalizarNumero } from '../../lib/dinero'
import { cotizacionVigente, fijarCotizacion } from './cotizacion'
import {
  articulosParaDocumento,
  cambiarEstadoPresupuesto,
  cancelarPedido,
  convertirEnPedido,
  guardarPedido,
  guardarPresupuesto,
  obtenerPedido,
} from './documentos'
import { siguienteNumero } from './numeracion'
import { anularRemito, emitirRemito } from './remitos'
import { ajustarStock, saldoDe, transferirStock } from './stock'

const U = '00000000-0000-4000-8000-000000000001'
let empresa: string
let cliente: string
let otroCliente: string
let toner: string
let servicio: string
let central: string
let salon: string
let lista: string

const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

beforeAll(async () => {
  const db = await baseDePrueba()
  const [e] = await db
    .insert(empresas)
    .values({ razonSocial: 'Comercial S.A.', cuit: '30111111118', condicionIva: 1 })
    .returning()
  empresa = e.id
  await en(async (tx) => {
    ;[cliente, otroCliente] = (
      await tx
        .insert(terceros)
        .values([
          { codigo: '1', razonSocial: 'Cliente Uno', tipoDocumento: 99, condicionIva: 5 },
          { codigo: '2', razonSocial: 'Cliente Dos', tipoDocumento: 99, condicionIva: 5 },
        ])
        .returning()
    ).map((x) => x.id)
    ;[toner, servicio] = (
      await tx
        .insert(articulos)
        .values([
          { codigo: 'TN', nombre: 'Tóner', alicuotaIva: 5 },
          { codigo: 'SV', nombre: 'Visita', alicuotaIva: 5, tipo: 'servicio', llevaStock: false },
        ])
        .returning()
    ).map((x) => x.id)
    ;[central, salon] = (
      await tx
        .insert(depositos)
        .values([
          { codigo: '001', nombre: 'Central' },
          { codigo: '002', nombre: 'Salón' },
        ])
        .returning()
    ).map((x) => x.id)
    await tx.insert(puntosVenta).values({ numero: 6, nombre: 'Remitos', tipo: 'remitos' })
    lista = (await tx.insert(listasPrecios).values({ codigo: '001', nombre: 'General', moneda: 'DOL' }).returning())[0].id
    await tx.insert(precios).values({ listaId: lista, articuloId: toner, precio: '50', vigenteDesde: '2020-01-01' })
  })
})

const documento = (extra: Record<string, unknown> = {}) => ({
  terceroId: cliente,
  fecha: '2026-10-01',
  moneda: 'PES',
  cotizacion: '1',
  listaPreciosId: lista,
  items: [
    { articuloId: toner, descripcion: 'Tóner', cantidad: '10', precioUnitario: '1000', alicuotaIva: 5 },
    { articuloId: servicio, descripcion: 'Visita', cantidad: '1', precioUnitario: '500', descuento: '10', alicuotaIva: 5 },
  ],
  ...extra,
})

describe('números', () => {
  it('lee números en formato argentino y en formato de máquina sin romper los decimales', () => {
    expect(normalizarNumero('1.234,56')).toBe('1234.56')
    expect(normalizarNumero('30.5')).toBe('30.5')
    expect(normalizarNumero('1234.5000')).toBe('1234.5000')
    expect(normalizarNumero(' 12,5 ')).toBe('12.5')
  })

  it('la numeración es correlativa por tipo y punto de venta', async () => {
    const a = await en((tx) => siguienteNumero(tx, 'prueba', 1))
    const b = await en((tx) => siguienteNumero(tx, 'prueba', 1))
    const otroPv = await en((tx) => siguienteNumero(tx, 'prueba', 2))
    expect([a, b, otroPv]).toEqual([1, 2, 1])
  })

  it('un número usado en una transacción que falla no se pierde', async () => {
    await expect(
      en(async (tx) => {
        await siguienteNumero(tx, 'perdible')
        throw new Error('falla la emisión')
      }),
    ).rejects.toThrow()
    expect(await en((tx) => siguienteNumero(tx, 'perdible'))).toBe(1)
  })
})

describe('presupuestos y pedidos', () => {
  it('calcula totales, valida renglones y numera', async () => {
    const malo = await en((tx) =>
      guardarPresupuesto(tx, U, documento({ items: [{ descripcion: 'x', cantidad: '0', precioUnitario: '1', alicuotaIva: 5 }] })),
    )
    expect(malo).toMatchObject({ ok: false, error: expect.stringContaining('Renglón 1') })
    const r = await en((tx) => guardarPresupuesto(tx, U, documento()))
    expect(r).toMatchObject({ ok: true, numero: 1 })
  })

  it('un presupuesto aceptado se convierte en pedido una sola vez y ya no se modifica', async () => {
    const pres = await en((tx) => guardarPresupuesto(tx, U, documento()))
    if (!pres.ok) throw new Error(pres.error)
    const ped = await en((tx) => convertirEnPedido(tx, U, pres.id, central))
    if (!ped.ok) throw new Error(ped.error)
    const pedido = await en((tx) => obtenerPedido(tx, ped.id))
    // 10 × 1.000 + 500 − 10 % = 10.450 neto; IVA 21 % = 2.194,50; total 12.644,50.
    expect([pedido?.neto, pedido?.iva, pedido?.total, pedido?.items.length]).toEqual(['10450.00', '2194.50', '12644.50', 2])
    expect(await en((tx) => convertirEnPedido(tx, U, pres.id))).toMatchObject({ ok: false })
    expect(await en((tx) => guardarPresupuesto(tx, U, documento(), pres.id))).toMatchObject({ ok: false })
    expect(await en((tx) => cambiarEstadoPresupuesto(tx, U, pres.id, 'borrador'))).toMatchObject({ ok: false })
  })
})

describe('remitos y stock', () => {
  it('entrega parcial y total: descuenta stock, actualiza el pedido y no deja entregar de más', async () => {
    await en((tx) => ajustarStock(tx, U, { articuloId: toner, depositoId: central, cantidad: '6', motivo: 'Inventario inicial' }))
    const ped = await en((tx) => guardarPedido(tx, U, { ...documento(), depositoId: central }))
    if (!ped.ok) throw new Error(ped.error)
    const pedido = (await en((tx) => obtenerPedido(tx, ped.id)))!
    const itemToner = pedido.items.find((i) => i.articuloId === toner)!
    const itemServicio = pedido.items.find((i) => i.articuloId === servicio)!
    const remito = (cant: string, item = itemToner, articulo = toner) => ({
      puntoVenta: 6,
      terceroId: cliente,
      depositoId: central,
      pedidoId: ped.id,
      fecha: '2026-10-01',
      items: [{ articuloId: articulo, descripcion: item.descripcion, cantidad: cant, pedidoItemId: item.id }],
    })

    const primero = await en((tx) => emitirRemito(tx, U, remito('4')))
    expect(primero).toMatchObject({ ok: true, numero: 1, avisos: [] })
    expect(await en((tx) => saldoDe(tx, toner, central))).toBe('2.0000')
    expect((await en((tx) => obtenerPedido(tx, ped.id)))?.estado).toBe('parcial')

    expect(await en((tx) => emitirRemito(tx, U, remito('7')))).toMatchObject({
      ok: false,
      error: expect.stringContaining('quedan 6'),
    })
    expect(await en((tx) => emitirRemito(tx, U, { ...remito('1'), terceroId: otroCliente }))).toMatchObject({ ok: false })

    // Sale más de lo que hay: se permite, con aviso de stock negativo.
    const segundo = await en((tx) => emitirRemito(tx, U, remito('6')))
    expect(segundo).toMatchObject({ ok: true, numero: 2 })
    if (segundo.ok) expect(segundo.avisos[0]).toContain('stock negativo')
    // El servicio no mueve stock.
    await en((tx) => emitirRemito(tx, U, remito('1', itemServicio, servicio)))
    expect((await en((tx) => obtenerPedido(tx, ped.id)))?.estado).toBe('entregado')
    expect(await en((tx) => saldoDe(tx, toner, central))).toBe('-4.0000')

    // Anular el segundo remito devuelve el stock y lo pendiente.
    if (!segundo.ok) return
    expect((await en((tx) => anularRemito(tx, U, segundo.id))).ok).toBe(true)
    expect(await en((tx) => saldoDe(tx, toner, central))).toBe('2.0000')
    expect((await en((tx) => obtenerPedido(tx, ped.id)))?.estado).toBe('parcial')
    expect(await en((tx) => anularRemito(tx, U, segundo.id))).toMatchObject({ ok: false })
  })

  it('transferencias entre depósitos y cancelación de pedido', async () => {
    await en((tx) => transferirStock(tx, U, { articuloId: toner, desde: central, hacia: salon, cantidad: '2' }))
    expect([await en((tx) => saldoDe(tx, toner, central)), await en((tx) => saldoDe(tx, toner, salon))]).toEqual([
      '0.0000',
      '2.0000',
    ])
    expect(
      await en((tx) => transferirStock(tx, U, { articuloId: toner, desde: central, hacia: central, cantidad: '1' })),
    ).toMatchObject({ ok: false })
    const ped = await en((tx) => guardarPedido(tx, U, documento()))
    if (!ped.ok) throw new Error(ped.error)
    expect((await en((tx) => cancelarPedido(tx, U, ped.id))).ok).toBe(true)
    expect(await en((tx) => cancelarPedido(tx, U, ped.id))).toMatchObject({ ok: false })
  })
})

describe('cotización y precios para el documento', () => {
  it('toma la cotización cargada más reciente y convierte el precio de la lista a la moneda del documento', async () => {
    expect(await en((tx) => cotizacionVigente(tx, 'DOL', '2026-10-01'))).toBeNull()
    await en((tx) => fijarCotizacion(tx, U, { moneda: 'DOL', fecha: '2026-09-30', valor: '1.545,50' }))
    expect(await en((tx) => cotizacionVigente(tx, 'DOL', '2026-10-01'))).toMatchObject({
      valor: '1545.500000',
      fuente: 'empresa',
    })
    const [art] = await en((tx) => articulosParaDocumento(tx, 'tóner', { listaId: lista, moneda: 'PES', cotizacion: '1545.5' }))
    // 50 USD × 1.545,50 = 77.275 pesos
    expect([art.precio, art.stock]).toEqual(['77275.0000', 2])
  })
})
