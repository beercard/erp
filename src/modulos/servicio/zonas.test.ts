import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { alertasZona, configuracionServicio, correos, empresas, equipos, tecnicos, terceros } from '../../db/schema'
import { fichar } from './jornada'
import { registrarPosicion } from './mapa'
import { asignarZonas, detectarVisitas, diaDelTecnico, guardarZona, listarZonas } from './zonas'

const U = '00000000-0000-4000-8000-000000000001'
// Plaza de Mayo y alrededores.
const PLAZA = { lat: -34.6081, lng: -58.3703 }
const CERCA = { lat: -34.6085, lng: -58.3707 } // ~60 m
const LEJOS = { lat: -34.5, lng: -58.5 } // ~17 km
const t0 = new Date('2026-10-05T13:00:00Z') // 10:00 en Buenos Aires
const min = (n: number) => new Date(t0.getTime() + n * 60_000)

describe('visitas detectadas', () => {
  const lugares = [{ ...PLAZA, terceroId: 'c1', cliente: 'Estudio' }]
  it('una estadía de 5 minutos o más cerca de un cliente es una visita', () => {
    const v = detectarVisitas(
      [
        { ...LEJOS, momento: min(0) },
        { ...PLAZA, momento: min(10) },
        { ...CERCA, momento: min(14) },
        { ...PLAZA, momento: min(25) },
        { ...LEJOS, momento: min(30) },
        // Pasó de nuevo, pero solo 2 minutos: no cuenta.
        { ...PLAZA, momento: min(40) },
        { ...PLAZA, momento: min(42) },
      ],
      lugares,
    )
    expect(v).toEqual([{ terceroId: 'c1', cliente: 'Estudio', desde: min(10), hasta: min(25), minutos: 15 }])
  })
  it('un hueco largo sin posiciones corta la estadía', () => {
    const v = detectarVisitas(
      [
        { ...PLAZA, momento: min(0) },
        { ...PLAZA, momento: min(6) },
        { ...PLAZA, momento: min(60) },
        { ...PLAZA, momento: min(70) },
      ],
      lugares,
    )
    expect(v.map((x) => x.minutos)).toEqual([6, 10])
  })
})

describe('zonas de trabajo', () => {
  let empresa: string
  let juan: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Copiadora S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    await en(async (tx) => {
      juan = (await tx.insert(tecnicos).values({ codigo: 'T1', nombre: 'Juan' }).returning())[0].id
      const [c] = await tx
        .insert(terceros)
        .values({ codigo: 'C1', razonSocial: 'Estudio', tipoDocumento: 99, condicionIva: 5 })
        .returning()
      await tx.insert(equipos).values({ serie: 'S1', terceroId: c.id, lat: String(PLAZA.lat), lng: String(PLAZA.lng) })
      await tx.insert(configuracionServicio).values({ emailCoordinacion: 'oficina@copiadora.com' }).onConflictDoNothing()
    })
  })

  it('alerta al salir de la zona en jornada (una vez) y al volver; sin jornada no controla', async () => {
    const z = await en((tx) => guardarZona(tx, U, { nombre: 'Microcentro', lat: PLAZA.lat, lng: PLAZA.lng, radioKm: 3 }))
    if (!z.ok) throw new Error(z.error)
    expect(await en((tx) => guardarZona(tx, U, { nombre: 'Microcentro', lat: 0, lng: 0, radioKm: 1 }))).toMatchObject({
      ok: false,
    })
    expect(await en((tx) => asignarZonas(tx, U, juan, [z.id]))).toEqual({ ok: true })
    expect((await en((tx) => listarZonas(tx)))[0]).toMatchObject({ nombre: 'Microcentro', radioKm: 3, tecnicos: [juan] })

    // Fuera de jornada: nada.
    expect(await en((tx) => registrarPosicion(tx, juan, LEJOS, min(-60)))).toMatchObject({ zona: null })
    await en((tx) => fichar(tx, U, juan, { tipo: 'entrada' }, min(0)))
    expect(await en((tx) => registrarPosicion(tx, juan, PLAZA, min(5)))).toMatchObject({ zona: null })
    expect(await en((tx) => registrarPosicion(tx, juan, LEJOS, min(30)))).toMatchObject({ zona: 'salida' })
    expect(await en((tx) => registrarPosicion(tx, juan, { lat: -34.49, lng: -58.5 }, min(35)))).toMatchObject({ zona: null })
    expect(await en((tx) => registrarPosicion(tx, juan, CERCA, min(60)))).toMatchObject({ zona: 'entrada' })
    const alertas = await en((tx) => tx.select().from(alertasZona).where(eq(alertasZona.tecnicoId, juan)))
    expect(alertas.map((a) => a.tipo)).toEqual(['salida', 'entrada'])
    const mails = await en((tx) => tx.select().from(correos).where(eq(correos.entidad, 'alerta_zona')))
    expect(mails).toHaveLength(1)
    expect(mails[0].asunto).toContain('Juan salió de su zona')
  })

  it('el día del técnico: visitas detectadas a clientes y alertas', async () => {
    await en((tx) => registrarPosicion(tx, juan, PLAZA, min(70)))
    const d = await en((tx) => diaDelTecnico(tx, juan, '2026-10-05'))
    expect(d.alertas).toHaveLength(2)
    // A las 10:05 pasó un instante (no cuenta); de 11:00 a 11:10 estuvo junto al equipo del cliente, sin orden.
    expect(d.visitas).toEqual([expect.objectContaining({ cliente: 'Estudio', minutos: 10, ordenes: [] })])
    expect(d.km).toBeGreaterThan(30)
  })
})
