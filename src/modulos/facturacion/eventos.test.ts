import { asc } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, puntosVenta, terceros, webhookEntregas, webhooks } from '../../db/schema'
import type { ClienteArca } from '../arca/cliente'
import type { SolicitudCae } from '../arca/wsfe'
import { emitirComprobante, guardarComprobante } from './comprobantes'
import { anularRecibo, emitirRecibo } from './cuentas'

const U = '00000000-0000-4000-8000-000000000001'
const HOY = '2026-10-01'
let empresa: string
let cliente: string

const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

/** ARCA que aprueba todo, numerando desde 1. */
const arca: ClienteArca = {
  ambiente: 'homologacion',
  ultimoAutorizado: async () => 0,
  solicitarCae: async (s: SolicitudCae) => ({
    resultado: 'A',
    cae: `7640000000000${s.numero}`,
    caeVence: '2026-10-11',
    observaciones: [],
    errores: [],
  }),
  consultar: async () => null,
}

const entregas = () =>
  en((tx) =>
    tx
      .select({ evento: webhookEntregas.evento, datos: webhookEntregas.datos })
      .from(webhookEntregas)
      .orderBy(asc(webhookEntregas.creado)),
  )

beforeAll(async () => {
  const db = await baseDePrueba()
  const [e] = await db.insert(empresas).values({ razonSocial: 'Emisora S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
  empresa = e.id
  await en(async (tx) => {
    await tx.insert(puntosVenta).values({ numero: 5, nombre: 'ERP', tipo: 'electronico' })
    const [c] = await tx
      .insert(terceros)
      .values({ codigo: 'RI', razonSocial: 'Inscripto S.A.', tipoDocumento: 80, numeroDocumento: '30999176522', condicionIva: 1 })
      .returning()
    cliente = c.id
    await tx.insert(webhooks).values({
      url: 'https://ejemplo.com/avisos',
      secreto: 'x',
      eventos: ['comprobante.autorizado', 'comprobante.saldado', 'cobranza.registrada', 'cobranza.anulada'],
    })
  })
})

describe('webhooks de facturación', () => {
  it('avisa la factura autorizada, la cobranza, la factura saldada y la anulación del recibo', async () => {
    const g = await en((tx) =>
      guardarComprobante(tx, U, {
        clase: 'factura',
        puntoVenta: 5,
        terceroId: cliente,
        fecha: HOY,
        moneda: 'PES',
        cotizacion: '1',
        items: [{ descripcion: 'Tóner', cantidad: '1', precioUnitario: '1000', alicuotaIva: 5 }],
      }),
    )
    if (!g.ok) throw new Error(g.error)
    expect(await emitirComprobante(empresa, U, g.id, async () => arca, HOY)).toMatchObject({ ok: true })

    // Un pago parcial no salda la factura; el segundo, sí.
    for (const importe of ['200', '1010']) {
      const r = await en((tx) =>
        emitirRecibo(tx, U, {
          terceroId: cliente,
          fecha: HOY,
          valores: [{ medio: 'efectivo', importe }],
          imputaciones: [{ comprobanteId: g.id, importe }],
        }),
      )
      expect(r).toMatchObject({ ok: true })
    }
    const segundo = (await entregas()).map((e) => e.datos as { id: string; total?: string }).find((d) => d.total === '1010.00')!
    await en((tx) => anularRecibo(tx, U, segundo.id))

    // Los eventos de una misma transacción comparten la hora: se comparan por tipo.
    const todas = await entregas()
    expect(todas.map((e) => e.evento).sort()).toEqual([
      'cobranza.anulada',
      'cobranza.registrada',
      'cobranza.registrada',
      'comprobante.autorizado',
      'comprobante.saldado',
    ])
    const de = (evento: string) => todas.filter((e) => e.evento === evento).map((e) => e.datos)
    expect(de('comprobante.autorizado')[0]).toMatchObject({
      id: g.id,
      abreviatura: 'FA',
      numero: 1,
      total: '1210.00',
      cae: '76400000000001',
      cliente: { razonSocial: 'Inscripto S.A.', numeroDocumento: '30999176522' },
    })
    expect(de('comprobante.saldado')[0]).toMatchObject({ id: g.id, canceladoCon: { recibo: segundo.id } })
    expect(de('cobranza.registrada')).toContainEqual(
      expect.objectContaining({
        total: '1010.00',
        valores: [{ medio: 'efectivo', importe: '1010.00' }],
        imputaciones: [{ comprobanteId: g.id, importe: '1010.00' }],
      }),
    )
    expect(de('cobranza.anulada')[0]).toMatchObject({ id: segundo.id, estado: 'anulado' })
  })
})
