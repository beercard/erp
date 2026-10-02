import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { equipos, modelosEquipo, ordenesServicio, ordenesServicioTecnicos, tecnicos, terceros, tiposOrden } from '../../db/schema'
import { hoyArgentina } from '../../lib/fechas'
import { acompanantesDe, etiquetasDeOrdenes } from './etiquetas'
import { minutosDeViaje, punto, puntosProgramados, type Punto } from './mapa'
import { aHora, aMinutos } from './tipos'

/**
 * Agenda del servicio técnico: el calendario de coordinación (una fila por
 * técnico, como Persat) y el asistente que busca huecos libres en las
 * jornadas de los técnicos para una orden.
 */

/** Día de la semana de "AAAA-MM-DD": 1 = lunes … 7 = domingo. */
export function diaSemana(fecha: string) {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d
}

export function sumarDias(fecha: string, n: number) {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Lunes de la semana de una fecha. */
export const lunesDe = (fecha: string) => sumarDias(fecha, 1 - diaSemana(fecha))

/** Minutos desde las 00:00 en Argentina (UTC−3), para no ofrecer huecos que ya pasaron hoy. */
export function minutoArgentina(ahora = new Date()) {
  const m = (ahora.getUTCHours() * 60 + ahora.getUTCMinutes() - 180 + 1440) % 1440
  return m
}

/**
 * Intervalos libres de una jornada, en minutos: lo que queda entre las visitas
 * ya programadas. Solo los que alcanzan para la duración pedida.
 */
export function huecosLibres(
  jornada: { desde: number; hasta: number },
  ocupados: { inicio: number; fin: number }[],
  duracion: number,
  desde = 0,
): { inicio: number; fin: number }[] {
  const libres: { inicio: number; fin: number }[] = []
  let cursor = Math.max(jornada.desde, desde)
  for (const o of [...ocupados].sort((a, b) => a.inicio - b.inicio)) {
    if (o.fin <= cursor) continue
    if (o.inicio - cursor >= duracion) libres.push({ inicio: cursor, fin: o.inicio })
    cursor = Math.max(cursor, o.fin)
    if (cursor >= jornada.hasta) break
  }
  if (jornada.hasta - cursor >= duracion) libres.push({ inicio: cursor, fin: jornada.hasta })
  return libres
}

export type Hueco = {
  tecnicoId: string
  tecnico: string
  fecha: string
  hora: string
  /** Libre hasta (para mostrar). */
  hasta: string
  /** 1 a 5: antes y con el técnico menos cargado es mejor. */
  estrellas: number
  /** Minutos ya ocupados ese día. */
  carga: number
  /** Minutos de viaje hasta la orden desde la visita anterior (o la partida); null sin ubicaciones. */
  viaje: number | null
}

/**
 * Busca los mejores huecos para una orden en los próximos días: dentro de la
 * jornada de cada técnico, sin pisar sus visitas programadas. Mejor cuanto
 * antes y cuanto menos cargado esté el técnico ese día.
 * Con la ubicación de la orden, como Persat, suma el viaje: desde la partida
 * del técnico o la visita anterior hasta la orden, y de ahí a la siguiente.
 */
export async function buscarHuecos(
  tx: Transaccion,
  o: {
    duracion: number
    desde?: string
    dias?: number
    tecnicoIds?: string[]
    excluirOrdenId?: string
    /** Dónde es la orden: para sumar el viaje. */
    destino?: Punto | null
  },
  ahora = new Date(),
): Promise<Hueco[]> {
  const hoy = hoyArgentina(ahora)
  const desde = o.desde && o.desde > hoy ? o.desde : hoy
  const dias = o.dias ?? 7
  const hasta = sumarDias(desde, dias - 1)
  const lista = await tx
    .select()
    .from(tecnicos)
    .where(and(eq(tecnicos.activo, true), o.tecnicoIds?.length ? inArray(tecnicos.id, o.tecnicoIds) : undefined))
    .orderBy(asc(tecnicos.nombre))
  if (!lista.length) return []
  const columnas = {
    id: ordenesServicio.id,
    programada: ordenesServicio.programada,
    hora: ordenesServicio.hora,
    duracion: ordenesServicio.duracion,
  }
  const filtro = and(
    gte(ordenesServicio.programada, desde),
    lte(ordenesServicio.programada, hasta),
    inArray(ordenesServicio.estado, ['asignada', 'vencida', 'informe']),
    o.excluirOrdenId ? ne(ordenesServicio.id, o.excluirOrdenId) : undefined,
  )
  const ids = lista.map((t) => t.id)
  // Ocupan al responsable y a los acompañantes.
  const [propias, acompanadas] = await Promise.all([
    tx
      .select({ ...columnas, tecnicoId: ordenesServicio.tecnicoId })
      .from(ordenesServicio)
      .where(and(inArray(ordenesServicio.tecnicoId, ids), filtro)),
    tx
      .select({ ...columnas, tecnicoId: ordenesServicioTecnicos.tecnicoId })
      .from(ordenesServicioTecnicos)
      .innerJoin(ordenesServicio, eq(ordenesServicio.id, ordenesServicioTecnicos.ordenId))
      .where(and(inArray(ordenesServicioTecnicos.tecnicoId, ids), filtro)),
  ])
  const programadas = [...propias, ...acompanadas]
  const puntos = o.destino ? await puntosProgramados(tx, [...new Set(programadas.map((p) => p.id))]) : new Map<string, Punto>()
  const viajeDesde = (p: Punto | null | undefined) => (o.destino && p ? minutosDeViaje(p, o.destino) : null)
  const huecos: Hueco[] = []
  for (let n = 0; n < dias; n++) {
    const fecha = sumarDias(desde, n)
    for (const t of lista) {
      if (!t.dias.includes(String(diaSemana(fecha)))) continue
      const jornada = { desde: aMinutos(t.jornadaDesde), hasta: aMinutos(t.jornadaHasta) }
      const delDia = programadas.filter((p) => p.tecnicoId === t.id && p.programada === fecha)
      // Una visita sin hora ocupa el principio de la jornada.
      // Con viaje: cada visita "ocupa" también el ir y volver desde la orden.
      const ocupados = delDia.map((p) => {
        const inicio = p.hora ? aMinutos(p.hora) : jornada.desde
        const viaje = viajeDesde(puntos.get(p.id)) ?? 0
        return { inicio: inicio - viaje, fin: inicio + p.duracion + viaje, real: inicio + p.duracion, punto: puntos.get(p.id) }
      })
      const partida = punto(t.partidaLat, t.partidaLng)
      const desdePartida = viajeDesde(partida) ?? 0
      const carga = delDia.reduce((s, p) => s + p.duracion, 0)
      // Hoy, desde ahora redondeado al cuarto de hora siguiente.
      const minimo = fecha === hoy ? Math.ceil((minutoArgentina(ahora) + 1) / 15) * 15 : 0
      const libre = huecosLibres(jornada, ocupados, o.duracion, Math.max(minimo, jornada.desde + desdePartida))[0]
      if (!libre) continue
      // De dónde sale: la última visita que termina antes del hueco, o la partida.
      const anterior = ocupados.filter((x) => x.fin <= libre.inicio).sort((a, b) => b.real - a.real)[0]
      const viaje = anterior ? viajeDesde(anterior.punto) : viajeDesde(partida)
      const ocupacion = carga / Math.max(1, jornada.hasta - jornada.desde)
      const lejos = viaje !== null && viaje > 45 ? 1 : 0
      const estrellas = Math.max(1, Math.min(5, 5 - n - (ocupacion > 0.75 ? 2 : ocupacion > 0.4 ? 1 : 0) - lejos))
      huecos.push({
        tecnicoId: t.id,
        tecnico: t.nombre,
        fecha,
        hora: aHora(libre.inicio),
        hasta: aHora(libre.fin),
        estrellas,
        carga,
        viaje,
      })
    }
  }
  return huecos
    .sort(
      (a, b) =>
        b.estrellas - a.estrellas || a.fecha.localeCompare(b.fecha) || (a.viaje ?? 0) - (b.viaje ?? 0) || a.carga - b.carga,
    )
    .slice(0, 12)
}

/**
 * Calendario de coordinación de una semana (o un día): las órdenes
 * programadas en el rango, las que esperan día (pendientes) y los técnicos.
 */
export async function calendario(tx: Transaccion, desde: string, hasta: string) {
  const columnas = {
    id: ordenesServicio.id,
    numero: ordenesServicio.numero,
    estado: ordenesServicio.estado,
    prioridad: ordenesServicio.prioridad,
    programada: ordenesServicio.programada,
    hora: ordenesServicio.hora,
    duracion: ordenesServicio.duracion,
    tecnicoId: ordenesServicio.tecnicoId,
    falla: ordenesServicio.falla,
    fecha: ordenesServicio.fecha,
    cliente: terceros.razonSocial,
    domicilio: ordenesServicio.domicilio,
    serie: equipos.serie,
    modelo: modelosEquipo.nombre,
    tipoOrden: tiposOrden.nombre,
    color: tiposOrden.color,
  }
  const base = () =>
    tx
      .select(columnas)
      .from(ordenesServicio)
      .innerJoin(terceros, eq(terceros.id, ordenesServicio.terceroId))
      .leftJoin(equipos, eq(equipos.id, ordenesServicio.equipoId))
      .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
      .leftJoin(tiposOrden, eq(tiposOrden.id, ordenesServicio.tipoOrdenId))
  const [programadas, pendientes, lista] = await Promise.all([
    base()
      .where(
        and(
          gte(ordenesServicio.programada, desde),
          lte(ordenesServicio.programada, hasta),
          ne(ordenesServicio.estado, 'cancelada'),
        ),
      )
      .orderBy(asc(ordenesServicio.programada), sql`${ordenesServicio.hora} nulls first`, asc(ordenesServicio.numero)),
    base()
      .where(and(eq(ordenesServicio.estado, 'pendiente'), isNull(ordenesServicio.programada)))
      .orderBy(sql`case when ${ordenesServicio.prioridad} = 'urgente' then 0 else 1 end`, asc(ordenesServicio.numero))
      .limit(200),
    tx
      .select({
        id: tecnicos.id,
        nombre: tecnicos.nombre,
        jornadaDesde: tecnicos.jornadaDesde,
        jornadaHasta: tecnicos.jornadaHasta,
        dias: tecnicos.dias,
      })
      .from(tecnicos)
      .where(eq(tecnicos.activo, true))
      .orderBy(asc(tecnicos.nombre)),
  ])
  const ids = [...programadas, ...pendientes].map((o) => o.id)
  const [etiquetas, acompanantes] = await Promise.all([etiquetasDeOrdenes(tx, ids), acompanantesDe(tx, ids)])
  const con = <T extends { id: string }>(o: T) => ({
    ...o,
    etiquetas: etiquetas.get(o.id) ?? [],
    acompanantes: acompanantes.get(o.id) ?? [],
  })
  return { programadas: programadas.map(con), pendientes: pendientes.map(con), tecnicos: lista }
}

export type OrdenCalendario = Awaited<ReturnType<typeof calendario>>['programadas'][number]
