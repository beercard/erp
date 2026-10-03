import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { compras, comprasTributos, empresas, facturasRecibidas, terceros } from '../../db/schema'
import type { Fetch } from '../ia/claude'
import { controlar, guardarRecibida, procesarRecibida, registrarRecibida, tipoDeArchivo, type Lectura } from './recibidas'

process.env.ANTHROPIC_API_KEY ??= 'clave-de-prueba'
process.env.IA_MODELO ??= 'modelo-de-prueba'

const U = '00000000-0000-4000-8000-000000000001'
const CUIT_EMPRESA = '30715974823'

const lectura: Lectura = {
  esComprobante: true,
  letra: 'A',
  clase: 'factura',
  fce: false,
  puntoVenta: 3,
  numero: 1520,
  fecha: '2026-09-28',
  cae: '76123456789012',
  cuitEmisor: '30711222339',
  razonSocialEmisor: 'Insumos del Sur S.A.',
  cuitReceptor: CUIT_EMPRESA,
  moneda: 'PES',
  cotizacion: null,
  iva: [{ alicuota: 21, base: 10000, importe: 2100 }],
  noGravado: 0,
  exento: 0,
  tributos: [{ tipo: 'percepcion_iibb', provincia: 'Buenos Aires', importe: 300 }],
  total: 12400,
  observaciones: null,
}

/** IA de mentira: contesta la herramienta con lo que se le diga y anota lo que recibió. */
function iaFalsa(datos: unknown) {
  const pedidos: Record<string, unknown>[] = []
  const f = (async (_u: string | URL | Request, init: RequestInit = {}) => {
    pedidos.push(JSON.parse(String(init.body)))
    return new Response(
      JSON.stringify({
        content: [{ type: 'tool_use', id: 't1', name: 'registrar_comprobante', input: datos }],
        stop_reason: 'tool_use',
      }),
      { status: 200 },
    )
  }) as Fetch
  return { f, pedidos }
}

describe('Facturas recibidas por WhatsApp', () => {
  let empresa: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Compras S.A.', cuit: CUIT_EMPRESA, condicionIva: 1 }).returning()
    empresa = e.id
  })

  it('reconoce el tipo real del archivo', () => {
    expect(tipoDeArchivo(Buffer.from('%PDF-1.7 ...'))).toBe('application/pdf')
    expect(tipoDeArchivo(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(tipoDeArchivo(Buffer.from('<html>'))).toBeNull()
  })

  it('controla CUIT, receptor, fecha e importes', () => {
    expect(controlar(lectura, CUIT_EMPRESA, '2026-10-03')).toEqual([])
    const mal = controlar(
      { ...lectura, cuitEmisor: '30711222331', cuitReceptor: '20111111112', fecha: '2026-12-01', total: 99999 },
      CUIT_EMPRESA,
      '2026-10-03',
    )
    expect(mal.join(' ')).toMatch(/no es válido.*otro CUIT.*posterior a hoy.*no cierran/)
  })

  it('lee con IA, deja la factura para revisar y al confirmarla crea el proveedor y la compra', async () => {
    const id = await en((tx) =>
      guardarRecibida(tx, { usuarioId: U, archivo: Buffer.from('%PDF-1.7 factura'), tipo: 'application/pdf', nombre: 'f.pdf' }),
    )
    const ia = iaFalsa(lectura)
    const r = await procesarRecibida(empresa, id, CUIT_EMPRESA, ia.f)
    expect(r).toMatchObject({ avisos: [], proveedorId: null })
    // El PDF va como documento y se obliga a usar la herramienta.
    const pedido = ia.pedidos[0] as { model: string; tool_choice: { name: string }; messages: { content: { type: string }[] }[] }
    expect(pedido.model).toBe('modelo-de-prueba')
    expect(pedido.tool_choice.name).toBe('registrar_comprobante')
    expect(pedido.messages[0].content[0].type).toBe('document')
    const [fila] = await en((tx) => tx.select().from(facturasRecibidas).where(eq(facturasRecibidas.id, id)))
    expect(fila.estado).toBe('lista')

    const reg = await en((tx) => registrarRecibida(tx, U, id, lectura))
    if (!reg.ok) throw new Error(reg.error)
    const [c] = await en((tx) => tx.select().from(compras).where(eq(compras.id, reg.id)))
    expect(c).toMatchObject({ tipo: 1, puntoVenta: 3, numero: 1520, total: '12400.00' })
    const [p] = await en((tx) => tx.select().from(terceros).where(eq(terceros.id, c.terceroId)))
    expect(p).toMatchObject({
      razonSocial: 'Insumos del Sur S.A.',
      numeroDocumento: '30711222339',
      esProveedor: true,
      condicionIva: 1,
    })
    const [t] = await en((tx) => tx.select().from(comprasTributos).where(eq(comprasTributos.compraId, c.id)))
    expect(t).toMatchObject({ tipo: 'percepcion_iibb', provincia: 'B', importe: '300.00' })
    // No se registra dos veces.
    expect((await en((tx) => registrarRecibida(tx, U, id, lectura))).ok).toBe(false)
  })

  it('si la IA falla queda con error y se puede completar a mano', async () => {
    const id = await en((tx) =>
      guardarRecibida(tx, { usuarioId: U, archivo: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), tipo: 'image/jpeg' }),
    )
    const f = (async () => new Response('{"error":{"message":"caído"}}', { status: 500 })) as Fetch
    expect(await procesarRecibida(empresa, id, CUIT_EMPRESA, f)).toBeNull()
    const [fila] = await en((tx) => tx.select().from(facturasRecibidas).where(eq(facturasRecibidas.id, id)))
    expect(fila.estado).toBe('error')
    const reg = await en((tx) => registrarRecibida(tx, U, id, { ...lectura, numero: 1521 }))
    expect(reg.ok).toBe(true)
  })
})
