import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { comprobantes, condicionesPago, correos, empresas, puntosVenta, recordatoriosDeuda, terceros } from '../../db/schema'
import type { ClienteArca } from '../arca/cliente'
import {
  calcularIntereses,
  deudaPendiente,
  etapaDe,
  estadoDeuda,
  generarNotasDeInteres,
  guardarConfiguracionCobranza,
  pdfEstadoDeuda,
  recordatoriosDelDia,
} from './cobranza'
import { emitirComprobante, guardarComprobante } from './comprobantes'

process.env.ERP_CLAVE_MAESTRA ??= 'clave-maestra-solo-para-pruebas-000000000000'
const U = '00000000-0000-4000-8000-000000000001'
let n = 0
const arca: ClienteArca = {
  ambiente: 'homologacion',
  ultimoAutorizado: async () => n,
  solicitarCae: async () => {
    n++
    return { resultado: 'A', cae: '76400000000001', caeVence: '2026-12-31', observaciones: [], errores: [] }
  },
  consultar: async () => null,
}

describe('Cobranza automática', () => {
  let empresa: string
  let cliente: string
  let factura: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)
  const config = (extra: Record<string, unknown> = {}) =>
    en((tx) =>
      guardarConfiguracionCobranza(tx, U, {
        recordatorios: true,
        diasAntes: 3,
        etapas: [1, 7, 15],
        porCorreo: true,
        porWhatsapp: false,
        tasaMensual: '3',
        diasGracia: 0,
        minimoInteres: '0',
        ...extra,
      }),
    )

  beforeAll(async () => {
    const db = await baseDePrueba()
    ;[{ id: empresa }] = await db
      .insert(empresas)
      .values({ razonSocial: 'Cobra S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    await en(async (tx) => {
      await tx.insert(puntosVenta).values({ numero: 2, nombre: 'ERP', tipo: 'electronico' })
      const [cp] = await tx.insert(condicionesPago).values({ nombre: '30 días', dias: 30 }).returning()
      ;[{ id: cliente }] = await tx
        .insert(terceros)
        .values({
          codigo: 'C1',
          razonSocial: 'Moroso S.A.',
          tipoDocumento: 80,
          numeroDocumento: '30999176522',
          condicionIva: 1,
          email: 'pagos@moroso.com',
          condicionPagoId: cp.id,
        })
        .returning()
      const r = await guardarComprobante(tx, U, {
        clase: 'factura',
        puntoVenta: 2,
        terceroId: cliente,
        fecha: '2026-09-01',
        moneda: 'PES',
        cotizacion: '1',
        condicionPagoId: cp.id,
        items: [{ descripcion: 'Servicio', cantidad: '1', precioUnitario: '10000', alicuotaIva: 3 }],
      })
      if (!r.ok) throw new Error(r.error)
      factura = r.id
    })
    const e = await emitirComprobante(empresa, U, factura, async () => arca, '2026-09-01')
    if (!e.ok) throw new Error(e.error)
  })

  it('el vencimiento sale de la condición de pago y el estado de deuda separa vencido y a vencer', async () => {
    const [d] = await en((tx) => deudaPendiente(tx, '2026-10-05'))
    expect(d).toMatchObject({ vence: '2026-10-01', saldo: '10000.00', diasVencido: 4 })
    const e = await en((tx) => estadoDeuda(tx, cliente, '2026-10-05'))
    expect(e).toMatchObject({ total: '10000.00', vencido: '10000.00', aVencer: '0.00' })
    expect(Buffer.from(pdfEstadoDeuda(e!)).toString('latin1')).toContain('Estado de cuenta')
  })

  it('etapas: aviso previo, recordatorios y reclamo', () => {
    expect(etapaDe(-5, 3, [1, 7, 15])).toBeNull()
    expect(etapaDe(-2, 3, [1, 7, 15])).toBe(-3)
    expect(etapaDe(0, 3, [1, 7, 15])).toBeNull()
    expect(etapaDe(9, 3, [1, 7, 15])).toBe(7)
    expect(etapaDe(40, 3, [1, 7, 15])).toBe(15)
  })

  it('manda un recordatorio por etapa (con el estado de cuenta) y no repite', async () => {
    await config()
    expect(await recordatoriosDelDia(empresa, '2026-09-29')).toMatchObject({ clientes: 1 }) // aviso previo
    expect(await recordatoriosDelDia(empresa, '2026-09-29')).toMatchObject({ clientes: 0 }) // ya corrió hoy
    expect(await recordatoriosDelDia(empresa, '2026-09-30')).toMatchObject({ clientes: 0 }) // misma etapa
    expect(await recordatoriosDelDia(empresa, '2026-10-02')).toMatchObject({ clientes: 1 }) // vencida hace 1 día
    expect(await recordatoriosDelDia(empresa, '2026-10-20')).toMatchObject({ clientes: 1 }) // 19 días: reclamo
    const r = await en((tx) => tx.select().from(recordatoriosDeuda).where(eq(recordatoriosDeuda.comprobanteId, factura)))
    expect(r.map((x) => x.etapa).sort((a, b) => a - b)).toEqual([-3, 1, 15])
    const c = await en((tx) => tx.select().from(correos))
    expect(c).toHaveLength(3)
    expect(c[2].texto).toContain('Todavía figuran comprobantes vencidos')
  })

  it('intereses por mora: simple por día, a nota de débito en borrador, sin cobrar dos veces el mismo período', async () => {
    // Vencida el 01/10 (IVA 0 %); al 21/10 son 20 días: 10.000 × 3 % / 30 × 20 = 200.
    const { porCliente } = await en((tx) => calcularIntereses(tx, '2026-10-21'))
    expect(porCliente).toHaveLength(1)
    expect(porCliente[0].renglones[0]).toMatchObject({ desde: '2026-10-02', dias: 20, importe: '200.00' })
    const g = await en((tx) => generarNotasDeInteres(tx, U, [cliente], 2, '2026-10-21'))
    expect(g.ok).toBe(true)
    const [nd] = await en((tx) => tx.select().from(comprobantes).where(eq(comprobantes.clase, 'nota_debito')))
    expect(nd).toMatchObject({ estado: 'borrador', neto: '200.00' })
    expect((await en((tx) => calcularIntereses(tx, '2026-10-21'))).porCliente).toHaveLength(0)
    // Diez días después corre de nuevo desde el 22/10.
    const sig = await en((tx) => calcularIntereses(tx, '2026-10-31'))
    expect(sig.porCliente[0].renglones[0]).toMatchObject({ desde: '2026-10-22', dias: 10, importe: '100.00' })
  })
})
