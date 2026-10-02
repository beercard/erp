import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { equipos, modelosEquipo, ordenesServicio, tecnicos, terceros, tiposOrden } from '../../db/schema'
import { hoyArgentina } from '../../lib/fechas'
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
}

/**
 * Busca los mejores huecos para una orden en los próximos días: dentro de la
 * jornada de cada técnico, sin pisar sus visitas programadas. Mejor cuanto
 * antes y cuanto menos cargado esté el técnico ese día.
 * (Persat además tiene en cuenta el viaje desde el punto de partida; acá no
 * hay coordenadas todavía: queda para cuando se sumen los mapas.)
 */
export async function buscarHuecos(
  tx: Transaccion,
  o: { duracion: number; desde?: string; dias?: number; tecnicoIds?: string[]; excluirOrdenId?: string },
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
  const programadas = await tx
    .select({
      id: ordenesServicio.id,
      tecnicoId: ordenesServicio.tecnicoId,
      programada: ordenesServicio.programada,
      hora: ordenesServicio.hora,
      duracion: ordenesServicio.duracion,
    })
    .from(ordenesServicio)
    .where(
      and(
        inArray(
          ordenesServicio.tecnicoId,
          lista.map((t) => t.id),
        ),
        gte(ordenesServicio.programada, desde),
        lte(ordenesServicio.programada, hasta),
        inArray(ordenesServicio.estado, ['asignada', 'vencida', 'informe']),
        o.excluirOrdenId ? ne(ordenesServicio.id, o.excluirOrdenId) : undefined,
      ),
    )
  const huecos: Hueco[] = []
  for (let n = 0; n < dias; n++) {
    const fecha = sumarDias(desde, n)
    for (const t of lista) {
      if (!t.dias.includes(String(diaSemana(fecha)))) continue
      const jornada = { desde: aMinutos(t.jornadaDesde), hasta: aMinutos(t.jornadaHasta) }
      const delDia = programadas.filter((p) => p.tecnicoId === t.id && p.programada === fecha)
      // Una visita sin hora ocupa el principio de la jornada.
      const ocupados = delDia.map((p) => {
        const inicio = p.hora ? aMinutos(p.hora) : jornada.desde
        return { inicio, fin: inicio + p.duracion }
      })
      const carga = delDia.reduce((s, p) => s + p.duracion, 0)
      // Hoy, desde ahora redondeado al cuarto de hora siguiente.
      const minimo = fecha === hoy ? Math.ceil((minutoArgentina(ahora) + 1) / 15) * 15 : 0
      const libre = huecosLibres(jornada, ocupados, o.duracion, minimo)[0]
      if (!libre) continue
      const ocupacion = carga / Math.max(1, jornada.hasta - jornada.desde)
      const estrellas = Math.max(1, Math.min(5, 5 - n - (ocupacion > 0.75 ? 2 : ocupacion > 0.4 ? 1 : 0)))
      huecos.push({
        tecnicoId: t.id,
        tecnico: t.nombre,
        fecha,
        hora: aHora(libre.inicio),
        hasta: aHora(libre.fin),
        estrellas,
        carga,
      })
    }
  }
  return huecos.sort((a, b) => b.estrellas - a.estrellas || a.fecha.localeCompare(b.fecha) || a.carga - b.carga).slice(0, 12)
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
  return { programadas, pendientes, tecnicos: lista }
}

export type OrdenCalendario = Awaited<ReturnType<typeof calendario>>['programadas'][number]
