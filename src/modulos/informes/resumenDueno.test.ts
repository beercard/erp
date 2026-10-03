import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { correos, empresas, puntosVenta, resumenDueno, terceros } from '../../db/schema'
import type { ClienteArca } from '../arca/cliente'
import { emitirComprobante, guardarComprobante } from '../facturacion/comprobantes'
import { datosResumen, enviarResumenDueno, guardarConfiguracionResumen, textoResumen, tocaHoy } from './resumenDueno'

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

describe('Resumen para el dueño', () => {
  let empresa: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    ;[{ id: empresa }] = await db
      .insert(empresas)
      .values({ razonSocial: 'Dueño S.A.', nombreFantasia: 'La Tienda', cuit: '30715974823', condicionIva: 1 })
      .returning()
    const id = await en(async (tx) => {
      await tx.insert(puntosVenta).values({ numero: 2, nombre: 'ERP', tipo: 'electronico' })
      const [c] = await tx
        .insert(terceros)
        .values({
          codigo: 'C1',
          razonSocial: 'Cliente Lento',
          tipoDocumento: 80,
          numeroDocumento: '30999176522',
          condicionIva: 1,
        })
        .returning()
      const r = await guardarComprobante(tx, U, {
        clase: 'factura',
        puntoVenta: 2,
        terceroId: c.id,
        fecha: '2026-09-01',
        vencimiento: '2026-09-10',
        moneda: 'PES',
        cotizacion: '1',
        items: [{ descripcion: 'Servicio', cantidad: '1', precioUnitario: '10000', alicuotaIva: 3 }],
      })
      if (!r.ok) throw new Error(r.error)
      return r.id
    })
    const e = await emitirComprobante(empresa, U, id, async () => arca, '2026-09-01')
    if (!e.ok) throw new Error(e.error)
  })

  it('cuándo toca: diario todos los días, semanal el día elegido, nunca dos veces', () => {
    // 5/10/2026 es lunes.
    expect(tocaHoy({ frecuencia: 'diario', diaSemana: 1, ultimoEnvio: null }, '2026-10-06')).toBe(true)
    expect(tocaHoy({ frecuencia: 'diario', diaSemana: 1, ultimoEnvio: '2026-10-06' }, '2026-10-06')).toBe(false)
    expect(tocaHoy({ frecuencia: 'semanal', diaSemana: 1, ultimoEnvio: null }, '2026-10-05')).toBe(true)
    expect(tocaHoy({ frecuencia: 'semanal', diaSemana: 1, ultimoEnvio: null }, '2026-10-06')).toBe(false)
    expect(tocaHoy({ frecuencia: 'no', diaSemana: 1, ultimoEnvio: null }, '2026-10-05')).toBe(false)
  })

  it('junta ventas, deuda vencida y alertas', async () => {
    const d = await en((tx) => datosResumen(tx, '2026-09-01', '2026-09-30'))
    expect(d).toMatchObject({ ventas: { facturas: 1, neto: 10000 }, deudaVencida: '10000.00', deudores: 1, cobrado: '0.00' })
    const t = textoResumen('La Tienda', d, true)
    expect(t).toContain('semana del 01/09/2026 al 30/09/2026')
    expect(t).toContain('Deuda vencida de clientes: $ 10.000 (1 cliente(s))')
    expect(t).toContain('Cliente Lento')
  })

  it('valida la configuración y manda el correo una vez por día', async () => {
    expect(await en((tx) => guardarConfiguracionResumen(tx, empresa, { frecuencia: 'diario' }))).toMatchObject({ ok: false })
    expect(
      await en((tx) => guardarConfiguracionResumen(tx, empresa, { frecuencia: 'diario', correos: 'no-es-correo' })),
    ).toMatchObject({ ok: false })
    expect(
      await en((tx) => guardarConfiguracionResumen(tx, empresa, { frecuencia: 'diario', correos: 'duena@tienda.com' })),
    ).toEqual({ ok: true })
    expect(await enviarResumenDueno(empresa, { hoy: '2026-10-06' })).toEqual({ enviados: 1, errores: [] })
    expect(await enviarResumenDueno(empresa, { hoy: '2026-10-06' })).toEqual({ enviados: 0, errores: [] })
    const [c] = await en((tx) => tx.select().from(correos))
    expect(c).toMatchObject({ para: 'duena@tienda.com', asunto: 'Resumen del día de La Tienda' })
    const [cfg] = await en((tx) => tx.select().from(resumenDueno))
    expect(cfg.ultimoEnvio).toBe('2026-10-06')
  })
})
