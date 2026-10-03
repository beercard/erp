import { and, asc, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import {
  alertasZona,
  equipos,
  ordenesServicio,
  posicionesTecnicos,
  tecnicos,
  tecnicosZonas,
  terceros,
  zonasTrabajo,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { emailValido, encolarCorreo } from '../comunicaciones/correo'
import { obtenerConfiguracion } from './configuracion'
import { diaArgentina, estadoJornada, kmRecorridos } from './jornada'
import { distanciaKm, punto, type Punto } from './mapa'

/**
 * Zonas de trabajo de los técnicos y visitas detectadas por GPS (como las
 * de Persat).
 *
 * - Zona: un centro y un radio. Si en jornada el técnico sale de todas sus
 *   zonas, queda una alerta (y se avisa a coordinación); al volver, otra.
 *   Sin zonas asignadas no se controla nada.
 * - Visitas detectadas: con las posiciones del día, cada vez que el técnico
 *   se quedó al menos 5 minutos a menos de 150 m de un equipo instalado de
 *   un cliente (o del lugar de una de sus órdenes), es una visita a ese
 *   cliente, tenga orden o no.
 */

const Esquema = z.object({
  nombre: z.string().trim().min(2, { error: 'Escribí el nombre de la zona.' }).max(60),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radioKm: z.coerce.number().gt(0, { error: 'El radio tiene que ser mayor que cero.' }).max(500),
  activa: z.boolean().default(true),
})

export async function guardarZona(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string) {
  const p = Esquema.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Datos inválidos.' }
  const d = { ...p.data, lat: p.data.lat.toFixed(6), lng: p.data.lng.toFixed(6), radioKm: p.data.radioKm.toFixed(2) }
  const [repetida] = await tx.select({ id: zonasTrabajo.id }).from(zonasTrabajo).where(eq(zonasTrabajo.nombre, d.nombre))
  if (repetida && repetida.id !== id) return { ok: false as const, error: 'Ya hay una zona con ese nombre.' }
  const [zona] = id
    ? await tx.update(zonasTrabajo).set(d).where(eq(zonasTrabajo.id, id)).returning({ id: zonasTrabajo.id })
    : await tx.insert(zonasTrabajo).values(d).returning({ id: zonasTrabajo.id })
  if (!zona) return { ok: false as const, error: 'Esa zona ya no existe.' }
  await auditar(tx, { usuarioId, accion: id ? 'modificacion' : 'alta', entidad: 'zona_trabajo', entidadId: zona.id, despues: d })
  return { ok: true as const, id: zona.id }
}

export async function borrarZona(tx: Transaccion, usuarioId: string, id: string) {
  const [z0] = await tx.delete(zonasTrabajo).where(eq(zonasTrabajo.id, id)).returning()
  if (!z0) return { ok: false as const, error: 'Esa zona ya no existe.' }
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'zona_trabajo', entidadId: id, antes: z0 })
  return { ok: true as const }
}

/** Deja al técnico con exactamente esas zonas. */
export async function asignarZonas(tx: Transaccion, usuarioId: string, tecnicoId: string, zonaIds: string[]) {
  const ids = [...new Set(zonaIds.filter((x) => /^[0-9a-f-]{36}$/i.test(x)))]
  const [t] = await tx.select({ id: tecnicos.id }).from(tecnicos).where(eq(tecnicos.id, tecnicoId))
  if (!t) return { ok: false as const, error: 'Ese técnico ya no existe.' }
  if (ids.length) {
    const validas = await tx.select({ id: zonasTrabajo.id }).from(zonasTrabajo).where(inArray(zonasTrabajo.id, ids))
    if (validas.length !== ids.length) return { ok: false as const, error: 'Alguna de las zonas ya no existe.' }
  }
  await tx.delete(tecnicosZonas).where(eq(tecnicosZonas.tecnicoId, tecnicoId))
  if (ids.length) await tx.insert(tecnicosZonas).values(ids.map((zonaId) => ({ tecnicoId, zonaId })))
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'tecnico', entidadId: tecnicoId, despues: { zonas: ids } })
  return { ok: true as const }
}

export async function listarZonas(tx: Transaccion) {
  const [zonas, asignaciones] = await Promise.all([
    tx.select().from(zonasTrabajo).orderBy(asc(zonasTrabajo.nombre)),
    tx.select().from(tecnicosZonas),
  ])
  return zonas.map((zz) => ({
    ...zz,
    lat: Number(zz.lat),
    lng: Number(zz.lng),
    radioKm: Number(zz.radioKm),
    tecnicos: asignaciones.filter((a) => a.zonaId === zz.id).map((a) => a.tecnicoId),
  }))
}

// ---------------------------------------------------------------- Control al recibir cada posición

export const dentroDeAlguna = (p: Punto, zonas: { lat: number; lng: number; radioKm: number }[]) =>
  zonas.some((zz) => distanciaKm(p, zz) <= zz.radioKm)

/**
 * Con una posición nueva: si el técnico tiene zonas, está en jornada y pasó
 * de adentro a afuera (o al revés), registra la alerta. Al salir avisa a
 * coordinación por email (una vez por salida).
 */
export async function controlarZona(tx: Transaccion, tecnicoId: string, aqui: Punto, ahora = new Date()) {
  const zonas = await tx
    .select({ nombre: zonasTrabajo.nombre, lat: zonasTrabajo.lat, lng: zonasTrabajo.lng, radioKm: zonasTrabajo.radioKm })
    .from(tecnicosZonas)
    .innerJoin(zonasTrabajo, eq(zonasTrabajo.id, tecnicosZonas.zonaId))
    .where(and(eq(tecnicosZonas.tecnicoId, tecnicoId), eq(zonasTrabajo.activa, true)))
  if (!zonas.length) return null
  if (!(await estadoJornada(tx, tecnicoId, ahora)).enJornada) return null
  const dentro = dentroDeAlguna(
    aqui,
    zonas.map((zz) => ({ lat: Number(zz.lat), lng: Number(zz.lng), radioKm: Number(zz.radioKm) })),
  )
  const [ultima] = await tx
    .select({ tipo: alertasZona.tipo })
    .from(alertasZona)
    .where(eq(alertasZona.tecnicoId, tecnicoId))
    .orderBy(desc(alertasZona.momento))
    .limit(1)
  const estabaAfuera = ultima?.tipo === 'salida'
  if (dentro === !estabaAfuera) return null
  const tipo = dentro ? 'entrada' : 'salida'
  await tx.insert(alertasZona).values({ tecnicoId, tipo, momento: ahora, lat: aqui.lat.toFixed(6), lng: aqui.lng.toFixed(6) })
  if (tipo === 'salida') {
    const config = await obtenerConfiguracion(tx)
    const [t] = await tx.select({ nombre: tecnicos.nombre }).from(tecnicos).where(eq(tecnicos.id, tecnicoId))
    if (emailValido(config.emailCoordinacion))
      await encolarCorreo(tx, {
        para: config.emailCoordinacion!,
        asunto: `${t?.nombre ?? 'Un técnico'} salió de su zona de trabajo`,
        texto:
          `${t?.nombre ?? 'Un técnico'} salió de sus zonas (${zonas.map((zz) => zz.nombre).join(', ')}) a las ` +
          `${ahora.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', timeStyle: 'short' })}.\n` +
          `Dónde está: https://www.google.com/maps?q=${aqui.lat.toFixed(6)},${aqui.lng.toFixed(6)}`,
        entidad: 'alerta_zona',
      })
  }
  return tipo
}

// ---------------------------------------------------------------- Visitas detectadas

export type Lugar = Punto & { terceroId: string; cliente: string }
export type Visita = { terceroId: string; cliente: string; desde: Date; hasta: Date; minutos: number }

/**
 * Estadías en lugares de clientes: posiciones seguidas a menos de `radioKm`
 * de un mismo cliente que suman al menos `minimo` minutos. Un hueco de más de
 * 20 minutos sin posiciones corta la estadía.
 */
export function detectarVisitas(
  posiciones: (Punto & { momento: Date })[],
  lugares: Lugar[],
  o: { radioKm?: number; minimo?: number } = {},
): Visita[] {
  const radio = o.radioKm ?? 0.15
  const minimo = o.minimo ?? 5
  const cercano = (p: Punto) => {
    let mejor: Lugar | null = null
    let d = radio
    for (const l of lugares) {
      const x = distanciaKm(p, l)
      if (x <= d) [mejor, d] = [l, x]
    }
    return mejor
  }
  const visitas: Visita[] = []
  let actual: Visita | null = null
  const cerrar = () => {
    if (actual && actual.minutos >= minimo) visitas.push(actual)
    actual = null
  }
  for (const p of [...posiciones].sort((a, b) => a.momento.getTime() - b.momento.getTime())) {
    const l = cercano(p)
    const seguida: boolean = !!actual && p.momento.getTime() - actual.hasta.getTime() <= 20 * 60_000
    if (l && actual && actual.terceroId === l.terceroId && seguida) {
      actual.hasta = p.momento
      actual.minutos = Math.round((actual.hasta.getTime() - actual.desde.getTime()) / 60_000)
    } else {
      cerrar()
      if (l) actual = { terceroId: l.terceroId, cliente: l.cliente, desde: p.momento, hasta: p.momento, minutos: 0 }
    }
  }
  cerrar()
  return visitas
}

/** Un día de un técnico: recorrido, visitas detectadas (con o sin orden) y alertas de zona. */
export async function diaDelTecnico(tx: Transaccion, tecnicoId: string, fecha: string) {
  const { desde, hasta } = diaArgentina(fecha)
  const [posiciones, alertas, ordenes, instalados] = await Promise.all([
    tx
      .select({ lat: posicionesTecnicos.lat, lng: posicionesTecnicos.lng, momento: posicionesTecnicos.momento })
      .from(posicionesTecnicos)
      .where(
        and(
          eq(posicionesTecnicos.tecnicoId, tecnicoId),
          gte(posicionesTecnicos.momento, desde),
          lt(posicionesTecnicos.momento, hasta),
        ),
      )
      .orderBy(asc(posicionesTecnicos.momento)),
    tx
      .select()
      .from(alertasZona)
      .where(and(eq(alertasZona.tecnicoId, tecnicoId), gte(alertasZona.momento, desde), lt(alertasZona.momento, hasta)))
      .orderBy(asc(alertasZona.momento)),
    tx
      .select({
        id: ordenesServicio.id,
        numero: ordenesServicio.numero,
        terceroId: ordenesServicio.terceroId,
        cliente: terceros.razonSocial,
        lat: ordenesServicio.lat,
        lng: ordenesServicio.lng,
      })
      .from(ordenesServicio)
      .innerJoin(terceros, eq(terceros.id, ordenesServicio.terceroId))
      .where(and(eq(ordenesServicio.tecnicoId, tecnicoId), eq(ordenesServicio.programada, fecha))),
    tx
      .select({ terceroId: equipos.terceroId, cliente: terceros.razonSocial, lat: equipos.lat, lng: equipos.lng })
      .from(equipos)
      .innerJoin(terceros, eq(terceros.id, equipos.terceroId))
      .where(and(eq(equipos.estado, 'instalado'), isNotNull(equipos.lat), isNotNull(equipos.lng))),
  ])
  const puntos = posiciones.map((p) => ({ ...punto(p.lat, p.lng)!, momento: p.momento }))
  const lugares: Lugar[] = [...instalados, ...ordenes]
    .map((l) => ({ p: punto(l.lat, l.lng), terceroId: l.terceroId!, cliente: l.cliente }))
    .filter((l): l is { p: Punto; terceroId: string; cliente: string } => !!l.p && !!l.terceroId)
    .map((l) => ({ ...l.p, terceroId: l.terceroId, cliente: l.cliente }))
  const visitas = detectarVisitas(puntos, lugares).map((v) => ({
    ...v,
    ordenes: ordenes.filter((o) => o.terceroId === v.terceroId).map((o) => ({ id: o.id, numero: o.numero })),
  }))
  return { km: kmRecorridos(puntos), posiciones: puntos.length, visitas, alertas, ordenes }
}
