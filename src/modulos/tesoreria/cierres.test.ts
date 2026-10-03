import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  arqueos,
  cierresCaja,
  correos,
  cuentasTesoreria,
  empresas,
  recibos,
  terceros,
  turnosCaja,
  usuarios,
} from '../../db/schema'
import { hoyArgentina } from '../../lib/fechas'
import { emitirRecibo } from '../facturacion/cuentas'
import { abrirTurno, cerrarCaja, configurarCaja, inicioTurno, listarCierres, resumenTurno, turnoEnCurso } from './cierres'
import { saldoCuenta } from './cuentas'
import { datosReporte, enviarReporteCierre, pdfCierre, textoCierre } from './reporteCierre'
import { registrarMovimiento } from './movimientos'

describe('Cierre de caja', () => {
  let empresa: string
  let caja: string
  let banco: string
  let cliente: string
  let ana: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Caja S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
    empresa = e.id
    ;[{ id: ana }] = await db.insert(usuarios).values({ email: 'ana@caja.com', nombre: 'Ana Caja', hashClave: 'x' }).returning()
    ;[{ id: caja }, { id: banco }] = await en((tx) =>
      tx
        .insert(cuentasTesoreria)
        .values([
          { codigo: 'CAJA', nombre: 'Caja mostrador', tipo: 'caja' },
          { codigo: 'BCO', nombre: 'Banco', tipo: 'banco' },
        ])
        .returning(),
    )
    ;[{ id: cliente }] = await en((tx) =>
      tx
        .insert(terceros)
        .values({ codigo: 'C1', razonSocial: 'Cliente', tipoDocumento: 80, numeroDocumento: '30999176522', condicionIva: 1 })
        .returning(),
    )
  })

  it('resume el turno: cobranzas por medio y cajero, retiros, efectivo esperado; al cerrar con faltante queda el arqueo', async () => {
    const hoy = hoyArgentina()
    const r = await en((tx) =>
      emitirRecibo(tx, ana, {
        terceroId: cliente,
        fecha: hoy,
        valores: [
          { medio: 'efectivo', importe: '15000', cuentaId: caja },
          { medio: 'transferencia', importe: '5000', cuentaId: banco },
        ],
      }),
    )
    expect(r.ok).toBe(true)
    await en((tx) =>
      registrarMovimiento(tx, ana, {
        cuentaId: caja,
        fecha: hoy,
        sentido: 'egreso',
        importe: '2000',
        concepto: 'Retiro para cambio',
      }),
    )

    const desde = await en((tx) => inicioTurno(tx, caja))
    const res = await en((tx) => resumenTurno(tx, caja, desde))
    expect(res).toMatchObject({
      saldoInicial: '0.00',
      ingresos: '15000.00',
      egresos: '2000.00',
      esperado: '13000.00',
      cobrado: '20000.00',
      recibos: 1,
      promedio: '20000.00',
    })
    expect(res.porMedio.map((m) => [m.nombre, m.total])).toEqual([
      ['Efectivo', '15000.00'],
      ['Transferencia', '5000.00'],
    ])
    expect(res.porCajero).toEqual([{ usuario: 'Ana Caja', total: '20000.00', recibos: 1 }])
    expect(res.otrosMovimientos.map((m) => m.importe)).toEqual(['-2000.00'])

    // Una cuenta que no es caja no se cierra.
    expect((await en((tx) => cerrarCaja(tx, ana, { cuentaId: banco, contado: '0' }))).ok).toBe(false)
    const c = await en((tx) =>
      cerrarCaja(tx, ana, {
        cuentaId: caja,
        contado: '12900',
        conteo: { '10000': 1, '1000': 2, '100': 9 },
        observaciones: 'Faltan 100',
      }),
    )
    expect(c).toMatchObject({ ok: true, diferencia: '-100.00' })
    // La caja queda en lo contado, con el arqueo y su ajuste.
    expect(await en((tx) => saldoCuenta(tx, caja))).toBe('12900.00')
    const [a] = await en((tx) => tx.select().from(arqueos).where(eq(arqueos.cuentaId, caja)))
    expect(a.diferencia).toBe('-100.00')

    // El próximo turno arranca del cierre, con lo contado como saldo inicial.
    const sig = await en((tx) => inicioTurno(tx, caja))
    const r2 = await en((tx) => resumenTurno(tx, caja, sig))
    expect(r2).toMatchObject({ saldoInicial: '12900.00', ingresos: '0.00', cobrado: '0.00', esperado: '12900.00' })
    // Sin diferencia no hay arqueo.
    expect(await en((tx) => cerrarCaja(tx, ana, { cuentaId: caja, contado: '12900' }))).toMatchObject({
      ok: true,
      diferencia: '0.00',
    })
    const lista = await en((tx) => listarCierres(tx, { cuentaId: caja }))
    expect(lista.map((x) => x.diferencia)).toEqual(['0.00', '-100.00'])
    expect(await en((tx) => tx.select().from(arqueos).where(eq(arqueos.cuentaId, caja)))).toHaveLength(1)
  })

  it('caja por turnos: sin abrirla no se cobra en efectivo; se abre con fondo, los recibos quedan en el turno y una diferencia grande la cierra un supervisor', async () => {
    const hoy = hoyArgentina()
    expect(
      (
        await en((tx) =>
          configurarCaja(tx, ana, caja, { exigeTurno: true, diferenciaMaxima: '500', correos: ['dueno@caja.com'] }),
        )
      ).ok,
    ).toBe(true)
    const efectivo = (importe: string) =>
      en((tx) =>
        emitirRecibo(tx, ana, { terceroId: cliente, fecha: hoy, valores: [{ medio: 'efectivo', importe, cuentaId: caja }] }),
      )
    expect(await efectivo('1000')).toMatchObject({ ok: false, error: expect.stringContaining('está cerrada') })
    expect(
      await en((tx) =>
        registrarMovimiento(tx, ana, { cuentaId: caja, fecha: hoy, sentido: 'egreso', importe: '10', concepto: 'Café' }),
      ),
    ).toMatchObject({ ok: false })

    // Se abre con $ 100 más de lo que dice el sistema: queda el ajuste, que es parte del fondo.
    const t = await en((tx) => abrirTurno(tx, ana, { cuentaId: caja, contado: '13000', nota: 'Cambio del banco' }))
    expect(t).toMatchObject({ ok: true, diferencia: '100.00' })
    expect((await en((tx) => abrirTurno(tx, ana, { cuentaId: caja, contado: '13000' }))).ok).toBe(false)

    expect((await efectivo('1000')).ok).toBe(true)
    // Sin pasar por la caja, el recibo va al turno de quien cobra.
    const tr = await en((tx) =>
      emitirRecibo(tx, ana, {
        terceroId: cliente,
        fecha: hoy,
        valores: [
          { medio: 'transferencia', importe: '4000', cuentaId: banco },
          { medio: 'tarjeta_debito', importe: '3000' },
        ],
      }),
    )
    expect(tr.ok).toBe(true)
    const turnoId = t.ok ? t.id : ''
    expect(await en((tx) => tx.select({ t: recibos.turnoId }).from(recibos).where(eq(recibos.turnoId, turnoId)))).toHaveLength(2)

    const { resumen } = await en((tx) => turnoEnCurso(tx, caja))
    expect(resumen).toMatchObject({
      saldoInicial: '13000.00',
      ingresos: '1000.00',
      esperado: '14000.00',
      cobrado: '8000.00',
      recibos: 2,
    })

    // Faltan $ 1.000 (más que los $ 500 permitidos): el cajero no puede cerrar.
    const cierre = { cuentaId: caja, contado: '13000', medios: { tarjeta_debito: '2900' } }
    expect(await en((tx) => cerrarCaja(tx, ana, cierre))).toMatchObject({ ok: false, requiereSupervisor: true })
    const c = await en((tx) => cerrarCaja(tx, ana, cierre, new Date(), { supervisor: true }))
    expect(c).toMatchObject({ ok: true, diferencia: '-1000.00' })
    const [g] = await en((tx) =>
      tx
        .select()
        .from(cierresCaja)
        .where(eq(cierresCaja.id, c.ok ? c.id : '')),
    )
    expect(g.aprobadoPor).toBe(ana)
    expect(g.turnoId).toBe(turnoId)
    expect(g.medios).toEqual([
      { medio: 'transferencia', nombre: 'Transferencia', esperado: '4000.00', contado: '4000.00', diferencia: '0.00' },
      { medio: 'tarjeta_debito', nombre: 'Tarjeta de débito', esperado: '3000.00', contado: '2900.00', diferencia: '-100.00' },
    ])
    const [turno] = await en((tx) => tx.select().from(turnosCaja).where(eq(turnosCaja.id, turnoId)))
    expect(turno).toMatchObject({ estado: 'cerrado', cierreId: g.id, fondoEsperado: '12900.00', fondoContado: '13000.00' })
    expect(await en((tx) => saldoCuenta(tx, caja))).toBe('13000.00')
    // Cerrada otra vez: ni cobrar ni cerrar.
    expect((await efectivo('1')).ok).toBe(false)
    expect((await en((tx) => cerrarCaja(tx, ana, { cuentaId: caja, contado: '13000' }))).ok).toBe(false)
  })

  it('reporte del cierre: PDF, resumen para WhatsApp y envío a los destinatarios de la caja', async () => {
    const [ultimo] = await en((tx) => listarCierres(tx, { cuentaId: caja }))
    const r = await en((tx) => datosReporte(tx, ultimo.id))
    expect(r?.empresa).toBe('Caja S.A.')
    const pdf = Buffer.from(pdfCierre(r!.cierre, r!.empresa)).toString('latin1')
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain('Cierre de caja')
    expect(pdf).toContain('Tarjeta de d\\351bito')
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
    const texto = textoCierre(r!.cierre, r!.empresa, 'https://x/cierre/t')
    expect(texto).toContain('Faltante')
    expect(texto).toContain('Tarjeta de débito: Faltante')

    process.env.ERP_CLAVE_MAESTRA ??= 'x'.repeat(40)
    await en((tx) =>
      configurarCaja(tx, ana, caja, { exigeTurno: true, correos: ['dueno@caja.com'], telefonos: ['11 5555 1234'] }),
    )
    const envio = await enviarReporteCierre(empresa, ultimo.id, () => Promise.reject(new Error('sin red')))
    expect(envio.map((e) => [e.via, e.destino])).toEqual([
      ['correo', 'dueno@caja.com'],
      ['whatsapp', '1155551234'],
    ])
    expect(envio[1]).toMatchObject({ ok: false, error: 'WhatsApp no está conectado.' })
    const [correo] = await en((tx) => tx.select().from(correos).where(eq(correos.entidadId, ultimo.id)))
    expect(correo.para).toBe('dueno@caja.com')
    expect((correo.adjuntos as { tipo: string }[])[0]).toMatchObject({ tipo: 'application/pdf' })
    const [g] = await en((tx) => tx.select({ envio: cierresCaja.envio }).from(cierresCaja).where(eq(cierresCaja.id, ultimo.id)))
    expect(g.envio).toHaveLength(2)
  })
})
