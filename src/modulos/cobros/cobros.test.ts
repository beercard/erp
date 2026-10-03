import { createHmac } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { comprobantes, cuentasTesoreria, empresas, pagosOnline, recibos, recibosValores, terceros } from '../../db/schema'
import { pendientes } from '../facturacion/cuentas'
import {
  buscarClave,
  cancelarPago,
  crearPago,
  guardarPasarela,
  iniciarPago,
  listarPasarelas,
  revisarPendientes,
  verificarPago,
  verPago,
} from './cobros'
import { firmaClover, firmaMercadoPago, type Fetch } from './pasarelas'

process.env.ERP_CLAVE_MAESTRA ??= 'clave-maestra-de-prueba-de-32-caracteres-o-mas'

/** Mercado Pago de mentira: crea preferencias y contesta los pagos que se le digan. */
function mercadoPagoFalso() {
  const estado = { pagos: [] as Record<string, unknown>[], preferencias: [] as Record<string, unknown>[] }
  const f = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = new URL(String(url))
    const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 })
    if (u.pathname === '/checkout/preferences') {
      estado.preferencias.push(JSON.parse(String(init.body)))
      return json({ id: 'pref-1', init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1' })
    }
    if (u.pathname === '/v1/payments/search')
      return json({ results: estado.pagos.filter((p) => p.external_reference === u.searchParams.get('external_reference')) })
    const m = u.pathname.match(/^\/v1\/payments\/(\d+)$/)
    if (m) return json(estado.pagos.find((p) => String(p.id) === m[1]) ?? {})
    return new Response('{}', { status: 404 })
  }) as Fetch
  return { f, estado }
}

describe('Cobros online', () => {
  let empresa: string
  let cliente: string
  let cuenta: string
  let factura: string
  const U = '00000000-0000-4000-8000-000000000001'
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Cobros S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
    empresa = e.id
    ;[{ id: cuenta }] = await en((tx) =>
      tx.insert(cuentasTesoreria).values({ codigo: 'MP', nombre: 'Mercado Pago', tipo: 'billetera' }).returning(),
    )
    ;[{ id: cliente }] = await en((tx) =>
      tx
        .insert(terceros)
        .values({
          codigo: 'C1',
          razonSocial: 'Cliente S.A.',
          tipoDocumento: 80,
          numeroDocumento: '30999176522',
          condicionIva: 1,
          email: 'pagos@cliente.com',
        })
        .returning(),
    )
    ;[{ id: factura }] = await en((tx) =>
      tx
        .insert(comprobantes)
        .values({
          clase: 'factura',
          letra: 'A',
          tipo: 1,
          puntoVenta: 1,
          numero: 7,
          fecha: '2026-10-01',
          estado: 'autorizado',
          cae: '76000000000001',
          terceroId: cliente,
          neto: '1000',
          iva: '210',
          total: '1210',
        })
        .returning(),
    )
  })

  it('guarda la pasarela sin mostrar los secretos y valida lo que falta', async () => {
    expect((await en((tx) => guardarPasarela(tx, U, 'mercadopago', {}))).ok).toBe(false)
    expect((await en((tx) => guardarPasarela(tx, U, 'clover', { comercio: 'M1', token: 'tok' }))).ok).toBe(false)
    const r = await en((tx) =>
      guardarPasarela(tx, U, 'mercadopago', { acceso: 'APP_USR-123', secreto: 'sec', medio: 'mercado_pago', cuentaId: cuenta }),
    )
    expect(r.ok).toBe(true)
    // Al editar sin escribir el token, queda el que estaba.
    expect(
      (await en((tx) => guardarPasarela(tx, U, 'mercadopago', { acceso: '', medio: 'mercado_pago', cuentaId: cuenta }))).ok,
    ).toBe(true)
    const [p] = await en((tx) => listarPasarelas(tx))
    expect(p).toMatchObject({ proveedor: 'mercadopago', visibles: {}, conSecreto: true })
    expect(JSON.stringify(p)).not.toContain('APP_USR')
    expect(p.aviso).toMatch(/\/api\/cobros\/aviso\/[A-Za-z0-9_-]{24}$/)
  })

  it('crea el link por el saldo de la factura, abre Mercado Pago y al aprobarse emite el recibo imputado (una sola vez)', async () => {
    const r = await en((tx) => crearPago(tx, U, { terceroId: cliente, comprobanteIds: [factura] }))
    if (!r.ok) throw new Error(r.error)
    expect(r.importe).toBe('1210.00')
    const vista = await verPago(r.clave)
    expect(vista).toMatchObject({ concepto: 'Factura 00001-00000007', estado: 'pendiente', empresa: 'Cobros S.A.' })
    expect(vista!.opciones.map((o) => o.proveedor)).toEqual(['mercadopago'])

    const mp = mercadoPagoFalso()
    const ini = await iniciarPago(r.clave, 'mercadopago', mp.f)
    expect(ini).toMatchObject({ ok: true, url: expect.stringContaining('pref_id=pref-1') })
    const pref = mp.estado.preferencias[0] as {
      external_reference: string
      notification_url: string
      items: { unit_price: number }[]
    }
    expect(pref.external_reference).toBe(r.id)
    expect(pref.items[0].unit_price).toBe(1210)
    // La dirección de avisos es secreta y distinta del link público.
    expect(pref.notification_url).not.toContain(r.clave)
    const claveAviso = pref.notification_url.split('/').pop()!
    expect(await buscarClave(claveAviso)).toMatchObject({ tipo: 'aviso', id: r.id })

    // Sin pago aprobado: sigue pendiente.
    expect((await verificarPago(empresa, r.id, undefined, mp.f)).estado).toBe('pendiente')
    // Un aviso de un pago de otra referencia no lo aprueba.
    mp.estado.pagos.push({ id: 999, status: 'approved', external_reference: 'otra', transaction_amount: 1210 })
    expect((await verificarPago(empresa, r.id, { pagoId: '999' }, mp.f)).estado).toBe('pendiente')
    mp.estado.pagos.push({ id: 1001, status: 'approved', external_reference: r.id, transaction_amount: 1210 })
    const v = await verificarPago(empresa, r.id, { pagoId: '1001' }, mp.f)
    expect(v.estado).toBe('aprobado')
    const otra = await verificarPago(empresa, r.id, { pagoId: '1001' }, mp.f)
    expect(otra.reciboId).toBe(v.reciboId)
    const recs = await en((tx) => tx.select().from(recibos).where(eq(recibos.terceroId, cliente)))
    expect(recs).toHaveLength(1)
    expect(recs[0]).toMatchObject({ total: '1210.00', usuarioId: null })
    const [valor] = await en((tx) => tx.select().from(recibosValores).where(eq(recibosValores.reciboId, recs[0].id)))
    expect(valor).toMatchObject({ medio: 'mercado_pago', cuentaId: cuenta, detalle: 'Mercado Pago · operación 1001' })
    expect(await en((tx) => pendientes(tx, { terceroId: cliente }))).toEqual([])
    expect((await verPago(r.clave))!.estado).toBe('aprobado')
    // Un link aprobado no se vuelve a abrir.
    expect((await iniciarPago(r.clave, 'mercadopago', mp.f)).ok).toBe(false)
  })

  it('sin deuda no hay link; los importes libres, la cancelación y el vencimiento', async () => {
    expect(await en((tx) => crearPago(tx, U, { terceroId: cliente }))).toEqual({ ok: false, error: 'No hay nada para cobrar.' })
    const r = await en((tx) => crearPago(tx, U, { terceroId: cliente, importe: '1.500,50' }))
    if (!r.ok) throw new Error(r.error)
    expect(r.importe).toBe('1500.50')
    expect((await en((tx) => cancelarPago(tx, U, r.id))).ok).toBe(true)
    expect((await verPago(r.clave))!.estado).toBe('cancelado')
    const v = await en((tx) => crearPago(tx, U, { terceroId: cliente, importe: '100' }))
    if (!v.ok) throw new Error(v.error)
    await en((tx) =>
      tx
        .update(pagosOnline)
        .set({ vence: new Date(Date.now() - 1000) })
        .where(eq(pagosOnline.id, v.id)),
    )
    await revisarPendientes(empresa, mercadoPagoFalso().f)
    expect((await verPago(v.clave))!.estado).toBe('vencido')
  })

  it('verifica las firmas de Mercado Pago y Clover', () => {
    const ts = '1742505638683'
    const v1 = createHmac('sha256', 'sec').update(`id:123;request-id:req-1;ts:${ts};`).digest('hex')
    expect(firmaMercadoPago({ firma: `ts=${ts},v1=${v1}`, requestId: 'req-1', dataId: '123', secreto: 'sec' })).toBe(true)
    expect(firmaMercadoPago({ firma: `ts=${ts},v1=${v1}`, requestId: 'req-1', dataId: '124', secreto: 'sec' })).toBe(false)
    const cuerpo = '{"type":"PAYMENT","status":"APPROVED"}'
    const firma = createHmac('sha256', 'cl').update(`99.${cuerpo}`).digest('hex')
    expect(firmaClover(`t=99,v1=${firma}`, cuerpo, 'cl')).toBe(true)
    expect(firmaClover(`t=98,v1=${firma}`, cuerpo, 'cl')).toBe(false)
  })
})
