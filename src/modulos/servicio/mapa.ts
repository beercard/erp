import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { equipos, modelosEquipo, ordenesServicio, posicionesTecnicos, tecnicos, terceros, tiposOrden } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { aHora, aMinutos } from './tipos'

/**
 * Mapa del servicio técnico (como el de Persat): dónde están las órdenes y
 * los técnicos, la hoja de ruta de cada uno y el viaje entre visitas.
 * Sin servicios pagos: OpenStreetMap para el mapa y Nominatim para ubicar
 * domicilios; las distancias son en línea recta corregidas por un factor de
 * calles, que alcanza para ordenar visitas y estimar el viaje.
 */

export type Punto = { lat: number; lng: number }

/** Velocidad promedio en ciudad (km/h) y cuánto más largo es el camino por calle que la línea recta. */
export const VELOCIDAD_URBANA = 25
const FACTOR_CALLES = 1.3

export function distanciaKm(a: Punto, b: Punto) {
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Minutos de viaje estimados entre dos puntos (redondeados a 5, mínimo 5 si no es el mismo lugar). */
export function minutosDeViaje(a: Punto, b: Punto, velocidad = VELOCIDAD_URBANA) {
  const km = distanciaKm(a, b) * FACTOR_CALLES
  if (km < 0.2) return 0
  return Math.max(5, Math.ceil(((km / velocidad) * 60) / 5) * 5)
}

const largo = (orden: number[], puntos: Punto[], partida: Punto | null, vuelta: boolean) => {
  let total = 0
  let previo = partida
  for (const i of orden) {
    if (previo) total += distanciaKm(previo, puntos[i])
    previo = puntos[i]
  }
  if (vuelta && partida && previo) total += distanciaKm(previo, partida)
  return total
}

/**
 * Orden de visita más corto (aproximado): vecino más cercano desde la partida
 * y después 2-opt hasta que no mejora. Para las 5-20 visitas de un día es
 * instantáneo y queda muy cerca del óptimo.
 */
export function ordenarRuta(partida: Punto | null, puntos: Punto[], vuelta = false): number[] {
  const n = puntos.length
  if (n <= 1) return puntos.map((_, i) => i)
  const pendientes = new Set(puntos.map((_, i) => i))
  const orden: number[] = []
  let actual = partida ?? puntos[0]
  if (!partida) {
    orden.push(0)
    pendientes.delete(0)
  }
  while (pendientes.size) {
    let mejor = -1
    let distancia = Infinity
    for (const i of pendientes) {
      const d = distanciaKm(actual, puntos[i])
      if (d < distancia) [mejor, distancia] = [i, d]
    }
    orden.push(mejor)
    pendientes.delete(mejor)
    actual = puntos[mejor]
  }
  let mejoro = true
  while (mejoro) {
    mejoro = false
    for (let i = 0; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const prueba = [...orden.slice(0, i), ...orden.slice(i, k + 1).reverse(), ...orden.slice(k + 1)]
        if (largo(prueba, puntos, partida, vuelta) + 1e-9 < largo(orden, puntos, partida, vuelta)) {
          orden.splice(0, n, ...prueba)
          mejoro = true
        }
      }
    }
  }
  return orden
}

/** Enlace de Google Maps con el recorrido (para que el técnico navegue desde el celular). */
export function enlaceRecorrido(partida: Punto | null, paradas: Punto[]) {
  if (!paradas.length) return null
  const t = (p: Punto) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
  const destino = paradas.at(-1)!
  // Google acepta hasta 9 paradas intermedias en el enlace.
  const intermedias = paradas.slice(0, -1).slice(0, 9)
  const u = new URL('https://www.google.com/maps/dir/')
  u.searchParams.set('api', '1')
  if (partida) u.searchParams.set('origin', t(partida))
  u.searchParams.set('destination', t(destino))
  if (intermedias.length) u.searchParams.set('waypoints', intermedias.map(t).join('|'))
  u.searchParams.set('travelmode', 'driving')
  return u.toString()
}

const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v))
export const punto = (lat: string | number | null | undefined, lng: string | number | null | undefined): Punto | null => {
  const a = num(lat)
  const b = num(lng)
  return a !== null && b !== null && Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : null
}

// ---------------------------------------------------------------- Ubicar domicilios

/**
 * Busca las coordenadas de un domicilio en OpenStreetMap (Nominatim). Su uso
 * gratuito pide no más de un pedido por segundo e identificarse: lo usamos
 * solo a pedido de la oficina, de a uno.
 */
export async function geocodificar(direccion: string, buscar: typeof fetch = fetch): Promise<Punto | null> {
  const q = direccion.trim()
  if (q.length < 4) return null
  const u = new URL('https://nominatim.openstreetmap.org/search')
  u.searchParams.set('q', /argentina/i.test(q) ? q : `${q}, Argentina`)
  u.searchParams.set('format', 'jsonv2')
  u.searchParams.set('limit', '1')
  u.searchParams.set('countrycodes', 'ar')
  try {
    const r = await buscar(u, {
      headers: { 'User-Agent': 'ERP pymes (servicio técnico)', 'Accept-Language': 'es' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const [p] = (await r.json()) as { lat: string; lon: string }[]
    return p ? punto(p.lat, p.lon) : null
  } catch {
    return null
  }
}

const EsquemaPunto = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
})

/** Guarda la ubicación de un equipo, una orden o la partida de un técnico (marcada a mano o encontrada). */
export async function ubicar(
  tx: Transaccion,
  usuarioId: string,
  que: 'equipo' | 'orden' | 'tecnico',
  id: string,
  entrada: unknown,
) {
  const p = EsquemaPunto.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: 'Ubicación inválida.' }
  const lat = p.data.lat.toFixed(6)
  const lng = p.data.lng.toFixed(6)
  const filas =
    que === 'equipo'
      ? await tx.update(equipos).set({ lat, lng }).where(eq(equipos.id, id)).returning({ id: equipos.id })
      : que === 'orden'
        ? await tx
            .update(ordenesServicio)
            .set({ lat, lng })
            .where(eq(ordenesServicio.id, id))
            .returning({ id: ordenesServicio.id })
        : await tx
            .update(tecnicos)
            .set({ partidaLat: lat, partidaLng: lng })
            .where(eq(tecnicos.id, id))
            .returning({ id: tecnicos.id })
  if (!filas.length) return { ok: false as const, error: 'No existe.' }
  // Una orden sin ubicación propia usa la de su equipo: si el equipo no tenía, se la queda.
  if (que === 'orden') {
    const [o] = await tx.select({ equipoId: ordenesServicio.equipoId }).from(ordenesServicio).where(eq(ordenesServicio.id, id))
    if (o?.equipoId)
      await tx
        .update(equipos)
        .set({ lat, lng })
        .where(and(eq(equipos.id, o.equipoId), isNull(equipos.lat)))
  }
  await auditar(tx, {
    usuarioId,
    accion: 'modificacion',
    entidad: que === 'equipo' ? 'equipo' : que === 'orden' ? 'orden_servicio' : 'tecnico',
    entidadId: id,
    despues: { lat, lng },
  })
  return { ok: true as const }
}

/**
 * Ubica las órdenes abiertas (y la partida de los técnicos) que tienen
 * domicilio pero no coordenadas. De a una por segundo, como pide Nominatim.
 */
export async function ubicarPendientes(
  tx: Transaccion,
  usuarioId: string,
  limite = 10,
  buscar: typeof fetch = fetch,
  pausa = 1100,
) {
  const sinUbicar = await tx
    .select({
      id: ordenesServicio.id,
      equipoId: ordenesServicio.equipoId,
      domicilio: sql<
        string | null
      >`coalesce(${ordenesServicio.domicilio}, nullif(concat_ws(', ', ${equipos.domicilio}, ${equipos.localidad}), ''))`,
    })
    .from(ordenesServicio)
    .leftJoin(equipos, eq(equipos.id, ordenesServicio.equipoId))
    .where(
      and(
        isNull(ordenesServicio.lat),
        isNull(equipos.lat),
        inArray(ordenesServicio.estado, ['pendiente', 'proyectada', 'asignada', 'vencida']),
      ),
    )
    .orderBy(asc(ordenesServicio.programada), asc(ordenesServicio.numero))
    .limit(limite)
  const partidas = await tx
    .select({ id: tecnicos.id, partida: tecnicos.partida })
    .from(tecnicos)
    .where(and(eq(tecnicos.activo, true), isNull(tecnicos.partidaLat), sql`${tecnicos.partida} is not null`))
  let ubicadas = 0
  let sinResultado = 0
  const tareas = [
    ...sinUbicar.filter((o) => o.domicilio).map((o) => ({ que: 'orden' as const, id: o.id, texto: o.domicilio! })),
    ...partidas.map((t) => ({ que: 'tecnico' as const, id: t.id, texto: t.partida! })),
  ].slice(0, limite)
  for (const [n, t] of tareas.entries()) {
    if (n && pausa) await new Promise((ok) => setTimeout(ok, pausa))
    const p = await geocodificar(t.texto, buscar)
    if (!p) {
      sinResultado++
      continue
    }
    await ubicar(tx, usuarioId, t.que, t.id, p)
    ubicadas++
  }
  return { ubicadas, sinResultado, sinDomicilio: sinUbicar.filter((o) => !o.domicilio).length }
}

// ---------------------------------------------------------------- Posición de los técnicos

/**
 * Posición que manda el celular del técnico (si eligió compartirla). Se
 * guarda como mucho una por minuto, salvo que se haya movido bastante.
 */
export async function registrarPosicion(tx: Transaccion, tecnicoId: string, entrada: unknown, ahora = new Date()) {
  const p = EsquemaPunto.extend({ precision: z.coerce.number().min(0).max(100_000).optional() }).safeParse(entrada)
  if (!p.success) return { ok: false as const, error: 'Ubicación inválida.' }
  const [ultima] = await tx
    .select()
    .from(posicionesTecnicos)
    .where(eq(posicionesTecnicos.tecnicoId, tecnicoId))
    .orderBy(desc(posicionesTecnicos.momento))
    .limit(1)
  const previa = ultima && punto(ultima.lat, ultima.lng)
  if (ultima && previa && ahora.getTime() - ultima.momento.getTime() < 60_000 && distanciaKm(previa, p.data) < 0.1)
    return { ok: true as const, guardada: false }
  await tx.insert(posicionesTecnicos).values({
    tecnicoId,
    lat: p.data.lat.toFixed(6),
    lng: p.data.lng.toFixed(6),
    precision: p.data.precision === undefined ? null : Math.round(p.data.precision),
    momento: ahora,
  })
  // Se guardan dos días de recorrido: alcanza para ver el de ayer y no crece sin fin.
  await tx
    .delete(posicionesTecnicos)
    .where(
      and(
        eq(posicionesTecnicos.tecnicoId, tecnicoId),
        sql`${posicionesTecnicos.momento} < ${new Date(ahora.getTime() - 2 * 86_400_000)}`,
      ),
    )
  return { ok: true as const, guardada: true }
}

// ---------------------------------------------------------------- Mapa y hoja de ruta

/** Órdenes del día (de todos o de un técnico) y las que esperan día, con su ubicación. */
async function ordenesConUbicacion(tx: Transaccion, fecha: string, tecnicoId?: string) {
  return tx
    .select({
      id: ordenesServicio.id,
      numero: ordenesServicio.numero,
      estado: ordenesServicio.estado,
      prioridad: ordenesServicio.prioridad,
      programada: ordenesServicio.programada,
      hora: ordenesServicio.hora,
      duracion: ordenesServicio.duracion,
      tecnicoId: ordenesServicio.tecnicoId,
      falla: ordenesServicio.falla,
      cliente: terceros.razonSocial,
      domicilio: sql<
        string | null
      >`coalesce(${ordenesServicio.domicilio}, nullif(concat_ws(', ', ${equipos.domicilio}, ${equipos.localidad}), ''))`,
      equipoId: ordenesServicio.equipoId,
      serie: equipos.serie,
      modelo: modelosEquipo.nombre,
      tipo: tiposOrden.nombre,
      color: tiposOrden.color,
      lat: sql<string | null>`coalesce(${ordenesServicio.lat}, ${equipos.lat})`,
      lng: sql<string | null>`coalesce(${ordenesServicio.lng}, ${equipos.lng})`,
      llegada: ordenesServicio.llegada,
      informada: ordenesServicio.informada,
    })
    .from(ordenesServicio)
    .innerJoin(terceros, eq(terceros.id, ordenesServicio.terceroId))
    .leftJoin(equipos, eq(equipos.id, ordenesServicio.equipoId))
    .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
    .leftJoin(tiposOrden, eq(tiposOrden.id, ordenesServicio.tipoOrdenId))
    .where(
      tecnicoId
        ? and(
            eq(ordenesServicio.tecnicoId, tecnicoId),
            eq(ordenesServicio.programada, fecha),
            sql`${ordenesServicio.estado} <> 'cancelada'`,
          )
        : or(
            and(eq(ordenesServicio.programada, fecha), sql`${ordenesServicio.estado} <> 'cancelada'`),
            inArray(ordenesServicio.estado, ['pendiente', 'proyectada']),
          ),
    )
    .orderBy(asc(ordenesServicio.hora), asc(ordenesServicio.numero))
}
export type OrdenMapa = Awaited<ReturnType<typeof ordenesConUbicacion>>[number]

export type Parada = OrdenMapa & {
  punto: Punto | null
  /** Hora estimada de llegada (la programada, o la que da el recorrido si no tiene). */
  llegaria: string | null
  viajeMinutos: number | null
  viajeKm: number | null
}

/**
 * Hoja de ruta de un técnico para un día: las visitas con hora van a esa
 * hora; las demás se ordenan para recorrer lo menos posible desde la
 * partida. Devuelve el viaje entre paradas y el enlace a Google Maps.
 */
export async function hojaDeRuta(tx: Transaccion, tecnicoId: string, fecha: string) {
  const [t] = await tx.select().from(tecnicos).where(eq(tecnicos.id, tecnicoId))
  if (!t) return null
  const lista = await ordenesConUbicacion(tx, fecha, tecnicoId)
  const partida = punto(t.partidaLat, t.partidaLng)
  const conHora = lista.filter((o) => o.hora).sort((a, b) => a.hora!.localeCompare(b.hora!))
  const sinHora = lista.filter((o) => !o.hora)
  // Las de sin hora se ordenan entre ellas (las sin ubicación van al final, en su orden).
  const ubicables = sinHora.filter((o) => punto(o.lat, o.lng))
  const ultimaFija = conHora.length ? punto(conHora.at(-1)!.lat, conHora.at(-1)!.lng) : null
  const orden = ordenarRuta(
    ultimaFija ?? partida,
    ubicables.map((o) => punto(o.lat, o.lng)!),
  )
  const secuencia = [...conHora, ...orden.map((i) => ubicables[i]), ...sinHora.filter((o) => !punto(o.lat, o.lng))]

  let reloj = aMinutos(t.jornadaDesde)
  let previo = partida
  let km = 0
  let minutos = 0
  const paradas: Parada[] = secuencia.map((o) => {
    const aqui = punto(o.lat, o.lng)
    const viaje = previo && aqui ? minutosDeViaje(previo, aqui) : null
    const distancia = previo && aqui ? Math.round(distanciaKm(previo, aqui) * FACTOR_CALLES * 10) / 10 : null
    if (viaje !== null) {
      minutos += viaje
      km += distancia ?? 0
    }
    const llegaria = o.hora ? aMinutos(o.hora) : reloj + (viaje ?? 0)
    reloj = Math.max(reloj, llegaria) + o.duracion
    if (aqui) previo = aqui
    return { ...o, punto: aqui, llegaria: aHora(llegaria), viajeMinutos: viaje, viajeKm: distancia }
  })
  return {
    tecnico: { id: t.id, nombre: t.nombre, partida: t.partida, punto: partida, jornadaDesde: t.jornadaDesde },
    paradas,
    km: Math.round(km * 10) / 10,
    minutos,
    enlace: enlaceRecorrido(
      partida,
      paradas.filter((p) => p.punto && !p.informada).map((p) => p.punto!),
    ),
  }
}

/** Todo lo del mapa de un día: órdenes, técnicos (con su última posición) y el recorrido de cada uno. */
export async function datosMapa(tx: Transaccion, fecha: string) {
  const [ordenes, lista] = await Promise.all([
    ordenesConUbicacion(tx, fecha),
    tx.select().from(tecnicos).where(eq(tecnicos.activo, true)).orderBy(asc(tecnicos.nombre)),
  ])
  const desde = new Date(Date.now() - 12 * 3600_000)
  const posiciones = lista.length
    ? await tx
        .selectDistinctOn([posicionesTecnicos.tecnicoId])
        .from(posicionesTecnicos)
        .where(
          and(
            inArray(
              posicionesTecnicos.tecnicoId,
              lista.map((t) => t.id),
            ),
            gte(posicionesTecnicos.momento, desde),
          ),
        )
        .orderBy(posicionesTecnicos.tecnicoId, desc(posicionesTecnicos.momento))
    : []
  const rutas = await Promise.all(
    lista
      .filter((t) => ordenes.some((o) => o.tecnicoId === t.id && o.programada === fecha))
      .map((t) => hojaDeRuta(tx, t.id, fecha)),
  )
  return {
    ordenes: ordenes.map((o) => ({ ...o, punto: punto(o.lat, o.lng) })),
    tecnicos: lista.map((t) => {
      const p = posiciones.find((x) => x.tecnicoId === t.id)
      return {
        id: t.id,
        nombre: t.nombre,
        partida: punto(t.partidaLat, t.partidaLng),
        partidaTexto: t.partida,
        posicion: p ? { ...punto(p.lat, p.lng)!, momento: p.momento, precision: p.precision } : null,
      }
    }),
    rutas: rutas.filter((r) => r !== null),
  }
}

/** Viaje (en minutos) desde cada visita programada del rango hasta un destino: para los huecos del asistente. */
export async function puntosProgramados(tx: Transaccion, ids: string[]) {
  if (!ids.length) return new Map<string, Punto>()
  const filas = await tx
    .select({
      id: ordenesServicio.id,
      lat: sql<string | null>`coalesce(${ordenesServicio.lat}, ${equipos.lat})`,
      lng: sql<string | null>`coalesce(${ordenesServicio.lng}, ${equipos.lng})`,
    })
    .from(ordenesServicio)
    .leftJoin(equipos, eq(equipos.id, ordenesServicio.equipoId))
    .where(inArray(ordenesServicio.id, ids))
  const m = new Map<string, Punto>()
  for (const f of filas) {
    const p = punto(f.lat, f.lng)
    if (p) m.set(f.id, p)
  }
  return m
}

/** Ubicación de una orden (la propia o la de su equipo). */
export async function puntoDeOrden(tx: Transaccion, id: string) {
  return (await puntosProgramados(tx, [id])).get(id) ?? null
}
