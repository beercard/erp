import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { equipos, eventosGeocerca, fichadas, ordenesServicio, posicionesTecnicos, tecnicos } from '../../db/schema'
import { hoyArgentina } from '../../lib/fechas'
import { obtenerConfiguracion } from './configuracion'
import { distanciaKm, punto, type Punto } from './mapa'

/**
 * Jornada del técnico (como la app de fichada de Persat) y geocercas: con
 * las posiciones que manda el celular se registra cuándo entró y salió del
 * lugar de cada orden del día, para compararlo con lo que marcó.
 */

/** Un día de Argentina (UTC−3, sin horario de verano) como rango de instantes. */
export const diaArgentina = (fecha: string) => ({
  desde: new Date(`${fecha}T00:00:00-03:00`),
  hasta: new Date(new Date(`${fecha}T00:00:00-03:00`).getTime() + 86_400_000),
})

const EsquemaFichada = z.object({
  tipo: z.enum(['entrada', 'salida']),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  precision: z.coerce.number().min(0).max(100_000).nullable().optional(),
})

export async function ultimaFichada(tx: Transaccion, tecnicoId: string) {
  const [f] = await tx.select().from(fichadas).where(eq(fichadas.tecnicoId, tecnicoId)).orderBy(desc(fichadas.momento)).limit(1)
  return f ?? null
}

/** En jornada: la última fichada es una entrada de hoy (o de hace menos de 16 horas). */
export async function estadoJornada(tx: Transaccion, tecnicoId: string, ahora = new Date()) {
  const f = await ultimaFichada(tx, tecnicoId)
  const enJornada = !!f && f.tipo === 'entrada' && ahora.getTime() - f.momento.getTime() < 16 * 3600_000
  return { enJornada, desde: enJornada ? f!.momento : null, ultima: f }
}

/** Ficha la entrada o la salida de la jornada. */
export async function fichar(tx: Transaccion, usuarioId: string, tecnicoId: string, entrada: unknown, ahora = new Date()) {
  const p = EsquemaFichada.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: 'Fichada inválida.' }
  const d = p.data
  const { enJornada } = await estadoJornada(tx, tecnicoId, ahora)
  if (d.tipo === 'entrada' && enJornada) return { ok: false as const, error: 'Ya empezaste la jornada.' }
  if (d.tipo === 'salida' && !enJornada) return { ok: false as const, error: 'No empezaste la jornada.' }
  const conUbicacion = d.lat != null && d.lng != null
  await tx.insert(fichadas).values({
    tecnicoId,
    tipo: d.tipo,
    momento: ahora,
    lat: conUbicacion ? d.lat!.toFixed(6) : null,
    lng: conUbicacion ? d.lng!.toFixed(6) : null,
    precision: d.precision == null ? null : Math.round(d.precision),
    usuarioId,
  })
  return { ok: true as const, momento: ahora }
}

/**
 * Con una posición nueva del técnico: si entró al radio de una orden suya del
 * día, registra la entrada; si se alejó (con margen, para que el GPS no
 * rebote), la salida con los minutos que estuvo.
 */
export async function detectarGeocercas(tx: Transaccion, tecnicoId: string, aqui: Punto, ahora = new Date()) {
  const config = await obtenerConfiguracion(tx)
  const radio = (config.radioGeocerca ?? 150) / 1000
  const ordenes = await tx
    .select({
      id: ordenesServicio.id,
      lat: sql<string | null>`coalesce(${ordenesServicio.lat}, ${equipos.lat})`,
      lng: sql<string | null>`coalesce(${ordenesServicio.lng}, ${equipos.lng})`,
    })
    .from(ordenesServicio)
    .leftJoin(equipos, eq(equipos.id, ordenesServicio.equipoId))
    .where(
      and(
        eq(ordenesServicio.tecnicoId, tecnicoId),
        eq(ordenesServicio.programada, hoyArgentina(ahora)),
        sql`${ordenesServicio.estado} <> 'cancelada'`,
      ),
    )
  const conLugar = ordenes.map((o) => ({ id: o.id, punto: punto(o.lat, o.lng) })).filter((o) => o.punto)
  if (!conLugar.length) return []
  const ultimos = await tx
    .selectDistinctOn([eventosGeocerca.ordenId])
    .from(eventosGeocerca)
    .where(
      and(
        eq(eventosGeocerca.tecnicoId, tecnicoId),
        inArray(
          eventosGeocerca.ordenId,
          conLugar.map((o) => o.id),
        ),
      ),
    )
    .orderBy(eventosGeocerca.ordenId, desc(eventosGeocerca.momento))
  const nuevos: { ordenId: string; tipo: 'entrada' | 'salida'; minutos: number | null }[] = []
  for (const o of conLugar) {
    const d = distanciaKm(aqui, o.punto!)
    const ultimo = ultimos.find((u) => u.ordenId === o.id)
    const adentro = ultimo?.tipo === 'entrada'
    if (!adentro && d <= radio) nuevos.push({ ordenId: o.id, tipo: 'entrada', minutos: null })
    else if (adentro && d > radio * 1.5)
      nuevos.push({ ordenId: o.id, tipo: 'salida', minutos: Math.round((ahora.getTime() - ultimo!.momento.getTime()) / 60_000) })
  }
  if (nuevos.length) await tx.insert(eventosGeocerca).values(nuevos.map((n) => ({ ...n, tecnicoId, momento: ahora })))
  return nuevos
}

/** Lo que dice el GPS de una orden: cuándo entró y salió el técnico del lugar. */
export async function geocercaDeOrden(tx: Transaccion, ordenId: string) {
  return tx
    .select({ tipo: eventosGeocerca.tipo, momento: eventosGeocerca.momento, minutos: eventosGeocerca.minutos })
    .from(eventosGeocerca)
    .where(eq(eventosGeocerca.ordenId, ordenId))
    .orderBy(asc(eventosGeocerca.momento))
}

/** Kilómetros recorridos sumando las posiciones (sin los saltos imposibles del GPS). */
export function kmRecorridos(puntos: (Punto & { momento: Date })[]) {
  let km = 0
  for (let i = 1; i < puntos.length; i++) {
    const d = distanciaKm(puntos[i - 1], puntos[i])
    const horas = Math.max((puntos[i].momento.getTime() - puntos[i - 1].momento.getTime()) / 3600_000, 1 / 3600)
    if (d / horas < 150) km += d
  }
  return Math.round(km * 10) / 10
}

/** El recorrido de un técnico en un día (las posiciones en orden). */
export async function recorrido(tx: Transaccion, tecnicoId: string, fecha: string) {
  const { desde, hasta } = diaArgentina(fecha)
  const filas = await tx
    .select({ lat: posicionesTecnicos.lat, lng: posicionesTecnicos.lng, momento: posicionesTecnicos.momento })
    .from(posicionesTecnicos)
    .where(
      and(
        eq(posicionesTecnicos.tecnicoId, tecnicoId),
        gte(posicionesTecnicos.momento, desde),
        lt(posicionesTecnicos.momento, hasta),
      ),
    )
    .orderBy(asc(posicionesTecnicos.momento))
  return filas.map((f) => ({ ...punto(f.lat, f.lng)!, momento: f.momento }))
}

/** Jornadas de los técnicos en un rango de días: entrada, salida, horas, km y visitas. */
export async function jornadas(tx: Transaccion, desdeFecha: string, hastaFecha: string) {
  const desde = diaArgentina(desdeFecha).desde
  const hasta = diaArgentina(hastaFecha).hasta
  const [lista, fs, ps, visitas, geo] = await Promise.all([
    tx.select({ id: tecnicos.id, nombre: tecnicos.nombre }).from(tecnicos).orderBy(asc(tecnicos.nombre)),
    tx
      .select()
      .from(fichadas)
      .where(and(gte(fichadas.momento, desde), lt(fichadas.momento, hasta)))
      .orderBy(asc(fichadas.momento)),
    tx
      .select({
        tecnicoId: posicionesTecnicos.tecnicoId,
        lat: posicionesTecnicos.lat,
        lng: posicionesTecnicos.lng,
        momento: posicionesTecnicos.momento,
      })
      .from(posicionesTecnicos)
      .where(and(gte(posicionesTecnicos.momento, desde), lt(posicionesTecnicos.momento, hasta)))
      .orderBy(asc(posicionesTecnicos.momento)),
    tx
      .select({ tecnicoId: ordenesServicio.tecnicoId, fecha: ordenesServicio.programada, informada: ordenesServicio.informada })
      .from(ordenesServicio)
      .where(
        and(
          gte(ordenesServicio.programada, desdeFecha),
          sql`${ordenesServicio.programada} <= ${hastaFecha}`,
          sql`${ordenesServicio.estado} <> 'cancelada'`,
        ),
      ),
    tx
      .select({ tecnicoId: eventosGeocerca.tecnicoId, minutos: eventosGeocerca.minutos, momento: eventosGeocerca.momento })
      .from(eventosGeocerca)
      .where(and(eq(eventosGeocerca.tipo, 'salida'), gte(eventosGeocerca.momento, desde), lt(eventosGeocerca.momento, hasta))),
  ])
  const diaDe = (d: Date) => hoyArgentina(d)
  const filas: {
    tecnicoId: string
    tecnico: string
    fecha: string
    entrada: Date | null
    salida: Date | null
    minutos: number | null
    km: number
    visitas: number
    hechas: number
    minutosEnClientes: number
  }[] = []
  for (const t of lista) {
    const dias = new Set([
      ...fs.filter((f) => f.tecnicoId === t.id).map((f) => diaDe(f.momento)),
      ...ps.filter((p) => p.tecnicoId === t.id).map((p) => diaDe(p.momento)),
      ...visitas.filter((v) => v.tecnicoId === t.id && v.fecha).map((v) => v.fecha!),
    ])
    for (const fecha of [...dias].sort().reverse()) {
      const delDia = fs.filter((f) => f.tecnicoId === t.id && diaDe(f.momento) === fecha)
      const entrada = delDia.find((f) => f.tipo === 'entrada')?.momento ?? null
      const salida = [...delDia].reverse().find((f) => f.tipo === 'salida')?.momento ?? null
      // Horas trabajadas: la suma de cada tramo entrada → salida.
      let minutos: number | null = null
      for (let i = 0; i < delDia.length; i++) {
        if (delDia[i].tipo !== 'entrada') continue
        const fin = delDia.slice(i + 1).find((f) => f.tipo === 'salida')
        if (fin) minutos = (minutos ?? 0) + Math.round((fin.momento.getTime() - delDia[i].momento.getTime()) / 60_000)
      }
      const puntos = ps
        .filter((p) => p.tecnicoId === t.id && diaDe(p.momento) === fecha)
        .map((p) => ({ ...punto(p.lat, p.lng)!, momento: p.momento }))
      const v = visitas.filter((x) => x.tecnicoId === t.id && x.fecha === fecha)
      filas.push({
        tecnicoId: t.id,
        tecnico: t.nombre,
        fecha,
        entrada,
        salida,
        minutos,
        km: kmRecorridos(puntos),
        visitas: v.length,
        hechas: v.filter((x) => x.informada).length,
        minutosEnClientes: geo
          .filter((g) => g.tecnicoId === t.id && diaDe(g.momento) === fecha)
          .reduce((s, g) => s + (g.minutos ?? 0), 0),
      })
    }
  }
  return filas.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.tecnico.localeCompare(b.tecnico))
}
