import { randomBytes } from 'node:crypto'

import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { comoPlataforma, conEmpresa } from '../../db/empresa'
import {
  crmActividades,
  crmAjustes,
  crmFormularios,
  crmHistorial,
  crmOportunidades,
  crmPlantillas,
  membresias,
  terceros,
  usuarios,
} from '../../db/schema'
import { hoyArgentina } from '../../lib/fechas'
import { emailValido, encolarCorreo } from '../comunicaciones/correo'
import { agendarActividad, asegurarEtapas, guardarOportunidad, moverOportunidad } from './crm'
import { DESENLACES_LLAMADA } from './plantillas'

/**
 * Segunda etapa del CRM: plantillas de WhatsApp y email, registro rápido de
 * llamadas, edición en línea, acciones masivas, formulario web con
 * asignación rotativa y resumen diario de actividades.
 */

type Resultado<T = { id: string }> = ({ ok: true } & T) | { ok: false; error: string }

async function historial(
  tx: Transaccion,
  oportunidadId: string,
  usuarioId: string | null,
  texto: string,
  tipo: 'nota' | 'cambio' | 'llamada' | 'whatsapp' | 'email' = 'cambio',
) {
  await tx.insert(crmHistorial).values({ oportunidadId, usuarioId, texto, tipo })
  await tx.update(crmOportunidades).set({ actualizado: new Date() }).where(eq(crmOportunidades.id, oportunidadId))
}

// ------------------------------------------------------------- Plantillas

export { aplicarPlantilla, VARIABLES } from './plantillas'

const PLANTILLAS_DE_FABRICA = [
  {
    nombre: 'Primer contacto',
    canal: 'whatsapp',
    texto:
      'Hola {contacto}, ¿cómo estás? Soy {vendedor} de {empresa}. Te escribo por tu consulta sobre {oportunidad}. ¿Cuándo te queda cómodo que hablemos?',
  },
  {
    nombre: 'Seguimiento de la propuesta',
    canal: 'whatsapp',
    texto: 'Hola {contacto}, ¿pudiste ver la propuesta de {oportunidad}? Si querés la repasamos juntos. Saludos, {vendedor}.',
  },
  {
    nombre: 'Envío de propuesta',
    canal: 'email',
    asunto: 'Propuesta: {oportunidad}',
    texto:
      'Hola {contacto}:\n\nTe envío la propuesta por {oportunidad}. Quedo atento a tus comentarios.\n\nSaludos,\n{vendedor}\n{empresa}',
  },
] as const

export async function listarPlantillas(tx: Transaccion, canal?: 'whatsapp' | 'email', soloActivas = true) {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(crmPlantillas)
  if (!n) await tx.insert(crmPlantillas).values(PLANTILLAS_DE_FABRICA.map((p) => ({ ...p })))
  return tx
    .select()
    .from(crmPlantillas)
    .where(and(canal ? eq(crmPlantillas.canal, canal) : undefined, soloActivas ? eq(crmPlantillas.activa, true) : undefined))
    .orderBy(asc(crmPlantillas.canal), asc(crmPlantillas.nombre))
}

const EsquemaPlantilla = z
  .object({
    nombre: z.string().trim().min(2, { error: 'Poné un nombre a la plantilla.' }).max(60),
    canal: z.enum(['whatsapp', 'email'], { error: 'Elegí WhatsApp o email.' }),
    asunto: z
      .string()
      .trim()
      .max(150)
      .nullable()
      .optional()
      .transform((v) => v || null),
    texto: z.string().trim().min(5, { error: 'Escribí el mensaje.' }).max(4000),
  })
  .refine((p) => p.canal !== 'email' || p.asunto, { error: 'El email necesita asunto.', path: ['asunto'] })

export async function guardarPlantilla(tx: Transaccion, entrada: unknown, id?: string): Promise<Resultado> {
  const p = EsquemaPlantilla.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  if (id) {
    await tx
      .update(crmPlantillas)
      .set({ ...p.data, actualizado: new Date() })
      .where(eq(crmPlantillas.id, id))
    return { ok: true, id }
  }
  const [f] = await tx.insert(crmPlantillas).values(p.data).returning()
  return { ok: true, id: f.id }
}

export async function borrarPlantilla(tx: Transaccion, id: string): Promise<Resultado> {
  await tx.delete(crmPlantillas).where(eq(crmPlantillas.id, id))
  return { ok: true, id }
}

/** Datos de una oportunidad para completar plantillas. */
export async function datosParaPlantilla(tx: Transaccion, oportunidadId: string, usuarioId: string, empresa: string) {
  const [o] = await tx
    .select({
      titulo: crmOportunidades.titulo,
      contacto: crmOportunidades.contacto,
      cliente: sql<string | null>`coalesce(${terceros.razonSocial}, ${crmOportunidades.empresaProspecto})`,
    })
    .from(crmOportunidades)
    .leftJoin(terceros, eq(terceros.id, crmOportunidades.terceroId))
    .where(eq(crmOportunidades.id, oportunidadId))
  const [u] = await tx.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, usuarioId))
  return {
    oportunidad: o?.titulo ?? '',
    cliente: o?.cliente ?? '',
    contacto: o?.contacto?.split(' ')[0] || o?.cliente || '',
    vendedor: u?.nombre ?? '',
    empresa,
  }
}

// ------------------------------------------------------------- Llamadas, WhatsApp y email

export { DESENLACES_LLAMADA } from './plantillas'

/** Registra una llamada ya hecha (como el registro de llamadas de Frappe): queda como actividad hecha y en el historial. */
export async function registrarLlamada(
  tx: Transaccion,
  usuarioId: string,
  oportunidadId: string,
  entrada: { desenlace?: unknown; nota?: unknown },
): Promise<Resultado> {
  const p = z
    .object({
      desenlace: z.enum(Object.keys(DESENLACES_LLAMADA) as [keyof typeof DESENLACES_LLAMADA], {
        error: 'Elegí cómo salió la llamada.',
      }),
      nota: z
        .string()
        .trim()
        .max(1000)
        .nullable()
        .optional()
        .transform((v) => v || null),
    })
    .safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const desenlace = DESENLACES_LLAMADA[p.data.desenlace]
  const [a] = await tx
    .insert(crmActividades)
    .values({
      oportunidadId,
      tipo: 'llamada',
      resumen: `Llamada: ${desenlace.toLowerCase()}`,
      vence: hoyArgentina(),
      responsableId: usuarioId,
      hecha: true,
      hechaEl: new Date(),
      resultado: [desenlace, p.data.nota].filter(Boolean).join(' — '),
      usuarioId,
    })
    .returning()
  await historial(
    tx,
    oportunidadId,
    usuarioId,
    `Llamada (${desenlace.toLowerCase()})${p.data.nota ? `: ${p.data.nota}` : '.'}`,
    'llamada',
  )
  return { ok: true, id: a.id }
}

/** Deja constancia de un WhatsApp abierto desde la ficha (el mensaje lo manda la persona desde su teléfono). */
export async function registrarWhatsapp(tx: Transaccion, usuarioId: string, oportunidadId: string, texto: string) {
  await historial(tx, oportunidadId, usuarioId, texto.slice(0, 2000), 'whatsapp')
  return { ok: true as const, id: oportunidadId }
}

/** Manda un email desde la ficha (sale por la bandeja de correos de la empresa) y queda en el historial. */
export async function enviarEmail(
  tx: Transaccion,
  usuarioId: string,
  oportunidadId: string,
  entrada: { para?: unknown; asunto?: unknown; texto?: unknown },
): Promise<Resultado> {
  const p = z
    .object({
      para: z.string().trim().refine(emailValido, { error: 'Escribí un email válido.' }),
      asunto: z.string().trim().min(2, { error: 'Escribí el asunto.' }).max(200),
      texto: z.string().trim().min(2, { error: 'Escribí el mensaje.' }).max(10_000),
    })
    .safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const id = await encolarCorreo(tx, { ...p.data, entidad: 'crm_oportunidad', entidadId: oportunidadId, usuarioId })
  if (!id) return { ok: false, error: 'Escribí un email válido.' }
  await historial(tx, oportunidadId, usuarioId, `Para ${p.data.para}: «${p.data.asunto}»\n\n${p.data.texto}`, 'email')
  return { ok: true, id }
}

// ------------------------------------------------------------- Edición en línea y acciones masivas

const CAMPOS_EDITABLES = [
  'titulo',
  'ingresoEsperado',
  'probabilidad',
  'cierreEstimado',
  'responsableId',
  'origen',
  'proximoPaso',
  'prioridad',
  'etiquetas',
  'contacto',
  'email',
  'telefono',
] as const
export type CampoEditable = (typeof CAMPOS_EDITABLES)[number]

const NOMBRE_CAMPO: Record<CampoEditable, string> = {
  titulo: 'el título',
  ingresoEsperado: 'el ingreso esperado',
  probabilidad: 'la probabilidad',
  cierreEstimado: 'el cierre estimado',
  responsableId: 'el responsable',
  origen: 'el origen',
  proximoPaso: 'el próximo paso',
  prioridad: 'la prioridad',
  etiquetas: 'las etiquetas',
  contacto: 'el contacto',
  email: 'el email',
  telefono: 'el teléfono',
}

/** Cambia un solo campo, con las mismas validaciones que el formulario completo. */
export async function actualizarCampo(
  tx: Transaccion,
  usuarioId: string,
  id: string,
  campo: string,
  valor: unknown,
): Promise<Resultado> {
  if (!CAMPOS_EDITABLES.includes(campo as CampoEditable)) return { ok: false, error: 'Ese dato no se puede editar acá.' }
  const [o] = await tx.select().from(crmOportunidades).where(eq(crmOportunidades.id, id))
  if (!o) return { ok: false, error: 'No existe esa oportunidad.' }
  const entrada = {
    titulo: o.titulo,
    terceroId: o.terceroId,
    empresaProspecto: o.empresaProspecto,
    contacto: o.contacto,
    email: o.email,
    telefono: o.telefono,
    etapaId: o.etapaId,
    ingresoEsperado: o.ingresoEsperado,
    probabilidad: o.probabilidad,
    cierreEstimado: o.cierreEstimado,
    prioridad: o.prioridad,
    responsableId: o.responsableId,
    origen: o.origen,
    etiquetas: o.etiquetas,
    descripcion: o.descripcion,
    proximoPaso: o.proximoPaso,
    [campo]: valor,
  }
  const r = await guardarOportunidad(tx, usuarioId, entrada, id)
  if (!r.ok) return r
  if (campo === 'responsableId' || campo === 'cierreEstimado' || campo === 'ingresoEsperado') {
    await historial(tx, id, usuarioId, `Cambió ${NOMBRE_CAMPO[campo as CampoEditable]}.`)
  }
  return r
}

export async function moverVarias(tx: Transaccion, usuarioId: string, ids: string[], etapaId: string) {
  let movidas = 0
  for (const id of ids.slice(0, 200)) if ((await moverOportunidad(tx, usuarioId, id, etapaId)).ok) movidas++
  return { ok: true as const, movidas }
}

export async function asignarVarias(tx: Transaccion, usuarioId: string, ids: string[], responsableId: string | null) {
  const lista = ids.slice(0, 200)
  if (!lista.length) return { ok: true as const, asignadas: 0 }
  const filas = await tx
    .update(crmOportunidades)
    .set({ responsableId, actualizado: new Date() })
    .where(inArray(crmOportunidades.id, lista))
    .returning({ id: crmOportunidades.id })
  for (const f of filas)
    await tx.insert(crmHistorial).values({ oportunidadId: f.id, usuarioId, texto: 'Cambió el responsable.', tipo: 'cambio' })
  return { ok: true as const, asignadas: filas.length }
}

// ------------------------------------------------------------- Ajustes y asignación rotativa

export async function obtenerAjustes(tx: Transaccion) {
  const [a] = await tx.select().from(crmAjustes)
  if (a) return a
  const [nuevo] = await tx.insert(crmAjustes).values({}).onConflictDoNothing().returning()
  return nuevo ?? (await tx.select().from(crmAjustes))[0]
}

export async function guardarAjustes(
  tx: Transaccion,
  entrada: { asignacion?: unknown; vendedores?: unknown; resumenDiario?: unknown },
): Promise<Resultado<{ id: string }>> {
  const p = z
    .object({
      asignacion: z.enum(['ninguna', 'rotativa']),
      vendedores: z.array(z.uuid()).max(50).default([]),
      resumenDiario: z.boolean().default(true),
    })
    .safeParse(entrada)
  if (!p.success) return { ok: false, error: 'Revisá los ajustes.' }
  if (p.data.asignacion === 'rotativa' && !p.data.vendedores.length) {
    return { ok: false, error: 'Elegí al menos un vendedor para repartir.' }
  }
  const a = await obtenerAjustes(tx)
  await tx
    .update(crmAjustes)
    .set({ ...p.data, actualizado: new Date() })
    .where(eq(crmAjustes.id, a.id))
  return { ok: true, id: a.id }
}

/** Próximo vendedor de la rueda (o nadie si la asignación no es rotativa). */
export async function siguienteVendedor(tx: Transaccion): Promise<string | null> {
  const a = await obtenerAjustes(tx)
  if (a.asignacion !== 'rotativa' || !a.vendedores.length) return null
  const i = (a.ultimoAsignado + 1) % a.vendedores.length
  await tx.update(crmAjustes).set({ ultimoAsignado: i }).where(eq(crmAjustes.id, a.id))
  return a.vendedores[i]
}

// ------------------------------------------------------------- Formulario web

export async function formularioDeEmpresa(empresaId: string) {
  const [f] = await comoPlataforma((tx) => tx.select().from(crmFormularios).where(eq(crmFormularios.empresaId, empresaId)))
  return f ?? null
}

/** Crea (o regenera) el token del formulario web de la empresa. */
export async function activarFormulario(empresaId: string, regenerar = false) {
  const token = randomBytes(18).toString('base64url')
  return comoPlataforma(async (tx) => {
    const [actual] = await tx.select().from(crmFormularios).where(eq(crmFormularios.empresaId, empresaId))
    if (actual && !regenerar) {
      await tx.update(crmFormularios).set({ activo: true }).where(eq(crmFormularios.empresaId, empresaId))
      return actual.token
    }
    if (actual) await tx.update(crmFormularios).set({ token, activo: true }).where(eq(crmFormularios.empresaId, empresaId))
    else await tx.insert(crmFormularios).values({ token, empresaId })
    return token
  })
}

export async function desactivarFormulario(empresaId: string) {
  await comoPlataforma((tx) => tx.update(crmFormularios).set({ activo: false }).where(eq(crmFormularios.empresaId, empresaId)))
}

const EsquemaConsulta = z.object({
  nombre: z.string().trim().min(2, { error: 'Escribí tu nombre.' }).max(120),
  empresa: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null)
    .refine((v) => !v || emailValido(v), { error: 'El email no es válido.' }),
  telefono: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => v || null),
  mensaje: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => v || null),
  interes: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
})

/**
 * Consulta que llega del sitio de la empresa: crea la oportunidad en la
 * primera etapa, la asigna (rotativa o sin asignar) y agenda responderla hoy.
 */
export async function recibirConsulta(token: string, datos: Record<string, unknown>): Promise<Resultado> {
  const f = await comoPlataforma(async (tx) => (await tx.select().from(crmFormularios).where(eq(crmFormularios.token, token)))[0])
  if (!f || !f.activo) return { ok: false, error: 'Formulario inexistente.' }
  const p = EsquemaConsulta.safeParse(datos)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const d = p.data
  if (!d.email && !d.telefono) return { ok: false, error: 'Dejanos un email o un teléfono para responderte.' }
  return conEmpresa(f.empresaId, async (tx) => {
    const [etapa] = await asegurarEtapas(tx)
    const responsable = await siguienteVendedor(tx)
    // Las funciones de alta piden un usuario: se usa uno "nadie" y después se deja el responsable real (o vacío).
    const r = await guardarOportunidad(tx, responsable ?? '00000000-0000-0000-0000-000000000000', {
      titulo: d.interes ? `${d.interes} — ${d.empresa ?? d.nombre}` : `Consulta web de ${d.empresa ?? d.nombre}`,
      empresaProspecto: d.empresa,
      contacto: d.nombre,
      email: d.email,
      telefono: d.telefono,
      etapaId: etapa.id,
      origen: f.origen,
      responsableId: responsable,
      descripcion: d.mensaje,
      etiquetas: ['web'],
    })
    if (!r.ok) return r
    // Sin responsable, el alta no queda a nombre de un usuario inexistente.
    await tx
      .update(crmOportunidades)
      .set({ responsableId: responsable, usuarioId: responsable })
      .where(eq(crmOportunidades.id, r.id))
    await agendarActividad(tx, responsable ?? '00000000-0000-0000-0000-000000000000', r.id, {
      tipo: d.telefono ? 'llamada' : 'email',
      resumen: 'Responder la consulta del sitio',
      vence: hoyArgentina(),
      responsableId: responsable,
    })
    await tx
      .update(crmActividades)
      .set({ usuarioId: responsable, responsableId: responsable })
      .where(eq(crmActividades.oportunidadId, r.id))
    await tx.update(crmHistorial).set({ usuarioId: responsable }).where(eq(crmHistorial.oportunidadId, r.id))
    return r
  })
}

// ------------------------------------------------------------- Resumen diario

/**
 * Un email por vendedor con sus actividades vencidas y de hoy. Se manda una
 * vez por día (lo llama la tarea periódica) y solo si hay algo.
 */
export async function resumenDiario(tx: Transaccion, empresaId: string, hoy = hoyArgentina()) {
  const a = await obtenerAjustes(tx)
  if (!a.resumenDiario || (a.ultimoResumen && a.ultimoResumen >= hoy)) return { enviados: 0 }
  const pendientes = await tx
    .select({
      responsableId: crmActividades.responsableId,
      tipo: crmActividades.tipo,
      resumen: crmActividades.resumen,
      vence: crmActividades.vence,
      oportunidad: crmOportunidades.titulo,
      oportunidadId: crmOportunidades.id,
    })
    .from(crmActividades)
    .innerJoin(crmOportunidades, eq(crmOportunidades.id, crmActividades.oportunidadId))
    .where(
      and(eq(crmActividades.hecha, false), sql`${crmActividades.vence} <= ${hoy}::date`, eq(crmOportunidades.estado, 'abierta')),
    )
    .orderBy(asc(crmActividades.vence))
  const porPersona = new Map<string, typeof pendientes>()
  for (const p of pendientes) {
    if (!p.responsableId) continue
    porPersona.set(p.responsableId, [...(porPersona.get(p.responsableId) ?? []), p])
  }
  const personas = porPersona.size
    ? await tx
        .select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email })
        .from(membresias)
        .innerJoin(usuarios, eq(usuarios.id, membresias.usuarioId))
        .where(and(eq(membresias.empresaId, empresaId), inArray(usuarios.id, [...porPersona.keys()]), eq(usuarios.activo, true)))
    : []
  const app = (process.env.APP_URL ?? '').replace(/\/+$/, '')
  let enviados = 0
  for (const u of personas) {
    const lista = porPersona.get(u.id)!
    const vencidas = lista.filter((x) => x.vence < hoy).length
    const texto = [
      `Hola ${u.nombre.split(' ')[0]}:`,
      '',
      `Tenés ${lista.length} ${lista.length === 1 ? 'actividad' : 'actividades'} para hoy${vencidas ? ` (${vencidas} vencidas)` : ''}:`,
      '',
      ...lista.map(
        (x) =>
          `• ${x.vence < hoy ? '[vencida] ' : ''}${x.resumen} — ${x.oportunidad}${app ? `\n  ${app}/crm/${x.oportunidadId}` : ''}`,
      ),
      '',
      app ? `Todas tus actividades: ${app}/crm/actividades` : '',
    ].join('\n')
    if (
      await encolarCorreo(tx, {
        para: u.email,
        asunto: `Tus actividades de hoy (${lista.length})`,
        texto,
        entidad: 'crm_resumen',
      })
    )
      enviados++
  }
  await tx.update(crmAjustes).set({ ultimoResumen: hoy }).where(eq(crmAjustes.id, a.id))
  return { enviados }
}

export { asegurarEtapas }
