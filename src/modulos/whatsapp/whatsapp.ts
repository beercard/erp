import { randomBytes } from 'node:crypto'

import { and, asc, desc, eq, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { comoPlataforma, conEmpresa } from '../../db/empresa'
import {
  membresias,
  terceros,
  usuarios,
  whatsappAutorizados,
  whatsappConversaciones,
  whatsappCuentas,
  whatsappMensajes,
  whatsappNumeros,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { cifrar, descifrar } from '../arca/certificado'
import {
  enviarPlantilla,
  enviarTexto,
  ErrorWhatsapp,
  firmaValida,
  leerAviso,
  normalizarTelefono,
  type CredencialesWA,
  type Fetch,
  type MensajeEntrante,
} from './api'

/**
 * WhatsApp Business de cada empresa: conexión del número, recepción de los
 * avisos de Meta, conversaciones y envío de mensajes respetando la ventana
 * de 24 horas (fuera de ella, solo con una plantilla aprobada).
 *
 * Lo que va por la red queda fuera de las transacciones.
 */

type Resultado<T = { id: string }> = ({ ok: true } & T) | { ok: false; error: string }

const VENTANA_MS = 24 * 3_600_000
export const base = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
export const urlAvisos = (clave: string) => `${base()}/api/whatsapp/${clave}`

// ------------------------------------------------------------------ Cuenta

export async function cuentaDeEmpresa(tx: Transaccion) {
  const [c] = await tx.select().from(whatsappCuentas)
  if (!c) return null
  const { token: _t, secretoApp: _s, ...resto } = c
  void _t
  void _s
  return resto
}

/** Para mandar: las credenciales descifradas (no salen del servidor). */
export async function credencialesDe(empresaId: string) {
  const [c] = await conEmpresa(empresaId, (tx) => tx.select().from(whatsappCuentas))
  if (!c || !c.activa) return null
  return { cuenta: c, credenciales: { numeroId: c.numeroId, token: descifrar(c.token) } satisfies CredencialesWA }
}

export async function claveDeEmpresa(empresaId: string) {
  const [n] = await comoPlataforma((tx) => tx.select().from(whatsappNumeros).where(eq(whatsappNumeros.empresaId, empresaId)))
  return n?.clave ?? null
}

const EsquemaCuenta = z.object({
  numeroId: z
    .string()
    .trim()
    .regex(/^\d{6,30}$/, { error: 'El "Phone number ID" son solo números (está en Meta → WhatsApp → Configuración de la API).' }),
  token: z.string().trim().max(1000).optional(),
  secretoApp: z.string().trim().max(200).optional(),
  plantilla: z
    .string()
    .trim()
    .max(512)
    .regex(/^[a-z0-9_]*$/, { error: 'El nombre de la plantilla va en minúsculas, números y guiones bajos.' })
    .optional()
    .transform((v) => v || null),
  idioma: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(_[A-Z]{2})?$/, { error: 'Idioma inválido (ej.: es_AR).' })
    .default('es_AR'),
  agente: z.boolean().default(false),
  registroFacturas: z.boolean().default(false),
  instrucciones: z
    .string()
    .trim()
    .max(3000)
    .optional()
    .transform((v) => v || null),
  activa: z.boolean().default(true),
})

/**
 * Guarda la conexión. El número y el token ya se probaron contra Meta (en la
 * acción, fuera de la transacción); acá se valida y se cifra. Un mismo número
 * no puede estar en dos empresas.
 */
export async function guardarCuenta(
  tx: Transaccion,
  usuarioId: string,
  empresaId: string,
  entrada: unknown,
  verificado?: { numero?: string; nombre?: string },
): Promise<Resultado<{ id: string; clave: string }>> {
  const p = EsquemaCuenta.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const d = p.data
  const [actual] = await tx.select().from(whatsappCuentas)
  const token = d.token || (actual ? descifrar(actual.token) : '')
  const secreto = d.secretoApp || (actual ? descifrar(actual.secretoApp) : '')
  if (token.length < 20) return { ok: false, error: 'Pegá el token de acceso permanente (usuario del sistema).' }
  if (!/^[a-f0-9]{32}$/i.test(secreto))
    return { ok: false, error: 'El "App secret" son 32 caracteres (Meta → Configuración de la app → Básica).' }
  const [otra] = await tx.select().from(whatsappNumeros).where(eq(whatsappNumeros.numeroId, d.numeroId))
  if (otra && otra.empresaId !== empresaId)
    return { ok: false, error: 'Ese número de WhatsApp ya está conectado a otra empresa.' }
  const valores = {
    numeroId: d.numeroId,
    token: cifrar(token),
    secretoApp: cifrar(secreto),
    plantilla: d.plantilla,
    idioma: d.idioma,
    agente: d.agente,
    registroFacturas: d.registroFacturas,
    instrucciones: d.instrucciones,
    activa: d.activa,
    ...(verificado?.numero ? { numero: verificado.numero } : {}),
    ...(verificado?.nombre ? { nombreVerificado: verificado.nombre } : {}),
    actualizado: new Date(),
  }
  let id: string
  if (actual) {
    await tx.update(whatsappCuentas).set(valores).where(eq(whatsappCuentas.id, actual.id))
    id = actual.id
  } else {
    const [n] = await tx
      .insert(whatsappCuentas)
      .values({ ...valores, tokenVerificacion: randomBytes(18).toString('base64url') })
      .returning()
    id = n.id
  }
  const [cuenta] = await tx.select().from(whatsappCuentas).where(eq(whatsappCuentas.id, id))
  const [registro] = await tx.select().from(whatsappNumeros).where(eq(whatsappNumeros.empresaId, cuenta.empresaId))
  let clave = registro?.clave
  if (registro) await tx.update(whatsappNumeros).set({ numeroId: d.numeroId }).where(eq(whatsappNumeros.clave, registro.clave))
  else {
    clave = randomBytes(18).toString('base64url')
    await tx.insert(whatsappNumeros).values({ clave, numeroId: d.numeroId, empresaId: cuenta.empresaId })
  }
  await auditar(tx, {
    usuarioId,
    accion: actual ? 'modificacion' : 'alta',
    entidad: 'whatsapp_cuenta',
    entidadId: id,
    despues: { numeroId: d.numeroId, agente: d.agente, registroFacturas: d.registroFacturas, plantilla: d.plantilla },
  })
  return { ok: true, id, clave: clave! }
}

export async function desconectarCuenta(tx: Transaccion, usuarioId: string) {
  const [c] = await tx.select().from(whatsappCuentas)
  if (!c) return { ok: true as const }
  await tx.delete(whatsappNumeros).where(eq(whatsappNumeros.empresaId, c.empresaId))
  await tx.delete(whatsappCuentas).where(eq(whatsappCuentas.id, c.id))
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'whatsapp_cuenta', entidadId: c.id })
  return { ok: true as const }
}

// ------------------------------------------------------------------ Autorizados (registro de facturas)

export async function listarAutorizados(tx: Transaccion) {
  return tx
    .select({
      id: whatsappAutorizados.id,
      telefono: whatsappAutorizados.telefono,
      usuarioId: whatsappAutorizados.usuarioId,
      nombre: usuarios.nombre,
    })
    .from(whatsappAutorizados)
    .leftJoin(usuarios, eq(usuarios.id, whatsappAutorizados.usuarioId))
    .orderBy(asc(usuarios.nombre))
}

export async function autorizar(
  tx: Transaccion,
  usuarioId: string,
  empresaId: string,
  entrada: { usuarioId?: unknown; telefono?: unknown },
) {
  const persona = String(entrada.usuarioId ?? '')
  const telefono = normalizarTelefono(String(entrada.telefono ?? ''))
  if (telefono.length < 10) return { ok: false as const, error: 'Escribí el celular con característica (ej.: 11 5555-1234).' }
  const [m] = await tx
    .select({ id: membresias.usuarioId })
    .from(membresias)
    .where(and(eq(membresias.empresaId, empresaId), eq(membresias.usuarioId, persona)))
  if (!m) return { ok: false as const, error: 'Elegí una persona de la empresa.' }
  await tx
    .insert(whatsappAutorizados)
    .values({ usuarioId: persona, telefono })
    .onConflictDoUpdate({
      target: [whatsappAutorizados.empresaId, whatsappAutorizados.telefono],
      set: { usuarioId: persona, actualizado: new Date() },
    })
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'whatsapp_autorizado', despues: { usuarioId: persona, telefono } })
  return { ok: true as const }
}

export async function quitarAutorizado(tx: Transaccion, id: string) {
  await tx.delete(whatsappAutorizados).where(eq(whatsappAutorizados.id, id))
  return { ok: true as const }
}

// ------------------------------------------------------------------ Avisos de Meta

/** El GET con que Meta verifica la dirección: devuelve el desafío si el token coincide. */
export async function verificarSuscripcion(clave: string, q: URLSearchParams) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(clave) || q.get('hub.mode') !== 'subscribe') return null
  const [n] = await comoPlataforma((tx) => tx.select().from(whatsappNumeros).where(eq(whatsappNumeros.clave, clave)))
  if (!n) return null
  const [c] = await conEmpresa(n.empresaId, (tx) => tx.select({ token: whatsappCuentas.tokenVerificacion }).from(whatsappCuentas))
  return c && q.get('hub.verify_token') === c.token ? q.get('hub.challenge') : null
}

/** Busca el cliente por el teléfono: candidatos por los últimos 8 dígitos y se comparan normalizados. */
async function clientePorTelefono(tx: Transaccion, telefono: string) {
  const fin = telefono.slice(-8)
  if (fin.length < 8) return null
  const candidatos = await tx
    .select({ id: terceros.id, telefono: terceros.telefono })
    .from(terceros)
    .where(sql`regexp_replace(coalesce(${terceros.telefono}, ''), '[^0-9]', '', 'g') like ${'%' + fin}`)
    .limit(20)
  return candidatos.find((c) => normalizarTelefono(c.telefono ?? '') === telefono)?.id ?? null
}

async function autorizadoPorTelefono(tx: Transaccion, telefono: string) {
  const fin = telefono.slice(-10)
  const [a] = await tx
    .select({ usuarioId: whatsappAutorizados.usuarioId })
    .from(whatsappAutorizados)
    .where(sql`right(${whatsappAutorizados.telefono}, 10) = ${fin}`)
    .limit(1)
  return a?.usuarioId ?? null
}

export type Entrante = { empresaId: string; conversacionId: string; mensajeId: string; mensaje: MensajeEntrante }

/**
 * Procesa un aviso de Meta: verifica la firma con el app secret de la
 * empresa, guarda los mensajes nuevos (sin duplicar) y los estados de los
 * enviados. Devuelve los mensajes nuevos para atenderlos después de responder.
 */
export async function recibirAviso(clave: string, cuerpo: string, firma: string | null): Promise<Entrante[] | null> {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(clave)) return null
  const [n] = await comoPlataforma((tx) => tx.select().from(whatsappNumeros).where(eq(whatsappNumeros.clave, clave)))
  if (!n) return null
  return conEmpresa(n.empresaId, async (tx) => {
    const [c] = await tx.select().from(whatsappCuentas)
    if (!c || !firmaValida(cuerpo, firma, descifrar(c.secretoApp))) return null
    let json: unknown
    try {
      json = JSON.parse(cuerpo)
    } catch {
      return []
    }
    const { mensajes, estados } = leerAviso(json, c.numeroId)
    for (const s of estados) {
      await tx
        .update(whatsappMensajes)
        .set({ estado: s.estado, error: s.error })
        .where(and(eq(whatsappMensajes.externoId, s.externoId), eq(whatsappMensajes.direccion, 'saliente')))
    }
    const nuevos: Entrante[] = []
    for (const m of mensajes) {
      const conv = await conversacionPara(tx, m.de, m.nombre)
      const [g] = await tx
        .insert(whatsappMensajes)
        .values({
          conversacionId: conv.id,
          direccion: 'entrante',
          autor: conv.usuarioId ? 'usuario' : 'cliente',
          usuarioId: conv.usuarioId,
          tipo: m.tipo,
          texto: m.texto,
          medio: m.medio,
          externoId: m.externoId,
          estado: 'recibido',
          creado: m.fecha,
        })
        .onConflictDoNothing()
        .returning({ id: whatsappMensajes.id })
      if (!g) continue // Meta reintenta los avisos: ya estaba.
      await tx
        .update(whatsappConversaciones)
        .set({
          ultimoEntrante: m.fecha,
          ultimoMensaje: m.fecha,
          noLeidos: sql`${whatsappConversaciones.noLeidos} + 1`,
          estado: 'abierta',
          ...(m.nombre ? { nombre: m.nombre } : {}),
          actualizado: new Date(),
        })
        .where(eq(whatsappConversaciones.id, conv.id))
      nuevos.push({ empresaId: n.empresaId, conversacionId: conv.id, mensajeId: g.id, mensaje: m })
    }
    return nuevos
  })
}

async function conversacionPara(tx: Transaccion, telefono: string, nombre: string | null) {
  const [c] = await tx.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.telefono, telefono))
  if (c) {
    // Si todavía no se sabía de quién era, se vuelve a buscar (pudieron cargar el teléfono del cliente).
    if (!c.terceroId && !c.usuarioId) {
      const [terceroId, usuarioId] = [await clientePorTelefono(tx, telefono), await autorizadoPorTelefono(tx, telefono)]
      if (terceroId || usuarioId) {
        await tx.update(whatsappConversaciones).set({ terceroId, usuarioId }).where(eq(whatsappConversaciones.id, c.id))
        return { ...c, terceroId, usuarioId }
      }
    }
    return c
  }
  const usuarioId = await autorizadoPorTelefono(tx, telefono)
  const [n] = await tx
    .insert(whatsappConversaciones)
    .values({
      telefono,
      nombre,
      terceroId: usuarioId ? null : await clientePorTelefono(tx, telefono),
      usuarioId,
      // Las conversaciones con gente de la empresa no las atiende el agente.
      atiende: usuarioId ? 'humano' : 'agente',
    })
    .returning()
  return n
}

// ------------------------------------------------------------------ Envío

/**
 * Manda un texto a una conversación. Dentro de las 24 horas va como mensaje
 * común; fuera, con la plantilla aprobada (si hay) o no se puede.
 */
export async function enviarAConversacion(
  empresaId: string,
  conversacionId: string,
  texto: string,
  autor: { tipo: 'usuario' | 'agente' | 'sistema'; usuarioId?: string | null },
  f: Fetch = fetch,
): Promise<Resultado> {
  const t = texto.trim()
  if (!t) return { ok: false, error: 'Escribí el mensaje.' }
  const cred = await credencialesDe(empresaId)
  if (!cred) return { ok: false, error: 'WhatsApp no está conectado.' }
  const [conv] = await conEmpresa(empresaId, (tx) =>
    tx.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.id, conversacionId)),
  )
  if (!conv) return { ok: false, error: 'Esa conversación no existe.' }
  const dentro = conv.ultimoEntrante && Date.now() - conv.ultimoEntrante.getTime() < VENTANA_MS
  if (!dentro && !cred.cuenta.plantilla) {
    return {
      ok: false,
      error: 'Pasaron más de 24 horas desde el último mensaje del contacto: configurá una plantilla aprobada para escribirle.',
    }
  }
  let externoId: string | null = null
  let error: string | null = null
  try {
    externoId = dentro
      ? await enviarTexto(f, cred.credenciales, conv.telefono, t)
      : await enviarPlantilla(f, cred.credenciales, conv.telefono, cred.cuenta.plantilla!, cred.cuenta.idioma, t)
  } catch (e) {
    error = e instanceof ErrorWhatsapp ? e.message : 'No se pudo mandar.'
  }
  const [m] = await conEmpresa(empresaId, async (tx) => {
    await tx
      .update(whatsappConversaciones)
      .set({ ultimoMensaje: new Date(), noLeidos: 0, actualizado: new Date() })
      .where(eq(whatsappConversaciones.id, conversacionId))
    return tx
      .insert(whatsappMensajes)
      .values({
        conversacionId,
        direccion: 'saliente',
        autor: autor.tipo,
        usuarioId: autor.usuarioId ?? null,
        tipo: dentro ? 'text' : 'template',
        texto: t,
        externoId,
        estado: error ? 'fallido' : 'enviado',
        error,
      })
      .returning({ id: whatsappMensajes.id })
  })
  return error ? { ok: false, error } : { ok: true, id: m.id }
}

/** Escribe a un número (de un cliente, desde una factura o un link de pago): busca o abre la conversación. */
export async function enviarATelefono(
  empresaId: string,
  telefono: string,
  texto: string,
  autor: { tipo: 'usuario' | 'sistema'; usuarioId?: string | null },
  terceroId?: string | null,
  f: Fetch = fetch,
) {
  const numero = normalizarTelefono(telefono)
  if (numero.length < 10) return { ok: false as const, error: 'El teléfono del cliente no es válido.' }
  const conv = await conEmpresa(empresaId, async (tx) => {
    const c = await conversacionPara(tx, numero, null)
    if (terceroId && !c.terceroId && !c.usuarioId) {
      await tx.update(whatsappConversaciones).set({ terceroId }).where(eq(whatsappConversaciones.id, c.id))
    }
    return c
  })
  return enviarAConversacion(empresaId, conv.id, texto, autor, f)
}

// ------------------------------------------------------------------ Bandeja

export async function listarConversaciones(
  tx: Transaccion,
  filtro: { q?: string; estado?: 'abierta' | 'cerrada' | 'todas' } = {},
) {
  const q = filtro.q?.trim()
  return tx
    .select({
      id: whatsappConversaciones.id,
      telefono: whatsappConversaciones.telefono,
      nombre: whatsappConversaciones.nombre,
      cliente: terceros.razonSocial,
      terceroId: whatsappConversaciones.terceroId,
      usuarioId: whatsappConversaciones.usuarioId,
      atiende: whatsappConversaciones.atiende,
      estado: whatsappConversaciones.estado,
      noLeidos: whatsappConversaciones.noLeidos,
      ultimoMensaje: whatsappConversaciones.ultimoMensaje,
      ultimoEntrante: whatsappConversaciones.ultimoEntrante,
      ultimo: sql<
        string | null
      >`(select texto from whatsapp_mensajes m where m.conversacion_id = ${whatsappConversaciones.id} order by m.creado desc limit 1)`,
    })
    .from(whatsappConversaciones)
    .leftJoin(terceros, eq(terceros.id, whatsappConversaciones.terceroId))
    .where(
      and(
        filtro.estado && filtro.estado !== 'todas' ? eq(whatsappConversaciones.estado, filtro.estado) : undefined,
        q
          ? sql`(${whatsappConversaciones.nombre} ilike ${'%' + q + '%'} or ${whatsappConversaciones.telefono} like ${'%' + q.replace(/\D/g, '') + '%'} or ${terceros.razonSocial} ilike ${'%' + q + '%'})`
          : undefined,
      ),
    )
    .orderBy(desc(whatsappConversaciones.ultimoMensaje))
    .limit(200)
}

export async function obtenerConversacion(tx: Transaccion, id: string) {
  const [c] = await tx
    .select({ conv: whatsappConversaciones, cliente: terceros.razonSocial })
    .from(whatsappConversaciones)
    .leftJoin(terceros, eq(terceros.id, whatsappConversaciones.terceroId))
    .where(eq(whatsappConversaciones.id, id))
  if (!c) return null
  const mensajes = await tx
    .select({ m: whatsappMensajes, usuario: usuarios.nombre })
    .from(whatsappMensajes)
    .leftJoin(usuarios, eq(usuarios.id, whatsappMensajes.usuarioId))
    .where(eq(whatsappMensajes.conversacionId, id))
    .orderBy(desc(whatsappMensajes.creado))
    .limit(300)
  await tx.update(whatsappConversaciones).set({ noLeidos: 0 }).where(eq(whatsappConversaciones.id, id))
  const dentro = Boolean(c.conv.ultimoEntrante && Date.now() - c.conv.ultimoEntrante.getTime() < VENTANA_MS)
  return {
    ...c.conv,
    cliente: c.cliente,
    dentroDeVentana: dentro,
    mensajes: mensajes.reverse().map((x) => ({ ...x.m, usuario: x.usuario })),
  }
}

/** Quién atiende: una persona (el agente se calla) o el agente. También cerrar o reabrir. */
export async function cambiarConversacion(
  tx: Transaccion,
  usuarioId: string,
  id: string,
  cambio: { atiende?: 'agente' | 'humano'; estado?: 'abierta' | 'cerrada'; terceroId?: string | null },
) {
  const set: Partial<typeof whatsappConversaciones.$inferInsert> = { actualizado: new Date() }
  if (cambio.atiende) {
    set.atiende = cambio.atiende
    set.asignadoA = cambio.atiende === 'humano' ? usuarioId : null
  }
  if (cambio.estado) set.estado = cambio.estado
  if (cambio.terceroId !== undefined) {
    if (cambio.terceroId) {
      const [t] = await tx.select({ id: terceros.id }).from(terceros).where(eq(terceros.id, cambio.terceroId))
      if (!t) return { ok: false as const, error: 'Ese cliente no existe.' }
    }
    set.terceroId = cambio.terceroId
  }
  await tx.update(whatsappConversaciones).set(set).where(eq(whatsappConversaciones.id, id))
  return { ok: true as const }
}

/** Para avisar en el menú: conversaciones con mensajes sin leer. */
export async function sinLeer(tx: Transaccion) {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(whatsappConversaciones)
    .where(and(eq(whatsappConversaciones.estado, 'abierta'), sql`${whatsappConversaciones.noLeidos} > 0`))
  return Number(r?.n ?? 0)
}
