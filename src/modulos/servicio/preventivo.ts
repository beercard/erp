import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import {
  equipos,
  lecturas,
  modelosEquipo,
  ordenesServicio,
  reglasPreventivo,
  tecnicos,
  terceros,
  tiposOrden,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { hoyArgentina } from '../../lib/fechas'
import { opcionalUuid, primerError } from '../comercial/documentos'
import { sumarDias } from './agenda'
import { guardarOrden } from './servicio'
import { ABIERTAS } from './tipos'

/**
 * Mantenimiento preventivo. Como las "OT repetitivas" de Persat (cada N
 * semanas o meses, desde una fecha y hora), pero por equipo además de por
 * cliente, y también por copias: cuando el contador del equipo avanza N
 * copias desde el último preventivo, se abre la orden. Persat no tiene esto:
 * no lleva lecturas.
 */

export { FRECUENCIAS } from './tipos'

const EsquemaRegla = z.object({
  terceroId: z.uuid({ error: 'Elegí el cliente.' }),
  equipoId: opcionalUuid,
  tipoOrdenId: z.uuid({ error: 'Elegí el tipo de orden.' }),
  frecuencia: z.enum(['semanal', 'mensual', 'copias']),
  cada: z.coerce.number().int().min(1, { error: 'Escribí cada cuánto.' }).max(10_000_000),
  desde: z.iso.date({ error: 'Fecha inválida.' }),
  hora: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null)
    .pipe(
      z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Hora inválida.' })
        .nullable(),
    ),
  tecnicoId: opcionalUuid,
  activa: z.boolean().default(true),
  observaciones: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
})

export async function guardarRegla(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string) {
  const p = EsquemaRegla.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const d = p.data
  if (d.frecuencia === 'copias' && !d.equipoId)
    return { ok: false as const, error: 'El preventivo por copias es de un equipo: elegilo.' }
  if (d.frecuencia === 'copias' && d.cada < 100) return { ok: false as const, error: 'Por copias, al menos cada 100.' }
  if (d.frecuencia !== 'copias' && d.cada > 60) return { ok: false as const, error: 'Hasta 60 semanas o meses.' }
  if (d.equipoId) {
    const [e] = await tx.select({ terceroId: equipos.terceroId }).from(equipos).where(eq(equipos.id, d.equipoId))
    if (!e || e.terceroId !== d.terceroId) return { ok: false as const, error: 'El equipo no es de ese cliente.' }
  }
  let reglaId = id
  if (id) {
    const [antes] = await tx.select().from(reglasPreventivo).where(eq(reglasPreventivo.id, id))
    if (!antes) return { ok: false as const, error: 'Esa regla ya no existe.' }
    // Si cambia el equipo o pasa a ser por copias, se vuelve a contar desde el contador actual.
    const recontar = d.frecuencia === 'copias' && (antes.frecuencia !== 'copias' || antes.equipoId !== d.equipoId)
    await tx
      .update(reglasPreventivo)
      .set({ ...d, ...(recontar ? { contadorBase: await ultimoContador(tx, d.equipoId!) } : {}) })
      .where(eq(reglasPreventivo.id, id))
  } else {
    const contadorBase = d.frecuencia === 'copias' ? await ultimoContador(tx, d.equipoId!) : null
    reglaId = (
      await tx
        .insert(reglasPreventivo)
        .values({ ...d, contadorBase })
        .returning({ id: reglasPreventivo.id })
    )[0].id
  }
  await auditar(tx, { usuarioId, accion: id ? 'modificacion' : 'alta', entidad: 'preventivo', entidadId: reglaId, despues: d })
  return { ok: true as const, id: reglaId! }
}

async function ultimoContador(tx: Transaccion, equipoId: string) {
  const [l] = await tx
    .select({ contador: lecturas.contador })
    .from(lecturas)
    .where(eq(lecturas.equipoId, equipoId))
    .orderBy(desc(lecturas.fecha))
    .limit(1)
  if (l) return l.contador
  const [e] = await tx.select({ inicial: equipos.contadorInicial }).from(equipos).where(eq(equipos.id, equipoId))
  return e?.inicial ?? 0
}

/** Siguiente fecha de una regla por tiempo después de `fecha`. */
export function siguienteFecha(desde: string, frecuencia: 'semanal' | 'mensual', cada: number, despuesDe: string | null) {
  if (!despuesDe || despuesDe < desde) return desde
  if (frecuencia === 'semanal') {
    const semanas = Math.floor((Date.parse(despuesDe) - Date.parse(desde)) / (7 * 86_400_000) / cada) + 1
    return sumarDias(desde, semanas * cada * 7)
  }
  // Mensual: mismo día del mes que `desde` (o el último, si el mes es más corto).
  const [a, m, d] = desde.split('-').map(Number)
  for (let n = cada; ; n += cada) {
    const mes = m - 1 + n
    const anio = a + Math.floor(mes / 12)
    const mm = (mes % 12) + 1
    const ultimo = new Date(Date.UTC(anio, mm, 0)).getUTCDate()
    const fecha = `${anio}-${String(mm).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
    if (fecha > despuesDe) return fecha
  }
}

/**
 * Genera las órdenes de las reglas activas: por tiempo, las que caen hasta
 * `horizonte` días adelante; por copias, una cuando el equipo avanzó lo
 * pedido (y no hay otra abierta de esa regla). No duplica: cada orden lleva
 * la regla y su fecha o contador de origen, con índice único.
 */
export async function generarPreventivos(tx: Transaccion, usuarioId: string, horizonte = 30, hoy = hoyArgentina()) {
  const reglas = await tx
    .select({ r: reglasPreventivo, tipo: tiposOrden })
    .from(reglasPreventivo)
    .innerJoin(tiposOrden, eq(tiposOrden.id, reglasPreventivo.tipoOrdenId))
    .where(eq(reglasPreventivo.activa, true))
  const limite = sumarDias(hoy, horizonte)
  let creadas = 0
  const errores: string[] = []
  for (const { r, tipo } of reglas) {
    const abrir = async (programada: string | null, origen: string, falla: string) => {
      const o = await guardarOrden(tx, usuarioId, {
        fecha: programada && programada < hoy ? programada : hoy,
        terceroId: r.terceroId,
        equipoId: r.equipoId,
        tipoOrdenId: r.tipoOrdenId,
        tipo: tipo.clase,
        falla,
        programada,
        hora: programada ? r.hora : null,
        tecnicoId: r.tecnicoId,
        observaciones: r.observaciones,
      })
      if (!o.ok) {
        errores.push(`Preventivo de ${tipo.nombre}: ${o.error}`)
        return false
      }
      await tx.update(ordenesServicio).set({ preventivoId: r.id, origenPreventivo: origen }).where(eq(ordenesServicio.id, o.id))
      creadas++
      return true
    }
    if (r.frecuencia === 'copias') {
      const actual = await ultimoContador(tx, r.equipoId!)
      if (actual - (r.contadorBase ?? 0) < r.cada) continue
      const [abierta] = await tx
        .select({ id: ordenesServicio.id })
        .from(ordenesServicio)
        .where(and(eq(ordenesServicio.preventivoId, r.id), inArray(ordenesServicio.estado, ABIERTAS)))
        .limit(1)
      if (abierta) continue
      const ok = await abrir(
        null,
        `copias:${actual}`,
        `Mantenimiento preventivo: el equipo hizo ${(actual - (r.contadorBase ?? 0)).toLocaleString('es-AR')} copias desde el último (cada ${r.cada.toLocaleString('es-AR')}).`,
      )
      if (ok) await tx.update(reglasPreventivo).set({ contadorBase: actual }).where(eq(reglasPreventivo.id, r.id))
      continue
    }
    let ultima = r.ultimaFecha
    for (let i = 0; i < 60; i++) {
      const fecha = siguienteFecha(r.desde, r.frecuencia as 'semanal' | 'mensual', r.cada, ultima)
      if (fecha > limite) break
      const etiqueta =
        r.frecuencia === 'semanal'
          ? `cada ${r.cada} semana${r.cada > 1 ? 's' : ''}`
          : `cada ${r.cada} mes${r.cada > 1 ? 'es' : ''}`
      if (!(await abrir(fecha, `fecha:${fecha}`, `Mantenimiento preventivo programado (${etiqueta}).`))) break
      ultima = fecha
    }
    if (ultima !== r.ultimaFecha)
      await tx.update(reglasPreventivo).set({ ultimaFecha: ultima }).where(eq(reglasPreventivo.id, r.id))
  }
  if (creadas)
    await auditar(tx, { usuarioId, accion: 'alta', entidad: 'preventivos_generados', despues: { creadas, hasta: limite } })
  return { creadas, errores }
}

export async function listarReglas(tx: Transaccion) {
  return tx
    .select({
      id: reglasPreventivo.id,
      frecuencia: reglasPreventivo.frecuencia,
      cada: reglasPreventivo.cada,
      desde: reglasPreventivo.desde,
      hora: reglasPreventivo.hora,
      activa: reglasPreventivo.activa,
      ultimaFecha: reglasPreventivo.ultimaFecha,
      contadorBase: reglasPreventivo.contadorBase,
      terceroId: reglasPreventivo.terceroId,
      equipoId: reglasPreventivo.equipoId,
      tipoOrdenId: reglasPreventivo.tipoOrdenId,
      tecnicoId: reglasPreventivo.tecnicoId,
      observaciones: reglasPreventivo.observaciones,
      cliente: terceros.razonSocial,
      serie: equipos.serie,
      modelo: modelosEquipo.nombre,
      tipoOrden: tiposOrden.nombre,
      tecnico: tecnicos.nombre,
    })
    .from(reglasPreventivo)
    .innerJoin(terceros, eq(terceros.id, reglasPreventivo.terceroId))
    .innerJoin(tiposOrden, eq(tiposOrden.id, reglasPreventivo.tipoOrdenId))
    .leftJoin(equipos, eq(equipos.id, reglasPreventivo.equipoId))
    .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
    .leftJoin(tecnicos, eq(tecnicos.id, reglasPreventivo.tecnicoId))
    .orderBy(asc(terceros.razonSocial))
}

/** Pausa o reanuda una regla (al reanudar no recupera las fechas que pasaron mientras estuvo en pausa). */
export async function pausarRegla(tx: Transaccion, usuarioId: string, id: string, activa: boolean) {
  const [r] = await tx.select().from(reglasPreventivo).where(eq(reglasPreventivo.id, id))
  if (!r) return { ok: false as const, error: 'Esa regla ya no existe.' }
  const hoy = hoyArgentina()
  await tx
    .update(reglasPreventivo)
    .set({
      activa,
      // Al reanudar, las fechas de la pausa quedan atrás; por copias, se cuenta desde el contador de hoy.
      ...(activa && r.frecuencia !== 'copias' && (r.ultimaFecha ?? r.desde) < hoy ? { ultimaFecha: sumarDias(hoy, -1) } : {}),
      ...(activa && r.frecuencia === 'copias' ? { contadorBase: await ultimoContador(tx, r.equipoId!) } : {}),
    })
    .where(eq(reglasPreventivo.id, id))
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'preventivo', entidadId: id, despues: { activa } })
  return { ok: true as const }
}
