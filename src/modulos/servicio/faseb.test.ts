import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { correos, empresas, encuestas, ordenesServicio, tecnicos, terceros } from '../../db/schema'
import { enlaceWhatsapp } from '../comunicaciones/correo'
import { guardarContrato, guardarEquipo } from '../contratos/contratos'
import { avisarCierre, avisarVisita, encuestaPublica, ponerAlDia, responderEncuesta } from './avisos'
import { guardarConfiguracion } from './configuracion'
import { guardarRecordatorio, listarRecordatorios, marcarRecordatorio } from './recordatorios'
import { cerrarOrden, guardarOrden, obtenerOrden, programarOrden, registrarLlegada } from './servicio'
import { indicadores, nps } from './tablero'
import { limitesSla, situacionPlazo } from './tipos'

const U = '00000000-0000-4000-8000-000000000001'
const H = 3_600_000

describe('cálculos', () => {
  it('WhatsApp con números argentinos', () => {
    expect(enlaceWhatsapp('011 15 4444-5555', 'Hola')).toBe('https://wa.me/5491144445555?text=Hola')
    expect(enlaceWhatsapp('(0341) 15-512-3456', 'x')).toContain('wa.me/5493415123456')
    expect(enlaceWhatsapp('3415123456', 'x')).toContain('wa.me/5493415123456')
    expect(enlaceWhatsapp('+54 9 11 4444 5555', 'x')).toContain('wa.me/5491144445555')
    expect(enlaceWhatsapp(null, 'a b')).toBe('https://wa.me/?text=a%20b')
  })

  it('SLA por prioridad, con el del contrato si lo tiene', () => {
    const c = { respuestaNormal: 24, respuestaUrgente: 4, resolucionNormal: 72, resolucionUrgente: 24 }
    const t = new Date('2026-10-05T12:00:00Z')
    expect(limitesSla(t, 'urgente', c).slaRespuesta.getTime() - t.getTime()).toBe(4 * H)
    expect(
      limitesSla(t, 'normal', c, { slaRespuestaHoras: 8, slaResolucionHoras: null }).slaRespuesta.getTime() - t.getTime(),
    ).toBe(8 * H)
    const desde = new Date(0)
    const limite = new Date(10 * H)
    expect(situacionPlazo(desde, limite, null, new Date(5 * H))).toBe('en_termino')
    expect(situacionPlazo(desde, limite, null, new Date(9 * H))).toBe('por_vencer')
    expect(situacionPlazo(desde, limite, null, new Date(11 * H))).toBe('vencido')
    expect(situacionPlazo(desde, limite, new Date(12 * H))).toBe('incumplido')
  })
})

describe('avisos, encuestas, recordatorios y tablero', () => {
  let empresa: string
  let cliente: string
  let tecnico: string
  let equipo: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Copiadora S.A.', nombreFantasia: 'Copiadora', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    await en(async (tx) => {
      cliente = (
        await tx
          .insert(terceros)
          .values({
            codigo: 'C1',
            razonSocial: 'Estudio',
            tipoDocumento: 99,
            condicionIva: 5,
            email: 'estudio@ejemplo.com',
            telefono: '11 4444-5555',
          })
          .returning()
      )[0].id
      tecnico = (await tx.insert(tecnicos).values({ codigo: 'T1', nombre: 'Juan' }).returning())[0].id
    })
    const c = await en((tx) =>
      guardarContrato(tx, U, {
        terceroId: cliente,
        tipo: 'Servicio',
        modalidad: 'excedente',
        facturacion: 'vencida',
        moneda: 'PES',
        precioExcedente: '10',
      }),
    )
    if (!c.ok) throw new Error(c.error)
    const r = await en((tx) => guardarEquipo(tx, U, { serie: 'EQ1', terceroId: cliente, comercializacion: 'venta' }))
    if (!r.ok) throw new Error(r.error)
    equipo = r.id
    expect(
      await en((tx) =>
        guardarConfiguracion(tx, U, {
          respuestaNormal: '24',
          respuestaUrgente: '4',
          resolucionNormal: '72',
          resolucionUrgente: '2',
          emailCoordinacion: 'oficina@copiadora.com',
          avisarVisita: true,
          avisarCierre: true,
          encuesta: true,
          firma: 'Copiadora · 4444-0000',
        }),
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('resolución') })
    expect(
      (
        await en((tx) =>
          guardarConfiguracion(tx, U, {
            respuestaNormal: '24',
            respuestaUrgente: '4',
            resolucionNormal: '72',
            resolucionUrgente: '8',
            emailCoordinacion: 'oficina@copiadora.com',
            avisarVisita: true,
            avisarCierre: true,
            encuesta: true,
            firma: 'Copiadora · 4444-0000',
          }),
        )
      ).ok,
    ).toBe(true)
  })

  it('la orden toma el SLA de su prioridad y lo recalcula si cambia', async () => {
    const o = await en((tx) =>
      guardarOrden(tx, U, { fecha: '2026-10-05', terceroId: cliente, equipoId: equipo, falla: 'No imprime' }),
    )
    if (!o.ok) throw new Error(o.error)
    let d = await en((tx) => obtenerOrden(tx, o.id))
    expect(d!.slaRespuesta!.getTime() - d!.creado.getTime()).toBeCloseTo(24 * H, -4)
    const r = await en((tx) =>
      guardarOrden(
        tx,
        U,
        { fecha: '2026-10-05', terceroId: cliente, equipoId: equipo, falla: 'No imprime', prioridad: 'urgente' },
        o.id,
      ),
    )
    expect(r.ok).toBe(true)
    d = await en((tx) => obtenerOrden(tx, o.id))
    expect(d!.slaResolucion!.getTime() - d!.creado.getTime()).toBeCloseTo(8 * H, -4)
  })

  it('avisa la visita al cliente (email encolado y WhatsApp) y alerta el SLA a la oficina una sola vez', async () => {
    const [o] = await en((tx) => tx.select().from(ordenesServicio).limit(1))
    expect(await en((tx) => avisarVisita(tx, U, o.id))).toMatchObject({ error: expect.stringContaining('día de visita') })
    await en((tx) => programarOrden(tx, U, o.id, { programada: '2026-10-06', hora: '10:00', tecnicoId: tecnico }))
    const a = await en((tx) => avisarVisita(tx, U, o.id))
    expect(a).toMatchObject({
      encolado: true,
      para: 'estudio@ejemplo.com',
      whatsapp: expect.stringContaining('wa.me/5491144445555'),
    })
    expect('texto' in a && a.texto).toContain('martes 6 de octubre a las 10:00')

    // Pasaron 7 horas de una urgente (resolución en 8): alerta a coordinación, una vez.
    const ahora = new Date(o.creado.getTime() + 7 * H)
    await en((tx) => ponerAlDia(tx, U, ahora))
    await en((tx) => ponerAlDia(tx, U, ahora))
    const alertas = await en((tx) => tx.select().from(correos).where(eq(correos.entidad, 'alerta_sla')))
    expect(alertas).toHaveLength(1)
    expect(alertas[0]).toMatchObject({ para: 'oficina@copiadora.com', estado: 'pendiente' })
    // Los correos no se borran.
    await expect(en((tx) => tx.delete(correos))).rejects.toThrow()
  })

  it('al cerrar: resumen al cliente con la encuesta; se responde una sola vez por el enlace público', async () => {
    const [o] = await en((tx) => tx.select().from(ordenesServicio).limit(1))
    await en((tx) => registrarLlegada(tx, U, o.id, {}))
    expect((await en((tx) => cerrarOrden(tx, U, o.id, { fecha: '2026-10-06', cierre: 'ok', nota: 'Rodillo cambiado' }))).ok).toBe(
      true,
    )
    const a = await en((tx) => avisarCierre(tx, U, o.id, { empresaId: empresa, base: 'https://erp.test' }))
    if ('error' in a) throw new Error(a.error)
    const enlace = /https:\/\/erp\.test\/encuesta\/(\S+)/.exec(a.texto)![1]
    expect(a.texto).toContain('Rodillo cambiado')
    // Volver a mandarlo da el mismo enlace: los anteriores siguen sirviendo.
    const otra = await en((tx) => avisarCierre(tx, U, o.id, { empresaId: empresa, base: 'https://erp.test' }))
    expect('texto' in otra && otra.texto).toContain(enlace)

    expect(await encuestaPublica(enlace)).toMatchObject({ empresa: 'Copiadora', numero: 1, respondida: false })
    expect(await encuestaPublica(`${empresa}.secreto-que-no-existe-xxxx`)).toBeNull()
    expect(await responderEncuesta(enlace, { puntaje: 7, nps: 9, comentario: '' })).toMatchObject({ ok: false })
    expect(await responderEncuesta(enlace, { puntaje: 5, nps: 10, comentario: 'Muy rápido' })).toEqual({ ok: true })
    expect(await responderEncuesta(enlace, { puntaje: 1, nps: 0, comentario: '' })).toMatchObject({ ok: false })
    await expect(en((tx) => tx.update(encuestas).set({ puntaje: 1 }))).rejects.toThrow()
  })

  it('recordatorios: aviso por email los días antes, una vez; se marcan hechos', async () => {
    const r = await en((tx) =>
      guardarRecordatorio(tx, U, {
        terceroId: cliente,
        fecha: '2026-10-20',
        titulo: 'Llamar por la renovación',
        avisarA: 'ventas@copiadora.com',
        diasAntes: '3',
      }),
    )
    if (!r.ok) throw new Error(r.error)
    const deRecordatorio = () => en((tx) => tx.select().from(correos).where(eq(correos.entidad, 'recordatorio')))
    await en((tx) => ponerAlDia(tx, U, new Date('2026-10-16T12:00:00Z')))
    expect(await deRecordatorio()).toHaveLength(0)
    await en((tx) => ponerAlDia(tx, U, new Date('2026-10-17T12:00:00Z')))
    await en((tx) => ponerAlDia(tx, U, new Date('2026-10-18T12:00:00Z')))
    expect(await deRecordatorio()).toHaveLength(1)
    await en((tx) => marcarRecordatorio(tx, U, r.id, true))
    expect(await en((tx) => listarRecordatorios(tx))).toHaveLength(0)
    expect(await en((tx) => listarRecordatorios(tx, { estado: 'hechos' }))).toHaveLength(1)
  })

  it('tablero: cumplimiento, primera visita, SLA, satisfacción y NPS', async () => {
    const hoy = new Date().toISOString().slice(0, 10)
    const { resumen, porTecnico } = await en((tx) => indicadores(tx, '2026-01-01', hoy))
    expect(resumen).toMatchObject({ cerradas: 1, ok: 1, primeraVisita: 1 })
    expect(resumen.slaRespuesta).toEqual({ cumplidas: 1, total: 1 })
    expect(resumen.encuestas).toMatchObject({ respondidas: 1, puntaje: 5, promotores: 1 })
    expect(nps(resumen.encuestas)).toBe(100)
    expect(porTecnico.find((t) => t.nombre === 'Juan')).toMatchObject({ cerradas: 1, ok: 1, puntaje: 5 })
  })
})

describe('cola sin señal', () => {
  it('encuentra y reemplaza los ids de fotos y firmas guardadas en el celular', async () => {
    const { idsLocales, reemplazarIds } = await import('../../components/servicio/sinSenal')
    const r = { fotos: ['local-a', 'b'], firma: { archivoId: 'local-c', aclaracion: 'Ana' }, nota: 'local-no-es-id?' }
    expect([...idsLocales(r)].sort()).toEqual(['local-a', 'local-c', 'local-no-es-id?'])
    const mapa = new Map([
      ['local-a', 'A'],
      ['local-c', 'C'],
    ])
    expect(reemplazarIds(r, mapa)).toEqual({
      fotos: ['A', 'b'],
      firma: { archivoId: 'C', aclaracion: 'Ana' },
      nota: 'local-no-es-id?',
    })
  })
})
