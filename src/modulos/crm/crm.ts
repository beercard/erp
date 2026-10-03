import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import {
  crmActividades,
  crmEtapas,
  crmHistorial,
  crmMotivosPerdida,
  crmOportunidades,
  membresias,
  presupuestos,
  terceros,
  usuarios,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { mensajeDeBase } from '../../lib/errores'
import { hoyArgentina } from '../../lib/fechas'
import { guardarPresupuesto } from '../comercial/documentos'
import { guardarTercero } from '../maestros/terceros'

/**
 * CRM: embudo de oportunidades por etapas, actividades con vencimiento,
 * historial y pronóstico. Cada empresa define sus etapas; si todavía no tiene,
 * se crean las de fábrica la primera vez que se abre el embudo.
 */

export const TIPOS_ACTIVIDAD = {
  llamada: 'Llamada',
  reunion: 'Reunión',
  email: 'Email',
  whatsapp: 'WhatsApp',
  tarea: 'Tarea',
} as const
export type TipoActividad = keyof typeof TIPOS_ACTIVIDAD

export const ETAPAS_DE_FABRICA = [
  { nombre: 'Nueva', probabilidad: 10, ganada: false, diasAlerta: 3 },
  { nombre: 'Calificada', probabilidad: 30, ganada: false, diasAlerta: 10 },
  { nombre: 'Propuesta enviada', probabilidad: 60, ganada: false, diasAlerta: 15 },
  { nombre: 'Negociación', probabilidad: 80, ganada: false, diasAlerta: 15 },
  { nombre: 'Ganada', probabilidad: 100, ganada: true, diasAlerta: null },
]

const MOTIVOS_DE_FABRICA = [
  'Precio',
  'Eligió a la competencia',
  'Sin presupuesto',
  'No respondió',
  'No era lo que buscaba',
  'Otro',
]

type Resultado<T = { id: string }> = ({ ok: true } & T) | { ok: false; error: string }

const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null)

const uuidOpcional = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable())

const fechaOpcional = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .pipe(z.iso.date({ error: 'Fecha inválida.' }).nullable())

async function historial(
  tx: Transaccion,
  oportunidadId: string,
  usuarioId: string | null,
  texto: string,
  tipo: 'nota' | 'cambio' = 'cambio',
) {
  await tx.insert(crmHistorial).values({ oportunidadId, usuarioId, texto, tipo })
}

// ------------------------------------------------------------- Etapas

export async function asegurarEtapas(tx: Transaccion) {
  const etapas = await tx.select().from(crmEtapas).orderBy(asc(crmEtapas.orden), asc(crmEtapas.creado))
  if (etapas.length) return etapas
  await tx.insert(crmEtapas).values(ETAPAS_DE_FABRICA.map((e, n) => ({ ...e, orden: n })))
  await tx.insert(crmMotivosPerdida).values(MOTIVOS_DE_FABRICA.map((nombre) => ({ nombre })))
  return tx.select().from(crmEtapas).orderBy(asc(crmEtapas.orden), asc(crmEtapas.creado))
}

const EsquemaEtapa = z.object({
  nombre: z.string().trim().min(2, { error: 'Escribí el nombre de la etapa.' }).max(40),
  probabilidad: z.coerce
    .number()
    .int()
    .min(0, { error: 'La probabilidad va de 0 a 100.' })
    .max(100, { error: 'La probabilidad va de 0 a 100.' }),
  ganada: z.coerce.boolean().default(false),
  diasAlerta: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => (v === '' || v == null ? null : Number(v)))
    .pipe(z.number().int().min(1, { error: 'Los días de alerta son 1 o más (vacío: sin alerta).' }).max(365).nullable()),
})

export async function guardarEtapa(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string): Promise<Resultado> {
  const p = EsquemaEtapa.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  if (id) {
    const [e] = await tx
      .update(crmEtapas)
      .set({ ...p.data, actualizado: new Date() })
      .where(eq(crmEtapas.id, id))
      .returning()
    if (!e) return { ok: false, error: 'No existe esa etapa.' }
    await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'crm_etapa', entidadId: id, despues: p.data })
    return { ok: true, id }
  }
  const [{ maximo }] = await tx.select({ maximo: sql<number>`coalesce(max(${crmEtapas.orden}), -1)` }).from(crmEtapas)
  const [e] = await tx
    .insert(crmEtapas)
    .values({ ...p.data, orden: Number(maximo) + 1 })
    .returning()
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'crm_etapa', entidadId: e.id, despues: p.data })
  return { ok: true, id: e.id }
}

/** Sube o baja una etapa un lugar. */
export async function moverEtapa(tx: Transaccion, id: string, sentido: -1 | 1): Promise<Resultado> {
  const etapas = await asegurarEtapas(tx)
  const i = etapas.findIndex((e) => e.id === id)
  const j = i + sentido
  if (i < 0 || j < 0 || j >= etapas.length) return { ok: true, id }
  const orden = etapas.map((e) => e.id)
  ;[orden[i], orden[j]] = [orden[j], orden[i]]
  for (const [n, eid] of orden.entries()) await tx.update(crmEtapas).set({ orden: n }).where(eq(crmEtapas.id, eid))
  return { ok: true, id }
}

export async function borrarEtapa(tx: Transaccion, usuarioId: string, id: string): Promise<Resultado> {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(crmOportunidades)
    .where(eq(crmOportunidades.etapaId, id))
  if (n > 0) return { ok: false, error: `La etapa tiene ${n} oportunidades: movelas a otra antes de borrarla.` }
  const etapas = await asegurarEtapas(tx)
  if (etapas.length <= 2) return { ok: false, error: 'El embudo necesita al menos dos etapas.' }
  await tx.delete(crmEtapas).where(eq(crmEtapas.id, id))
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'crm_etapa', entidadId: id })
  return { ok: true, id }
}

// ------------------------------------------------------------- Motivos de pérdida

export async function listarMotivos(tx: Transaccion, soloActivos = true) {
  await asegurarEtapas(tx)
  return tx
    .select()
    .from(crmMotivosPerdida)
    .where(soloActivos ? eq(crmMotivosPerdida.activo, true) : undefined)
    .orderBy(asc(crmMotivosPerdida.nombre))
}

export async function guardarMotivo(tx: Transaccion, usuarioId: string, nombre: unknown, id?: string): Promise<Resultado> {
  const p = z.string().trim().min(2, { error: 'Escribí el motivo.' }).max(60).safeParse(nombre)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  if (id) {
    await tx.update(crmMotivosPerdida).set({ nombre: p.data, actualizado: new Date() }).where(eq(crmMotivosPerdida.id, id))
    return { ok: true, id }
  }
  const [m] = await tx.insert(crmMotivosPerdida).values({ nombre: p.data }).returning()
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'crm_motivo', entidadId: m.id })
  return { ok: true, id: m.id }
}

export async function activarMotivo(tx: Transaccion, id: string, activo: boolean) {
  await tx.update(crmMotivosPerdida).set({ activo, actualizado: new Date() }).where(eq(crmMotivosPerdida.id, id))
  return { ok: true as const, id }
}

// ------------------------------------------------------------- Responsables

/** Personas de la empresa a las que se les puede asignar una oportunidad o actividad. */
export async function responsables(tx: Transaccion, empresaId: string) {
  return tx
    .select({ id: usuarios.id, nombre: usuarios.nombre })
    .from(membresias)
    .innerJoin(usuarios, eq(usuarios.id, membresias.usuarioId))
    .where(and(eq(membresias.empresaId, empresaId), eq(usuarios.activo, true)))
    .orderBy(asc(usuarios.nombre))
}

// ------------------------------------------------------------- Oportunidades

const EsquemaOportunidad = z
  .object({
    titulo: z.string().trim().min(2, { error: 'Escribí un título para la oportunidad.' }).max(120),
    terceroId: uuidOpcional,
    empresaProspecto: texto(120),
    contacto: texto(120),
    email: z
      .string()
      .trim()
      .nullable()
      .optional()
      .transform((v) => v || null)
      .pipe(z.email({ error: 'Ese email no es válido.' }).nullable()),
    telefono: texto(40),
    etapaId: uuidOpcional,
    ingresoEsperado: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v) => {
        // Acepta "1.500.000,50" y "1.800.000" (como se escribe acá) y "1500000.5" (como lo manda un campo numérico).
        const t = String(v ?? '').trim()
        if (t.includes(',')) return t.replace(/\./g, '').replace(',', '.')
        // "1.800.000" o "1.500": puntos de miles.
        if (/^\d{1,3}(\.\d{3})+$/.test(t)) return t.replace(/\./g, '')
        return t || '0'
      })
      .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, { error: 'Escribí el ingreso esperado en pesos, sin signos.' })),
    probabilidad: z.coerce.number().int().min(0).max(100).optional(),
    cierreEstimado: fechaOpcional,
    prioridad: z.coerce.number().int().min(0).max(3).default(0),
    responsableId: uuidOpcional,
    origen: texto(60),
    etiquetas: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((v) =>
        [...new Set((Array.isArray(v) ? v : String(v ?? '').split(',')).map((e) => e.trim()).filter(Boolean))].slice(0, 10),
      ),
    descripcion: texto(4000),
    proximoPaso: texto(160),
  })
  .refine((d) => d.terceroId || d.empresaProspecto || d.contacto, {
    error: 'Elegí un cliente o escribí la empresa o el contacto del prospecto.',
    path: ['terceroId'],
  })

export type EntradaOportunidad = z.input<typeof EsquemaOportunidad>

export async function guardarOportunidad(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string): Promise<Resultado> {
  const p = EsquemaOportunidad.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const etapas = await asegurarEtapas(tx)
  const d = p.data
  const etapa = etapas.find((e) => e.id === d.etapaId) ?? etapas[0]
  try {
    return await tx.transaction(async (sp) => {
      if (id) {
        const [antes] = await sp.select().from(crmOportunidades).where(eq(crmOportunidades.id, id))
        if (!antes) return { ok: false as const, error: 'No existe esa oportunidad.' }
        const [despues] = await sp
          .update(crmOportunidades)
          .set({
            ...d,
            etapaId: etapa.id,
            etapaDesde: antes.etapaId !== etapa.id ? new Date() : antes.etapaDesde,
            probabilidad: d.probabilidad ?? (antes.etapaId !== etapa.id ? etapa.probabilidad : antes.probabilidad),
            actualizado: new Date(),
          })
          .where(eq(crmOportunidades.id, id))
          .returning()
        if (antes.etapaId !== etapa.id) await historial(sp, id, usuarioId, `Pasó a la etapa "${etapa.nombre}".`)
        await auditar(sp, { usuarioId, accion: 'modificacion', entidad: 'crm_oportunidad', entidadId: id, antes, despues })
        return { ok: true as const, id }
      }
      const [{ minimo }] = await sp
        .select({ minimo: sql<number>`coalesce(min(${crmOportunidades.orden}), 1)` })
        .from(crmOportunidades)
        .where(eq(crmOportunidades.etapaId, etapa.id))
      const [o] = await sp
        .insert(crmOportunidades)
        .values({
          ...d,
          etapaId: etapa.id,
          probabilidad: d.probabilidad ?? etapa.probabilidad,
          responsableId: d.responsableId ?? usuarioId,
          estado: etapa.ganada ? 'ganada' : 'abierta',
          orden: Number(minimo) - 1,
          usuarioId,
        })
        .returning()
      await historial(sp, o.id, usuarioId, 'Creó la oportunidad.')
      await auditar(sp, { usuarioId, accion: 'alta', entidad: 'crm_oportunidad', entidadId: o.id, despues: o })
      return { ok: true as const, id: o.id }
    })
  } catch (e) {
    const m = mensajeDeBase(e)
    if (m.includes('crm_oportunidades_tercero_fk')) return { ok: false, error: 'Ese cliente no existe.' }
    throw e
  }
}

/** Mueve la oportunidad a otra etapa (arrastrar en el embudo). Entrar a una etapa "ganada" la gana. */
export async function moverOportunidad(
  tx: Transaccion,
  usuarioId: string,
  id: string,
  etapaId: string,
  antesDe?: string | null,
): Promise<Resultado> {
  const etapas = await asegurarEtapas(tx)
  const etapa = etapas.find((e) => e.id === etapaId)
  if (!etapa) return { ok: false, error: 'No existe esa etapa.' }
  const [o] = await tx.select().from(crmOportunidades).where(eq(crmOportunidades.id, id))
  if (!o) return { ok: false, error: 'No existe esa oportunidad.' }
  if (o.estado === 'perdida') return { ok: false, error: 'La oportunidad está perdida: reabrila antes de moverla.' }

  // Orden dentro de la columna: queda arriba de la tarjeta sobre la que se soltó, o al final.
  const columna = await tx
    .select({ id: crmOportunidades.id })
    .from(crmOportunidades)
    .where(and(eq(crmOportunidades.etapaId, etapaId), sql`${crmOportunidades.id} <> ${id}`))
    .orderBy(asc(crmOportunidades.orden), desc(crmOportunidades.creado))
  const ids = columna.map((c) => c.id)
  const lugar = antesDe ? ids.indexOf(antesDe) : -1
  ids.splice(lugar < 0 ? ids.length : lugar, 0, id)
  for (const [n, oid] of ids.entries()) await tx.update(crmOportunidades).set({ orden: n }).where(eq(crmOportunidades.id, oid))

  if (o.etapaId !== etapaId) {
    const ganada = etapa.ganada
    await tx
      .update(crmOportunidades)
      .set({
        etapaId,
        etapaDesde: new Date(),
        probabilidad: etapa.probabilidad,
        estado: ganada ? 'ganada' : 'abierta',
        cerrada: ganada ? new Date() : null,
        actualizado: new Date(),
      })
      .where(eq(crmOportunidades.id, id))
    await historial(tx, id, usuarioId, ganada ? `Ganada (pasó a "${etapa.nombre}").` : `Pasó a la etapa "${etapa.nombre}".`)
    await auditar(tx, {
      usuarioId,
      accion: 'modificacion',
      entidad: 'crm_oportunidad',
      entidadId: id,
      antes: { etapaId: o.etapaId },
      despues: { etapaId },
    })
  }
  return { ok: true, id }
}

export async function ganarOportunidad(tx: Transaccion, usuarioId: string, id: string): Promise<Resultado> {
  const etapas = await asegurarEtapas(tx)
  const etapa = etapas.find((e) => e.ganada) ?? etapas[etapas.length - 1]
  const r = await moverOportunidad(tx, usuarioId, id, etapa.id)
  if (!r.ok) return r
  // Si ya estaba en la etapa ganada (moverla no cambia nada), igual queda ganada.
  await tx
    .update(crmOportunidades)
    .set({ estado: 'ganada', probabilidad: 100, cerrada: sql`coalesce(${crmOportunidades.cerrada}, now())` })
    .where(eq(crmOportunidades.id, id))
  return r
}

export async function perderOportunidad(
  tx: Transaccion,
  usuarioId: string,
  id: string,
  entrada: { motivoId?: unknown; nota?: unknown },
): Promise<Resultado> {
  const p = z
    .object({
      motivoId: z.uuid({ error: 'Elegí el motivo de la pérdida.' }),
      nota: texto(1000),
    })
    .safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const [m] = await tx.select().from(crmMotivosPerdida).where(eq(crmMotivosPerdida.id, p.data.motivoId))
  if (!m) return { ok: false, error: 'Ese motivo no existe.' }
  if (m.nombre.trim().toLowerCase() === 'otro' && !p.data.nota) {
    return { ok: false, error: 'Contá en una línea por qué se perdió.' }
  }
  const [o] = await tx
    .update(crmOportunidades)
    .set({
      estado: 'perdida',
      probabilidad: 0,
      motivoPerdidaId: m.id,
      notaPerdida: p.data.nota,
      cerrada: new Date(),
      actualizado: new Date(),
    })
    .where(eq(crmOportunidades.id, id))
    .returning()
  if (!o) return { ok: false, error: 'No existe esa oportunidad.' }
  await historial(tx, id, usuarioId, `Perdida: ${m.nombre}${p.data.nota ? ` — ${p.data.nota}` : ''}.`)
  await auditar(tx, {
    usuarioId,
    accion: 'modificacion',
    entidad: 'crm_oportunidad',
    entidadId: id,
    despues: { estado: 'perdida' },
  })
  return { ok: true, id }
}

export async function reabrirOportunidad(tx: Transaccion, usuarioId: string, id: string): Promise<Resultado> {
  const etapas = await asegurarEtapas(tx)
  const [o] = await tx.select().from(crmOportunidades).where(eq(crmOportunidades.id, id))
  if (!o) return { ok: false, error: 'No existe esa oportunidad.' }
  const actual = etapas.find((e) => e.id === o.etapaId)
  // Una ganada vuelve a la última etapa abierta; una perdida, a la que estaba.
  const etapa = actual?.ganada ? ([...etapas].reverse().find((e) => !e.ganada) ?? etapas[0]) : (actual ?? etapas[0])
  await tx
    .update(crmOportunidades)
    .set({
      estado: 'abierta',
      etapaId: etapa.id,
      etapaDesde: new Date(),
      probabilidad: etapa.probabilidad,
      motivoPerdidaId: null,
      notaPerdida: null,
      cerrada: null,
      actualizado: new Date(),
    })
    .where(eq(crmOportunidades.id, id))
  await historial(tx, id, usuarioId, `Reabierta en "${etapa.nombre}".`)
  return { ok: true, id }
}

export async function borrarOportunidad(tx: Transaccion, usuarioId: string, id: string): Promise<Resultado> {
  const [o] = await tx.delete(crmOportunidades).where(eq(crmOportunidades.id, id)).returning()
  if (!o) return { ok: false, error: 'No existe esa oportunidad.' }
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'crm_oportunidad', entidadId: id, antes: o })
  return { ok: true, id }
}

export async function cambiarPrioridad(tx: Transaccion, id: string, prioridad: number) {
  const p = Math.max(0, Math.min(3, Math.round(prioridad)))
  await tx.update(crmOportunidades).set({ prioridad: p, actualizado: new Date() }).where(eq(crmOportunidades.id, id))
  return { ok: true as const, id }
}

// ------------------------------------------------------------- Lecturas

export type FiltroOportunidades = {
  q?: string
  responsableId?: string | null
  estado?: 'abierta' | 'ganada' | 'perdida' | 'todas'
  terceroId?: string
  etiqueta?: string
}

function condiciones(f: FiltroOportunidades) {
  const c = []
  if (f.q?.trim()) {
    const patron = `%${f.q.trim()}%`
    c.push(
      or(
        ilike(crmOportunidades.titulo, patron),
        ilike(crmOportunidades.empresaProspecto, patron),
        ilike(crmOportunidades.contacto, patron),
        ilike(crmOportunidades.email, patron),
        ilike(terceros.razonSocial, patron),
      ),
    )
  }
  if (f.responsableId) c.push(eq(crmOportunidades.responsableId, f.responsableId))
  if (f.estado && f.estado !== 'todas') c.push(eq(crmOportunidades.estado, f.estado))
  if (f.terceroId) c.push(eq(crmOportunidades.terceroId, f.terceroId))
  if (f.etiqueta) c.push(sql`${f.etiqueta} = any(${crmOportunidades.etiquetas})`)
  return and(...c)
}

const columnasLista = {
  id: crmOportunidades.id,
  titulo: crmOportunidades.titulo,
  terceroId: crmOportunidades.terceroId,
  cliente: sql<
    string | null
  >`coalesce(${terceros.razonSocial}, ${crmOportunidades.empresaProspecto}, ${crmOportunidades.contacto})`,
  esProspecto: sql<boolean>`${crmOportunidades.terceroId} is null`,
  etapaId: crmOportunidades.etapaId,
  etapa: crmEtapas.nombre,
  estado: crmOportunidades.estado,
  ingresoEsperado: crmOportunidades.ingresoEsperado,
  probabilidad: crmOportunidades.probabilidad,
  cierreEstimado: crmOportunidades.cierreEstimado,
  prioridad: crmOportunidades.prioridad,
  responsableId: crmOportunidades.responsableId,
  responsable: usuarios.nombre,
  etiquetas: crmOportunidades.etiquetas,
  orden: crmOportunidades.orden,
  etapaDesde: crmOportunidades.etapaDesde,
  diasAlerta: crmEtapas.diasAlerta,
  proximoPaso: crmOportunidades.proximoPaso,
  actualizado: crmOportunidades.actualizado,
  creado: crmOportunidades.creado,
}

/** Próxima actividad pendiente de cada oportunidad (la que vence antes). */
async function proximasActividades(tx: Transaccion, ids: string[]) {
  if (!ids.length) return new Map<string, { tipo: string; resumen: string; vence: string }>()
  const filas = await tx
    .selectDistinctOn([crmActividades.oportunidadId], {
      oportunidadId: crmActividades.oportunidadId,
      tipo: crmActividades.tipo,
      resumen: crmActividades.resumen,
      vence: crmActividades.vence,
    })
    .from(crmActividades)
    .where(and(inArray(crmActividades.oportunidadId, ids), eq(crmActividades.hecha, false)))
    .orderBy(crmActividades.oportunidadId, asc(crmActividades.vence))
  return new Map(filas.map((f) => [f.oportunidadId, f]))
}

const DIA = 86_400_000

/** Días en la etapa actual, si está estancada (pasó los días de alerta de la etapa) y si no tiene nada agendado. */
function conAlertas<T extends { etapaDesde: Date | string; diasAlerta: number | null; estado: string }>(
  o: T,
  proxima: unknown,
  ahora = Date.now(),
) {
  const diasEnEtapa = Math.max(0, Math.floor((ahora - new Date(o.etapaDesde).getTime()) / DIA))
  const abierta = o.estado === 'abierta'
  return {
    diasEnEtapa,
    estancada: abierta && o.diasAlerta != null && diasEnEtapa >= o.diasAlerta,
    sinActividad: abierta && !proxima,
  }
}

export type EstadoActividad = 'vencida' | 'hoy' | 'futura'
export const estadoDeVencimiento = (vence: string, hoy = hoyArgentina()): EstadoActividad =>
  vence < hoy ? 'vencida' : vence === hoy ? 'hoy' : 'futura'

/** El embudo: etapas con sus oportunidades abiertas y ganadas (las perdidas no se muestran). */
export async function tablero(tx: Transaccion, f: FiltroOportunidades = {}) {
  const etapas = await asegurarEtapas(tx)
  const filas = await tx
    .select(columnasLista)
    .from(crmOportunidades)
    .innerJoin(crmEtapas, eq(crmEtapas.id, crmOportunidades.etapaId))
    .leftJoin(terceros, eq(terceros.id, crmOportunidades.terceroId))
    .leftJoin(usuarios, eq(usuarios.id, crmOportunidades.responsableId))
    .where(and(condiciones({ ...f, estado: undefined }), sql`${crmOportunidades.estado} <> 'perdida'`))
    .orderBy(asc(crmOportunidades.orden), desc(crmOportunidades.creado))
    .limit(1000)
  const proximas = await proximasActividades(
    tx,
    filas.map((o) => o.id),
  )
  const hoy = hoyArgentina()
  return etapas.map((e) => {
    const ops = filas
      .filter((o) => o.etapaId === e.id)
      .map((o) => {
        const a = proximas.get(o.id)
        return { ...o, ...conAlertas(o, a), proxima: a ? { ...a, estado: estadoDeVencimiento(a.vence, hoy) } : null }
      })
    return {
      ...e,
      oportunidades: ops,
      total: ops.reduce((s, o) => s + Number(o.ingresoEsperado), 0),
      ponderado: ops.reduce((s, o) => s + (Number(o.ingresoEsperado) * o.probabilidad) / 100, 0),
    }
  })
}

export async function listarOportunidades(tx: Transaccion, f: FiltroOportunidades = {}, limite = 500) {
  const filas = await tx
    .select(columnasLista)
    .from(crmOportunidades)
    .innerJoin(crmEtapas, eq(crmEtapas.id, crmOportunidades.etapaId))
    .leftJoin(terceros, eq(terceros.id, crmOportunidades.terceroId))
    .leftJoin(usuarios, eq(usuarios.id, crmOportunidades.responsableId))
    .where(condiciones(f))
    .orderBy(desc(crmOportunidades.actualizado))
    .limit(limite)
  const proximas = await proximasActividades(
    tx,
    filas.map((o) => o.id),
  )
  const hoy = hoyArgentina()
  return filas.map((o) => {
    const a = proximas.get(o.id)
    return { ...o, ...conAlertas(o, a), proxima: a ? { ...a, estado: estadoDeVencimiento(a.vence, hoy) } : null }
  })
}

export async function obtenerOportunidad(tx: Transaccion, id: string) {
  const [o] = await tx
    .select({
      ...columnasLista,
      empresaProspecto: crmOportunidades.empresaProspecto,
      contacto: crmOportunidades.contacto,
      email: crmOportunidades.email,
      telefono: crmOportunidades.telefono,
      origen: crmOportunidades.origen,
      descripcion: crmOportunidades.descripcion,
      motivoPerdidaId: crmOportunidades.motivoPerdidaId,
      motivoPerdida: crmMotivosPerdida.nombre,
      notaPerdida: crmOportunidades.notaPerdida,
      presupuestoId: crmOportunidades.presupuestoId,
      presupuestoNumero: presupuestos.numero,
      presupuestoEstado: presupuestos.estado,
      cerrada: crmOportunidades.cerrada,
      clienteEmail: terceros.email,
      clienteTelefono: terceros.telefono,
    })
    .from(crmOportunidades)
    .innerJoin(crmEtapas, eq(crmEtapas.id, crmOportunidades.etapaId))
    .leftJoin(terceros, eq(terceros.id, crmOportunidades.terceroId))
    .leftJoin(usuarios, eq(usuarios.id, crmOportunidades.responsableId))
    .leftJoin(crmMotivosPerdida, eq(crmMotivosPerdida.id, crmOportunidades.motivoPerdidaId))
    .leftJoin(presupuestos, eq(presupuestos.id, crmOportunidades.presupuestoId))
    .where(eq(crmOportunidades.id, id))
  if (!o) return null
  const [actividades, notas] = await Promise.all([
    tx
      .select({
        id: crmActividades.id,
        tipo: crmActividades.tipo,
        resumen: crmActividades.resumen,
        vence: crmActividades.vence,
        hecha: crmActividades.hecha,
        hechaEl: crmActividades.hechaEl,
        resultado: crmActividades.resultado,
        responsableId: crmActividades.responsableId,
        responsable: usuarios.nombre,
      })
      .from(crmActividades)
      .leftJoin(usuarios, eq(usuarios.id, crmActividades.responsableId))
      .where(eq(crmActividades.oportunidadId, id))
      .orderBy(asc(crmActividades.hecha), asc(crmActividades.vence)),
    tx
      .select({
        id: crmHistorial.id,
        tipo: crmHistorial.tipo,
        texto: crmHistorial.texto,
        creado: crmHistorial.creado,
        usuario: usuarios.nombre,
      })
      .from(crmHistorial)
      .leftJoin(usuarios, eq(usuarios.id, crmHistorial.usuarioId))
      .where(eq(crmHistorial.oportunidadId, id))
      .orderBy(desc(crmHistorial.creado)),
  ])
  const hoy = hoyArgentina()
  const pendiente = actividades.find((a) => !a.hecha)
  return {
    ...o,
    ...conAlertas(o, pendiente),
    actividades: actividades.map((a) => ({ ...a, estado: a.hecha ? null : estadoDeVencimiento(a.vence, hoy) })),
    historial: notas,
  }
}

/**
 * Posibles duplicados de una oportunidad: clientes y otras oportunidades
 * abiertas con el mismo email, teléfono o un nombre parecido.
 */
export async function posiblesDuplicados(tx: Transaccion, id: string) {
  const [o] = await tx.select().from(crmOportunidades).where(eq(crmOportunidades.id, id))
  if (!o) return { clientes: [], oportunidades: [] }
  const tel = (o.telefono ?? '').replace(/\D/g, '').slice(-8)
  const nombre = (o.empresaProspecto ?? o.contacto ?? '').trim()
  const criteriosCliente = [
    o.email ? sql`lower(${terceros.email}) = lower(${o.email})` : undefined,
    tel.length >= 6 ? sql`regexp_replace(coalesce(${terceros.telefono}, ''), '[^0-9]', '', 'g') like ${'%' + tel}` : undefined,
    nombre.length >= 4 ? ilike(terceros.razonSocial, `%${nombre}%`) : undefined,
  ].filter(Boolean)
  const criteriosOportunidad = [
    o.email ? sql`lower(${crmOportunidades.email}) = lower(${o.email})` : undefined,
    tel.length >= 6
      ? sql`regexp_replace(coalesce(${crmOportunidades.telefono}, ''), '[^0-9]', '', 'g') like ${'%' + tel}`
      : undefined,
    nombre.length >= 4 ? ilike(crmOportunidades.empresaProspecto, `%${nombre}%`) : undefined,
    o.terceroId ? eq(crmOportunidades.terceroId, o.terceroId) : undefined,
  ].filter(Boolean)
  const [clientes, oportunidades] = await Promise.all([
    o.terceroId || !criteriosCliente.length
      ? []
      : tx
          .select({ id: terceros.id, razonSocial: terceros.razonSocial, email: terceros.email, telefono: terceros.telefono })
          .from(terceros)
          .where(and(eq(terceros.esCliente, true), or(...criteriosCliente)))
          .limit(5),
    !criteriosOportunidad.length
      ? []
      : tx
          .select({ id: crmOportunidades.id, titulo: crmOportunidades.titulo, estado: crmOportunidades.estado })
          .from(crmOportunidades)
          .where(and(sql`${crmOportunidades.id} <> ${id}`, eq(crmOportunidades.estado, 'abierta'), or(...criteriosOportunidad)))
          .limit(5),
  ])
  return { clientes, oportunidades }
}

/** Vincula la oportunidad de un prospecto con un cliente ya cargado (en vez de crear uno nuevo). */
export async function vincularCliente(tx: Transaccion, usuarioId: string, id: string, terceroId: string): Promise<Resultado> {
  const [t] = await tx.select({ razonSocial: terceros.razonSocial }).from(terceros).where(eq(terceros.id, terceroId))
  if (!t) return { ok: false, error: 'Ese cliente no existe.' }
  await tx.update(crmOportunidades).set({ terceroId, actualizado: new Date() }).where(eq(crmOportunidades.id, id))
  await historial(tx, id, usuarioId, `La vinculó con el cliente ${t.razonSocial}.`)
  return { ok: true, id }
}

/** Etiquetas usadas en la empresa, para sugerirlas. */
export async function etiquetasUsadas(tx: Transaccion) {
  const filas = await tx.execute<{ etiqueta: string }>(
    sql`select distinct unnest(${crmOportunidades.etiquetas}) as etiqueta from ${crmOportunidades} order by 1 limit 50`,
  )
  return (Array.isArray(filas) ? filas : (filas as { rows: { etiqueta: string }[] }).rows).map((f) => f.etiqueta)
}

// ------------------------------------------------------------- Actividades y notas

const EsquemaActividad = z.object({
  tipo: z.enum(Object.keys(TIPOS_ACTIVIDAD) as [TipoActividad, ...TipoActividad[]], { error: 'Elegí el tipo de actividad.' }),
  resumen: z.string().trim().min(2, { error: 'Escribí qué hay que hacer.' }).max(200),
  vence: z.iso.date({ error: 'Elegí para cuándo.' }),
  responsableId: uuidOpcional,
})

export async function agendarActividad(
  tx: Transaccion,
  usuarioId: string,
  oportunidadId: string,
  entrada: unknown,
): Promise<Resultado> {
  const p = EsquemaActividad.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const [o] = await tx.select({ id: crmOportunidades.id }).from(crmOportunidades).where(eq(crmOportunidades.id, oportunidadId))
  if (!o) return { ok: false, error: 'No existe esa oportunidad.' }
  const [a] = await tx
    .insert(crmActividades)
    .values({ ...p.data, responsableId: p.data.responsableId ?? usuarioId, oportunidadId, usuarioId })
    .returning()
  await historial(tx, oportunidadId, usuarioId, `Agendó ${TIPOS_ACTIVIDAD[p.data.tipo].toLowerCase()}: ${p.data.resumen}.`)
  return { ok: true, id: a.id }
}

export async function completarActividad(
  tx: Transaccion,
  usuarioId: string,
  id: string,
  resultado?: unknown,
): Promise<Resultado> {
  const r = texto(1000).parse(resultado)
  const [a] = await tx
    .update(crmActividades)
    .set({ hecha: true, hechaEl: new Date(), resultado: r, actualizado: new Date() })
    .where(and(eq(crmActividades.id, id), eq(crmActividades.hecha, false)))
    .returning()
  if (!a) return { ok: false, error: 'Esa actividad no existe o ya estaba hecha.' }
  await historial(
    tx,
    a.oportunidadId,
    usuarioId,
    `${TIPOS_ACTIVIDAD[a.tipo as TipoActividad]} hecha: ${a.resumen}${r ? ` — ${r}` : ''}.`,
  )
  return { ok: true, id }
}

export async function borrarActividad(tx: Transaccion, id: string): Promise<Resultado> {
  const [a] = await tx.delete(crmActividades).where(eq(crmActividades.id, id)).returning()
  if (!a) return { ok: false, error: 'Esa actividad no existe.' }
  return { ok: true, id }
}

export async function agregarNota(tx: Transaccion, usuarioId: string, oportunidadId: string, nota: unknown): Promise<Resultado> {
  const p = z.string().trim().min(1, { error: 'Escribí la nota.' }).max(4000).safeParse(nota)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const [o] = await tx.select({ id: crmOportunidades.id }).from(crmOportunidades).where(eq(crmOportunidades.id, oportunidadId))
  if (!o) return { ok: false, error: 'No existe esa oportunidad.' }
  await historial(tx, oportunidadId, usuarioId, p.data, 'nota')
  await tx.update(crmOportunidades).set({ actualizado: new Date() }).where(eq(crmOportunidades.id, oportunidadId))
  return { ok: true, id: oportunidadId }
}

/** Actividades pendientes, para "Mis actividades": vencidas, de hoy y próximas. */
export async function actividadesPendientes(tx: Transaccion, responsableId?: string | null) {
  const filas = await tx
    .select({
      id: crmActividades.id,
      tipo: crmActividades.tipo,
      resumen: crmActividades.resumen,
      vence: crmActividades.vence,
      oportunidadId: crmActividades.oportunidadId,
      oportunidad: crmOportunidades.titulo,
      cliente: sql<
        string | null
      >`coalesce(${terceros.razonSocial}, ${crmOportunidades.empresaProspecto}, ${crmOportunidades.contacto})`,
      telefono: sql<string | null>`coalesce(${crmOportunidades.telefono}, ${terceros.telefono})`,
      email: sql<string | null>`coalesce(${crmOportunidades.email}, ${terceros.email})`,
      responsable: usuarios.nombre,
    })
    .from(crmActividades)
    .innerJoin(crmOportunidades, eq(crmOportunidades.id, crmActividades.oportunidadId))
    .leftJoin(terceros, eq(terceros.id, crmOportunidades.terceroId))
    .leftJoin(usuarios, eq(usuarios.id, crmActividades.responsableId))
    .where(and(eq(crmActividades.hecha, false), responsableId ? eq(crmActividades.responsableId, responsableId) : undefined))
    .orderBy(asc(crmActividades.vence))
    .limit(500)
  const hoy = hoyArgentina()
  return filas.map((a) => ({ ...a, estado: estadoDeVencimiento(a.vence, hoy) }))
}

// ------------------------------------------------------------- Pasos a venta

/** Da de alta como cliente al prospecto de la oportunidad y la vincula. */
export async function crearClienteDesde(tx: Transaccion, usuarioId: string, id: string): Promise<Resultado> {
  const [o] = await tx.select().from(crmOportunidades).where(eq(crmOportunidades.id, id))
  if (!o) return { ok: false, error: 'No existe esa oportunidad.' }
  if (o.terceroId) return { ok: true, id: o.terceroId }
  const r = await guardarTercero(tx, usuarioId, {
    razonSocial: o.empresaProspecto || o.contacto || o.titulo,
    esCliente: true,
    esProveedor: false,
    tipoDocumento: 99,
    condicionIva: 5,
    email: o.email ?? '',
    telefono: o.telefono ?? '',
    notas: o.contacto && o.empresaProspecto ? `Contacto: ${o.contacto}` : '',
  })
  if (!r.ok) return { ok: false, error: r.mensaje ?? Object.values(r.errores)[0] ?? 'No se pudo crear el cliente.' }
  await tx.update(crmOportunidades).set({ terceroId: r.id, actualizado: new Date() }).where(eq(crmOportunidades.id, id))
  await historial(tx, id, usuarioId, 'Dio de alta al prospecto como cliente.')
  return { ok: true, id: r.id }
}

/**
 * Arma el presupuesto de la oportunidad: un renglón con el título y el ingreso
 * esperado (neto, IVA 21 %) para completar en el editor. Si el prospecto
 * todavía no es cliente, primero lo da de alta.
 */
export async function crearPresupuestoDesde(tx: Transaccion, usuarioId: string, id: string): Promise<Resultado> {
  const [o] = await tx.select().from(crmOportunidades).where(eq(crmOportunidades.id, id))
  if (!o) return { ok: false, error: 'No existe esa oportunidad.' }
  if (o.presupuestoId) return { ok: true, id: o.presupuestoId }
  let terceroId = o.terceroId
  if (!terceroId) {
    const c = await crearClienteDesde(tx, usuarioId, id)
    if (!c.ok) return c
    terceroId = c.id
  }
  const r = await guardarPresupuesto(tx, usuarioId, {
    terceroId,
    fecha: hoyArgentina(),
    moneda: 'PES',
    cotizacion: '1',
    observaciones: `Oportunidad: ${o.titulo}`,
    items: [{ descripcion: o.titulo, cantidad: '1', precioUnitario: o.ingresoEsperado, alicuotaIva: 5 }],
  })
  if (!r.ok) return r
  // Con presupuesto, la oportunidad avanza a la primera etapa de propuesta si estaba antes.
  const etapas = await asegurarEtapas(tx)
  const actual = etapas.findIndex((e) => e.id === o.etapaId)
  const propuesta = etapas.findIndex((e) => !e.ganada && e.probabilidad >= 50)
  const etapaId = propuesta > actual && o.estado === 'abierta' ? etapas[propuesta].id : o.etapaId
  await tx
    .update(crmOportunidades)
    .set({
      presupuestoId: r.id,
      etapaId,
      probabilidad: etapaId === o.etapaId ? o.probabilidad : etapas[propuesta].probabilidad,
      actualizado: new Date(),
    })
    .where(eq(crmOportunidades.id, id))
  await historial(tx, id, usuarioId, `Armó el presupuesto N.º ${r.numero}.`)
  return { ok: true, id: r.id }
}

// ------------------------------------------------------------- Pronóstico

/** Números del embudo para el informe: por etapa, por mes de cierre, por responsable y motivos de pérdida. */
export async function pronostico(tx: Transaccion, desde: string) {
  const etapas = await tablero(tx)
  const abiertas = etapas.flatMap((e) => e.oportunidades.filter((o) => o.estado === 'abierta'))
  const cerradas = await tx
    .select({
      estado: crmOportunidades.estado,
      ingreso: crmOportunidades.ingresoEsperado,
      responsable: usuarios.nombre,
      motivo: crmMotivosPerdida.nombre,
      etapa: crmEtapas.nombre,
      origen: crmOportunidades.origen,
      creado: crmOportunidades.creado,
      cerrada: crmOportunidades.cerrada,
    })
    .from(crmOportunidades)
    .leftJoin(usuarios, eq(usuarios.id, crmOportunidades.responsableId))
    .leftJoin(crmMotivosPerdida, eq(crmMotivosPerdida.id, crmOportunidades.motivoPerdidaId))
    .innerJoin(crmEtapas, eq(crmEtapas.id, crmOportunidades.etapaId))
    .where(and(inArray(crmOportunidades.estado, ['ganada', 'perdida']), sql`${crmOportunidades.cerrada} >= ${desde}::date`))
  const ganadas = cerradas.filter((c) => c.estado === 'ganada')
  const perdidas = cerradas.filter((c) => c.estado === 'perdida')

  const porMes = new Map<string, { total: number; ponderado: number }>()
  for (const o of abiertas) {
    const mes = o.cierreEstimado?.slice(0, 7) ?? 'sin-fecha'
    const m = porMes.get(mes) ?? { total: 0, ponderado: 0 }
    m.total += Number(o.ingresoEsperado)
    m.ponderado += (Number(o.ingresoEsperado) * o.probabilidad) / 100
    porMes.set(mes, m)
  }

  const porResponsable = new Map<
    string,
    { abiertas: number; embudo: number; ganadas: number; ganado: number; perdidas: number }
  >()
  const fila = (n: string | null) => {
    const k = n ?? 'Sin asignar'
    const r = porResponsable.get(k) ?? { abiertas: 0, embudo: 0, ganadas: 0, ganado: 0, perdidas: 0 }
    porResponsable.set(k, r)
    return r
  }
  for (const o of abiertas) {
    const r = fila(o.responsable)
    r.abiertas++
    r.embudo += Number(o.ingresoEsperado)
  }
  for (const c of ganadas) {
    const r = fila(c.responsable)
    r.ganadas++
    r.ganado += Number(c.ingreso)
  }
  for (const c of perdidas) fila(c.responsable).perdidas++

  const motivos = new Map<string, number>()
  for (const c of perdidas) motivos.set(c.motivo ?? 'Sin motivo', (motivos.get(c.motivo ?? 'Sin motivo') ?? 0) + 1)
  // En qué etapa se pierden (la oportunidad perdida conserva su etapa).
  const perdidasPorEtapa = new Map<string, number>()
  for (const c of perdidas) perdidasPorEtapa.set(c.etapa, (perdidasPorEtapa.get(c.etapa) ?? 0) + 1)
  const origenes = new Map<string, { ganadas: number; perdidas: number; ganado: number }>()
  for (const c of cerradas) {
    const k = c.origen || 'Sin origen'
    const v = origenes.get(k) ?? { ganadas: 0, perdidas: 0, ganado: 0 }
    if (c.estado === 'ganada') {
      v.ganadas++
      v.ganado += Number(c.ingreso)
    } else v.perdidas++
    origenes.set(k, v)
  }
  const diasCierre = ganadas
    .filter((c) => c.cerrada)
    .map((c) => (new Date(c.cerrada!).getTime() - new Date(c.creado).getTime()) / DIA)

  return {
    etapas: etapas.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      ganada: e.ganada,
      cantidad: e.oportunidades.filter((o) => o.estado === 'abierta').length,
      total: e.oportunidades.filter((o) => o.estado === 'abierta').reduce((s, o) => s + Number(o.ingresoEsperado), 0),
      ponderado: e.oportunidades
        .filter((o) => o.estado === 'abierta')
        .reduce((s, o) => s + (Number(o.ingresoEsperado) * o.probabilidad) / 100, 0),
    })),
    embudo: abiertas.reduce((s, o) => s + Number(o.ingresoEsperado), 0),
    ponderado: abiertas.reduce((s, o) => s + (Number(o.ingresoEsperado) * o.probabilidad) / 100, 0),
    abiertas: abiertas.length,
    ganadas: ganadas.length,
    ganado: ganadas.reduce((s, c) => s + Number(c.ingreso), 0),
    perdidas: perdidas.length,
    tasa: ganadas.length + perdidas.length ? ganadas.length / (ganadas.length + perdidas.length) : null,
    diasPromedioCierre: diasCierre.length ? diasCierre.reduce((a, b) => a + b, 0) / diasCierre.length : null,
    ticketPromedio: ganadas.length ? ganadas.reduce((s, c) => s + Number(c.ingreso), 0) / ganadas.length : null,
    estancadas: abiertas.filter((o) => o.estancada).length,
    sinActividad: abiertas.filter((o) => o.sinActividad).length,
    perdidasPorEtapa: [...perdidasPorEtapa.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })),
    origenes: [...origenes.entries()].map(([nombre, v]) => ({ nombre, ...v })).sort((a, b) => b.ganado - a.ganado),
    porMes: [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => ({ mes, ...v })),
    porResponsable: [...porResponsable.entries()].map(([nombre, v]) => ({ nombre, ...v })).sort((a, b) => b.embudo - a.embudo),
    motivos: [...motivos.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
  }
}

/** Oportunidades de un cliente, para su ficha. */
export async function oportunidadesDeCliente(tx: Transaccion, terceroId: string) {
  return listarOportunidades(tx, { terceroId, estado: 'todas' }, 20)
}
