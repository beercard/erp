import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, tecnicos, terceros } from '../../db/schema'
import { estadoJornada, fichar, geocercaDeOrden, jornadas, kmRecorridos, recorrido } from './jornada'
import { registrarPosicion, ubicar } from './mapa'
import { guardarOrden, informarOrden, programarOrden } from './servicio'

const U = '00000000-0000-4000-8000-000000000001'
const CLIENTE = { lat: -34.6212, lng: -58.3731 }
const CERCA = { lat: -34.6215, lng: -58.3733 } // ~40 m
const LEJOS = { lat: -34.6037, lng: -58.3816 } // ~2 km
/** 2 de octubre de 2026, a las 9 de la mañana en Buenos Aires. */
const NUEVE = new Date('2026-10-02T12:00:00Z')
const min = (n: number) => new Date(NUEVE.getTime() + n * 60_000)

describe('jornada, geocercas y recorridos', () => {
  let empresa: string
  let tecnico: string
  let orden: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Jornadas S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    await en(async (tx) => {
      await tx.insert(terceros).values({ codigo: 'C1', razonSocial: 'Cliente', tipoDocumento: 99, condicionIva: 5 })
      await tx.insert(tecnicos).values({ codigo: 'T1', nombre: 'Martín', dias: '1234567' })
    })
    const [[c], [t]] = await Promise.all([en((tx) => tx.select().from(terceros)), en((tx) => tx.select().from(tecnicos))])
    tecnico = t.id
    const o = await en((tx) => guardarOrden(tx, U, { fecha: '2026-10-01', terceroId: c.id, falla: 'No imprime' }))
    if (!o.ok) throw new Error(o.error)
    orden = o.id
    await en((tx) => ubicar(tx, U, 'orden', orden, CLIENTE))
    await en((tx) => programarOrden(tx, U, orden, { tecnicoId: tecnico, programada: '2026-10-02', hora: '10:00' }))
  })

  it('ficha entrada y salida, alternadas', async () => {
    expect(await en((tx) => fichar(tx, U, tecnico, { tipo: 'salida' }, NUEVE))).toMatchObject({ ok: false })
    expect(await en((tx) => fichar(tx, U, tecnico, { tipo: 'entrada', ...LEJOS, precision: 10 }, NUEVE))).toMatchObject({
      ok: true,
    })
    expect(await en((tx) => fichar(tx, U, tecnico, { tipo: 'entrada' }, min(1)))).toMatchObject({ ok: false })
    expect(await en((tx) => estadoJornada(tx, tecnico, min(60)))).toMatchObject({ enJornada: true, desde: NUEVE })
    // Una entrada olvidada de hace más de 16 horas ya no cuenta como jornada abierta.
    expect((await en((tx) => estadoJornada(tx, tecnico, min(17 * 60)))).enJornada).toBe(false)
  })

  it('el GPS registra cuándo entró y salió del cliente', async () => {
    const pos = (p: { lat: number; lng: number }, m: number) => en((tx) => registrarPosicion(tx, tecnico, p, min(m)))
    expect((await pos(LEJOS, 30)).ok).toBe(true)
    const llego = await pos(CERCA, 55)
    expect(llego).toMatchObject({ geocercas: [{ ordenId: orden, tipo: 'entrada' }] })
    // Dentro del radio, nada nuevo; al irse lejos, la salida con los minutos.
    expect(await pos(CLIENTE, 70)).toMatchObject({ geocercas: [] })
    expect(await pos(LEJOS, 100)).toMatchObject({ geocercas: [{ tipo: 'salida', minutos: 45 }] })
    expect(await en((tx) => geocercaDeOrden(tx, orden))).toMatchObject([
      { tipo: 'entrada', momento: min(55) },
      { tipo: 'salida', minutos: 45 },
    ])
    const r = await en((tx) => recorrido(tx, tecnico, '2026-10-02'))
    expect(r).toHaveLength(4)
  })

  it('resumen de la jornada: horas, km, visitas y tiempo en clientes', async () => {
    await en((tx) => informarOrden(tx, U, orden, { fecha: '2026-10-02', solucion: 'Listo', cierre: 'ok', resultados: {} }))
    expect(await en((tx) => fichar(tx, U, tecnico, { tipo: 'salida' }, min(8 * 60)))).toMatchObject({ ok: true })
    const [j] = await en((tx) => jornadas(tx, '2026-10-01', '2026-10-03'))
    expect(j).toMatchObject({
      tecnico: 'Martín',
      fecha: '2026-10-02',
      entrada: NUEVE,
      minutos: 480,
      visitas: 1,
      minutosEnClientes: 45,
    })
    expect(j.km).toBeGreaterThan(3)
    // Un salto imposible del GPS (300 km en un minuto) no suma.
    expect(
      kmRecorridos([
        { ...LEJOS, momento: min(0) },
        { lat: -32, lng: -60, momento: min(1) },
      ]),
    ).toBe(0)
  })
})
