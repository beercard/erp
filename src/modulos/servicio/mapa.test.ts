import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, equipos, ordenesServicio, posicionesTecnicos, tecnicos, terceros } from '../../db/schema'
import { guardarEquipo } from '../contratos/contratos'
import { buscarHuecos } from './agenda'
import {
  datosMapa,
  distanciaKm,
  enlaceRecorrido,
  geocodificar,
  hojaDeRuta,
  minutosDeViaje,
  ordenarRuta,
  registrarPosicion,
  ubicar,
  ubicarPendientes,
} from './mapa'
import { guardarOrden, programarOrden, registrarLlegada } from './servicio'
import { aHora } from './tipos'

const U = '00000000-0000-4000-8000-000000000001'
const OBELISCO = { lat: -34.6037, lng: -58.3816 }
const SAN_TELMO = { lat: -34.6212, lng: -58.3731 }
const PALERMO = { lat: -34.5889, lng: -58.4306 }
const BELGRANO = { lat: -34.5627, lng: -58.4563 }

describe('cálculos del mapa', () => {
  it('distancias y minutos de viaje', () => {
    expect(distanciaKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.19, 1)
    expect(minutosDeViaje(OBELISCO, OBELISCO)).toBe(0)
    const m = minutosDeViaje(OBELISCO, BELGRANO)
    expect(m % 5).toBe(0)
    expect(m).toBeGreaterThan(20)
    expect(m).toBeLessThan(40)
  })

  it('ordena el recorrido por cercanía y lo mejora', () => {
    // Desordenadas: Belgrano, San Telmo, Palermo → San Telmo, Palermo, Belgrano.
    expect(ordenarRuta(OBELISCO, [BELGRANO, SAN_TELMO, PALERMO])).toEqual([1, 2, 0])
    expect(ordenarRuta(null, [PALERMO])).toEqual([0])
    // En línea: el 2-opt deshace el cruce que deja el vecino más cercano.
    const linea = [0, 3, 1, 4, 2].map((x) => ({ lat: 0, lng: x / 100 }))
    const r = ordenarRuta({ lat: 0, lng: 0 }, linea)
    expect(r.map((i) => linea[i].lng)).toEqual([0, 0.01, 0.02, 0.03, 0.04])
  })

  it('enlace de Google Maps con paradas', () => {
    const u = new URL(enlaceRecorrido(OBELISCO, [SAN_TELMO, PALERMO, BELGRANO])!)
    expect(u.searchParams.get('origin')).toBe('-34.603700,-58.381600')
    expect(u.searchParams.get('destination')).toBe('-34.562700,-58.456300')
    expect(u.searchParams.get('waypoints')?.split('|')).toHaveLength(2)
    expect(enlaceRecorrido(OBELISCO, [])).toBeNull()
  })

  it('geocodifica con Nominatim (y tolera que falle)', async () => {
    let pedido = ''
    const ok = (async (u: URL) => {
      pedido = u.toString()
      return Response.json([{ lat: '-34.6212', lon: '-58.3731' }])
    }) as unknown as typeof fetch
    expect(await geocodificar('Defensa 1000, CABA', ok)).toEqual(SAN_TELMO)
    expect(pedido).toContain('countrycodes=ar')
    expect(pedido).toContain('Argentina')
    const vacio = (async () => Response.json([])) as unknown as typeof fetch
    expect(await geocodificar('Calle que no existe 1', vacio)).toBeNull()
    const roto = (async () => {
      throw new Error('sin red')
    }) as unknown as typeof fetch
    expect(await geocodificar('Defensa 1000', roto)).toBeNull()
  })
})

describe('mapa, hoja de ruta y viaje en la agenda', () => {
  let empresa: string
  let tecnico: string
  let cliente: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)
  const orden = async (falla: string, extra: Record<string, unknown> = {}) => {
    const r = await en((tx) => guardarOrden(tx, U, { fecha: '2026-10-01', terceroId: cliente, falla, ...extra }))
    if (!r.ok) throw new Error(r.error)
    return r.id
  }

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Mapas S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
    empresa = e.id
    await en(async (tx) => {
      await tx.insert(terceros).values({ codigo: 'C1', razonSocial: 'Cliente', tipoDocumento: 99, condicionIva: 5 })
      await tx.insert(tecnicos).values({
        codigo: 'T1',
        nombre: 'Martín Gómez',
        dias: '1234567',
        partida: 'Av. Corrientes 1000, CABA',
        partidaLat: String(OBELISCO.lat),
        partidaLng: String(OBELISCO.lng),
      })
    })
    ;[{ id: cliente }] = await en((tx) => tx.select({ id: terceros.id }).from(terceros))
    ;[{ id: tecnico }] = await en((tx) => tx.select({ id: tecnicos.id }).from(tecnicos))
  })

  it('hoja de ruta: las con hora a su hora, las demás por cercanía', async () => {
    const belgrano = await orden('Belgrano')
    const santelmo = await orden('San Telmo')
    const palermo = await orden('Palermo')
    const sinUbicar = await orden('Sin ubicar')
    for (const [id, p] of [
      [belgrano, BELGRANO],
      [santelmo, SAN_TELMO],
      [palermo, PALERMO],
    ] as const)
      expect(await en((tx) => ubicar(tx, U, 'orden', id, p))).toEqual({ ok: true })
    // Belgrano a las 9 (fija); el resto sin hora.
    await en((tx) => programarOrden(tx, U, belgrano, { tecnicoId: tecnico, programada: '2026-10-12', hora: '09:00' }))
    for (const id of [santelmo, palermo, sinUbicar])
      await en((tx) => programarOrden(tx, U, id, { tecnicoId: tecnico, programada: '2026-10-12' }))

    const h = (await en((tx) => hojaDeRuta(tx, tecnico, '2026-10-12')))!
    // Después de Belgrano, Palermo queda más cerca que San Telmo; la sin ubicación, al final.
    expect(h.paradas.map((p) => p.falla)).toEqual(['Belgrano', 'Palermo', 'San Telmo', 'Sin ubicar'])
    expect(h.paradas[0]).toMatchObject({ llegaria: '09:00', viajeMinutos: minutosDeViaje(OBELISCO, BELGRANO) })
    expect(h.paradas[1].llegaria).toBe(aHora(10 * 60 + minutosDeViaje(BELGRANO, PALERMO)))
    expect(h.paradas[3]).toMatchObject({ punto: null, viajeMinutos: null })
    expect(h.km).toBeGreaterThan(10)
    expect(new URL(h.enlace!).searchParams.get('waypoints')?.split('|')).toHaveLength(2)

    const m = await en((tx) => datosMapa(tx, '2026-10-12'))
    expect(m.rutas).toHaveLength(1)
    expect(m.ordenes.filter((o) => o.punto)).toHaveLength(3)
    expect(m.tecnicos[0]).toMatchObject({ nombre: 'Martín Gómez', partida: OBELISCO, posicion: null })
  })

  it('el asistente de huecos suma el viaje desde la visita anterior', async () => {
    // Con Belgrano de 9 a 10, un hueco para San Telmo arranca después del viaje.
    const huecos = await en((tx) =>
      buscarHuecos(tx, { duracion: 60, desde: '2026-10-12', dias: 1, destino: SAN_TELMO }, new Date('2026-10-01T12:00:00Z')),
    )
    expect(huecos).toHaveLength(1)
    const viaje = minutosDeViaje(BELGRANO, SAN_TELMO)
    // Antes de Belgrano no da (ida, la visita y la vuelta): es al terminar Belgrano más el viaje.
    expect(huecos[0]).toMatchObject({ viaje, hora: aHora(10 * 60 + viaje) })
    const sinViaje = await en((tx) =>
      buscarHuecos(tx, { duracion: 60, desde: '2026-10-12', dias: 1 }, new Date('2026-10-01T12:00:00Z')),
    )
    expect(sinViaje[0].viaje).toBeNull()
  })

  it('busca los domicilios sin ubicación; la llegada con GPS ubica al equipo', async () => {
    const eq1 = await en((tx) =>
      guardarEquipo(tx, U, {
        serie: 'EQ1',
        terceroId: cliente,
        comercializacion: 'venta',
        domicilio: 'Defensa 1000',
        localidad: 'CABA',
      }),
    )
    if (!eq1.ok) throw new Error(eq1.error)
    const conDomicilio = await orden('Con domicilio', { equipoId: eq1.id })
    let pedidos = 0
    const nominatim = (async () => {
      pedidos++
      return Response.json([{ lat: '-34.6212', lon: '-58.3731' }])
    }) as unknown as typeof fetch
    const r = await en((tx) => ubicarPendientes(tx, U, 10, nominatim, 0))
    expect(r.ubicadas).toBe(1)
    expect(r.sinDomicilio).toBe(1) // la "Sin ubicar" no tiene domicilio
    expect(pedidos).toBe(1)
    const [e] = await en((tx) => tx.select().from(equipos).where(eq(equipos.id, eq1.id)))
    expect(Number(e.lat)).toBeCloseTo(SAN_TELMO.lat, 4)

    // Otro equipo sin ubicación: la llegada del técnico con GPS lo ubica.
    const eq2 = await en((tx) => guardarEquipo(tx, U, { serie: 'EQ2', terceroId: cliente, comercializacion: 'venta' }))
    if (!eq2.ok) throw new Error(eq2.error)
    const o = await orden('Llegada', { equipoId: eq2.id })
    await en((tx) => programarOrden(tx, U, o, { tecnicoId: tecnico, programada: '2026-10-01' }))
    await en((tx) => registrarLlegada(tx, U, o, { lat: PALERMO.lat, lng: PALERMO.lng }))
    const [e2] = await en((tx) => tx.select().from(equipos).where(eq(equipos.id, eq2.id)))
    expect(Number(e2.lat)).toBeCloseTo(PALERMO.lat, 4)
    expect(conDomicilio).toBeTruthy()
  })

  it('posición del técnico: una por minuto salvo que se mueva', async () => {
    const t0 = new Date('2026-10-12T12:00:00Z')
    expect(await en((tx) => registrarPosicion(tx, tecnico, { ...OBELISCO, precision: 12 }, t0))).toMatchObject({
      ok: true,
      guardada: true,
    })
    expect(await en((tx) => registrarPosicion(tx, tecnico, OBELISCO, new Date(t0.getTime() + 20_000)))).toMatchObject({
      guardada: false,
    })
    expect(await en((tx) => registrarPosicion(tx, tecnico, SAN_TELMO, new Date(t0.getTime() + 30_000)))).toMatchObject({
      guardada: true,
    })
    expect(await en((tx) => registrarPosicion(tx, tecnico, { lat: 200, lng: 0 }))).toMatchObject({ ok: false })
    // Las de más de 30 días se borran.
    await en((tx) => registrarPosicion(tx, tecnico, PALERMO, new Date(t0.getTime() + 31 * 86_400_000)))
    const quedan = await en((tx) => tx.select().from(posicionesTecnicos))
    expect(quedan).toHaveLength(1)
    expect(await en((tx) => tx.select().from(ordenesServicio))).not.toHaveLength(0)
  })
})
