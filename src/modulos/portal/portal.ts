import { createHash, randomBytes } from 'node:crypto'

import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { comoPlataforma, conEmpresa } from '../../db/empresa'
import {
  archivosServicio,
  empresas,
  equipos,
  modelosEquipo,
  ordenesServicio,
  sesionesPortal,
  terceros,
  tiposOrden,
  usuariosPortal,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { hashearClave, problemaDeClave, verificarClave } from '../../lib/auth/clave'
import { hoyArgentina } from '../../lib/fechas'
import { primerError } from '../comercial/documentos'
import { emailValido, encolarCorreo } from '../comunicaciones/correo'
import { registrarLectura } from '../contratos/contratos'
import { emitir } from '../integraciones/webhooks'
import { crearEncuesta } from '../servicio/avisos'
import { obtenerConfiguracion } from '../servicio/configuracion'
import { guardarOrden, obtenerOrden } from '../servicio/servicio'
import { tiposParaOrden } from '../servicio/tiposOrden'

/**
 * Portal de clientes (como el de Persat): el cliente entra con su usuario,
 * ve sus equipos y sus órdenes, pide servicio y carga contadores.
 *
 * El aislamiento por empresa lo da la base (RLS); el de cada cliente dentro
 * de la empresa no, así que TODA consulta de acá filtra por terceroId.
 */

export const DIAS_SESION_PORTAL = 30
const DIAS_INVITACION = 7

const sha = (v: string) => createHash('sha256').update(v).digest('hex')

/** Token "empresaId.secreto": el id dice en qué empresa buscar, en la base queda el hash. */
function nuevoToken(empresaId: string) {
  const token = `${empresaId}.${randomBytes(32).toString('base64url')}`
  return { token, hash: sha(token) }
}
function leerToken(token: string | undefined | null) {
  const m = /^([0-9a-f-]{36})\.[A-Za-z0-9_-]{40,64}$/i.exec(token ?? '')
  return m ? { empresaId: m[1].toLowerCase(), hash: sha(token!) } : null
}

const nombreEmpresa = (e: { razonSocial: string; nombreFantasia: string | null }) => e.nombreFantasia || e.razonSocial

/** Empresa por CUIT (la dirección del portal es /portal/ingresar?empresa=<cuit>). */
export async function empresaDelPortal(cuit: string) {
  const limpio = cuit.replace(/\D/g, '')
  if (limpio.length !== 11) return null
  const [e] = await comoPlataforma((tx) =>
    tx
      .select({
        id: empresas.id,
        razonSocial: empresas.razonSocial,
        nombreFantasia: empresas.nombreFantasia,
        activa: empresas.activa,
      })
      .from(empresas)
      .where(eq(empresas.cuit, limpio)),
  )
  if (!e?.activa) return null
  const config = await conEmpresa(e.id, (tx) => obtenerConfiguracion(tx))
  if (!config.portal) return null
  return { id: e.id, nombre: nombreEmpresa(e), color: config.portalColor }
}

// ---------------------------------------------------------------- Usuarios (desde la oficina)

const EsquemaInvitacion = z.object({
  terceroId: z.uuid({ error: 'Elegí el cliente.' }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'El email no es válido.' })),
  nombre: z
    .string()
    .trim()
    .max(120)
    .transform((v) => v || null),
})

/**
 * Invita a un usuario del cliente (o le reenvía la invitación): le llega un
 * enlace para elegir su contraseña. Devuelve el enlace para mandarlo también
 * por WhatsApp.
 */
export async function invitarAlPortal(tx: Transaccion, usuarioId: string, empresaId: string, base: string, entrada: unknown) {
  const p = EsquemaInvitacion.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const d = p.data
  const [cliente] = await tx.select().from(terceros).where(eq(terceros.id, d.terceroId))
  if (!cliente) return { ok: false as const, error: 'El cliente no existe.' }
  const [ya] = await tx.select().from(usuariosPortal).where(eq(usuariosPortal.email, d.email))
  if (ya && ya.terceroId !== d.terceroId) return { ok: false as const, error: 'Ese email ya entra al portal por otro cliente.' }

  const { token, hash } = nuevoToken(empresaId)
  const vence = new Date(Date.now() + DIAS_INVITACION * 86_400_000)
  let id = ya?.id
  if (ya) {
    await tx
      .update(usuariosPortal)
      .set({ nombre: d.nombre ?? ya.nombre, invitacionHash: hash, invitacionVence: vence, activo: true })
      .where(eq(usuariosPortal.id, ya.id))
  } else {
    ;[{ id }] = await tx
      .insert(usuariosPortal)
      .values({ terceroId: d.terceroId, email: d.email, nombre: d.nombre, invitacionHash: hash, invitacionVence: vence })
      .returning({ id: usuariosPortal.id })
  }
  await auditar(tx, { usuarioId, accion: ya ? 'modificacion' : 'alta', entidad: 'usuario_portal', entidadId: id, despues: d })

  const [empresa] = await tx
    .select({ razonSocial: empresas.razonSocial, nombreFantasia: empresas.nombreFantasia })
    .from(empresas)
    .where(eq(empresas.id, empresaId))
  const quien = empresa ? nombreEmpresa(empresa) : ''
  const config = await obtenerConfiguracion(tx)
  const enlace = `${base}/portal/invitacion/${token}`
  const texto =
    `Hola${d.nombre ? ` ${d.nombre}` : ''}:\n\n` +
    `${quien} te invita a su portal de clientes. Desde ahí ves tus equipos y el estado de tus servicios técnicos, ` +
    `pedís un servicio y cargás los contadores.\n\n` +
    `Para elegir tu contraseña entrá a:\n${enlace}\n\n(El enlace vence en ${DIAS_INVITACION} días.)` +
    `\n\n${config.firma ?? quien}`
  await encolarCorreo(tx, {
    para: d.email,
    asunto: `Portal de clientes de ${quien}`,
    texto,
    entidad: 'usuario_portal',
    entidadId: id!,
    usuarioId,
  })
  return { ok: true as const, id: id!, enlace, texto }
}

export async function listarUsuariosPortal(tx: Transaccion) {
  return tx
    .select({
      id: usuariosPortal.id,
      email: usuariosPortal.email,
      nombre: usuariosPortal.nombre,
      activo: usuariosPortal.activo,
      aceptada: sql<boolean>`${usuariosPortal.hashClave} is not null`,
      ultimoIngreso: usuariosPortal.ultimoIngreso,
      clienteId: terceros.id,
      cliente: terceros.razonSocial,
    })
    .from(usuariosPortal)
    .innerJoin(terceros, eq(terceros.id, usuariosPortal.terceroId))
    .orderBy(terceros.razonSocial, usuariosPortal.email)
}

/** Da de baja (o vuelve a habilitar) a un usuario del portal; la baja corta sus sesiones. */
export async function habilitarUsuarioPortal(tx: Transaccion, usuarioId: string, id: string, activo: boolean) {
  const [u] = await tx.update(usuariosPortal).set({ activo }).where(eq(usuariosPortal.id, id)).returning()
  if (!u) return { ok: false as const, error: 'El usuario no existe.' }
  if (!activo) await tx.delete(sesionesPortal).where(eq(sesionesPortal.usuarioId, id))
  await auditar(tx, { usuarioId, accion: activo ? 'modificacion' : 'baja', entidad: 'usuario_portal', entidadId: id })
  return { ok: true as const }
}

// ---------------------------------------------------------------- Ingreso del cliente

type Ingreso = { ok: true; token: string; vence: Date } | { ok: false; error: string }

async function abrirSesion(tx: Transaccion, empresaId: string, usuarioId: string) {
  const { token, hash } = nuevoToken(empresaId)
  const vence = new Date(Date.now() + DIAS_SESION_PORTAL * 86_400_000)
  await tx.insert(sesionesPortal).values({ usuarioId, tokenHash: hash, vence })
  await tx.update(usuariosPortal).set({ ultimoIngreso: new Date() }).where(eq(usuariosPortal.id, usuarioId))
  // De paso, se limpian las sesiones vencidas de este usuario.
  await tx.delete(sesionesPortal).where(and(eq(sesionesPortal.usuarioId, usuarioId), sql`${sesionesPortal.vence} < now()`))
  return { ok: true as const, token, vence }
}

/** Datos de la invitación (o del enlace para cambiar la contraseña), para la página pública. */
export async function leerInvitacion(token: string) {
  const t = leerToken(token)
  if (!t) return null
  return conEmpresa(t.empresaId, async (tx) => {
    const [u] = await tx
      .select({
        email: usuariosPortal.email,
        nombre: usuariosPortal.nombre,
        cliente: terceros.razonSocial,
        nueva: sql<boolean>`${usuariosPortal.hashClave} is null`,
      })
      .from(usuariosPortal)
      .innerJoin(terceros, eq(terceros.id, usuariosPortal.terceroId))
      .where(
        and(
          eq(usuariosPortal.invitacionHash, t.hash),
          eq(usuariosPortal.activo, true),
          gt(usuariosPortal.invitacionVence, new Date()),
        ),
      )
    if (!u) return null
    const config = await obtenerConfiguracion(tx)
    if (!config.portal) return null
    const [e] = await tx
      .select({ razonSocial: empresas.razonSocial, nombreFantasia: empresas.nombreFantasia, cuit: empresas.cuit })
      .from(empresas)
      .where(eq(empresas.id, t.empresaId))
    return { ...u, empresa: e ? nombreEmpresa(e) : '', cuit: e?.cuit ?? '', color: config.portalColor }
  })
}

/** El cliente elige su contraseña desde la invitación y queda adentro. */
export async function aceptarInvitacion(token: string, clave: string): Promise<Ingreso> {
  const t = leerToken(token)
  if (!t) return { ok: false, error: 'El enlace no es válido o venció.' }
  const problema = problemaDeClave(clave)
  if (problema) return { ok: false, error: problema }
  const hashClave = await hashearClave(clave)
  return conEmpresa(t.empresaId, async (tx) => {
    const [u] = await tx
      .update(usuariosPortal)
      .set({ hashClave, invitacionHash: null, invitacionVence: null })
      .where(
        and(
          eq(usuariosPortal.invitacionHash, t.hash),
          eq(usuariosPortal.activo, true),
          gt(usuariosPortal.invitacionVence, new Date()),
        ),
      )
      .returning()
    if (!u) return { ok: false as const, error: 'El enlace no es válido o venció.' }
    // Una contraseña nueva cierra las sesiones abiertas con la anterior.
    await tx.delete(sesionesPortal).where(eq(sesionesPortal.usuarioId, u.id))
    return abrirSesion(tx, t.empresaId, u.id)
  })
}

// Para que un email inexistente tarde lo mismo que una contraseña equivocada.
let hashDeRelleno: Promise<string> | null = null

export async function ingresarAlPortal(cuit: string, email: string, clave: string): Promise<Ingreso> {
  const mal = { ok: false as const, error: 'El email o la contraseña no son correctos.' }
  const empresa = await empresaDelPortal(cuit)
  if (!empresa) return { ok: false, error: 'Esta empresa no tiene el portal de clientes habilitado.' }
  const [u] = await conEmpresa(empresa.id, (tx) =>
    tx.select().from(usuariosPortal).where(eq(usuariosPortal.email, email.trim().toLowerCase())),
  )
  if (!u?.hashClave || !u.activo) {
    hashDeRelleno ??= hashearClave('relleno-para-medir-lo-mismo-1')
    await verificarClave(clave, await hashDeRelleno)
    return mal
  }
  if (!(await verificarClave(clave, u.hashClave))) return mal
  return conEmpresa(empresa.id, (tx) => abrirSesion(tx, empresa.id, u.id))
}

/**
 * "Olvidé mi contraseña": si el email es de un usuario del portal, le manda un
 * enlace para elegir otra. No dice si existe o no.
 */
export async function recuperarClavePortal(cuit: string, email: string, base: string) {
  const empresa = await empresaDelPortal(cuit)
  if (!empresa) return
  await conEmpresa(empresa.id, async (tx) => {
    const [u] = await tx
      .select()
      .from(usuariosPortal)
      .where(and(eq(usuariosPortal.email, email.trim().toLowerCase()), eq(usuariosPortal.activo, true)))
    if (!u) return
    const { token, hash } = nuevoToken(empresa.id)
    await tx
      .update(usuariosPortal)
      .set({ invitacionHash: hash, invitacionVence: new Date(Date.now() + 86_400_000) })
      .where(eq(usuariosPortal.id, u.id))
    await encolarCorreo(tx, {
      para: u.email,
      asunto: `Tu contraseña del portal de ${empresa.nombre}`,
      texto: `Para elegir una contraseña nueva entrá a:\n${base}/portal/invitacion/${token}\n\n(El enlace vence en 24 horas. Si no lo pediste, ignorá este email.)\n\n${empresa.nombre}`,
      entidad: 'usuario_portal',
      entidadId: u.id,
      usuarioId: u.id,
    })
  })
}

export type SesionPortal = {
  empresaId: string
  empresa: string
  cuit: string
  color: string
  ordenes: boolean
  contadores: boolean
  encuesta: boolean
  usuario: { id: string; email: string; nombre: string | null }
  cliente: { id: string; razonSocial: string }
}

export async function leerSesionPortal(token: string | undefined): Promise<SesionPortal | null> {
  const t = leerToken(token)
  if (!t) return null
  return conEmpresa(t.empresaId, async (tx) => {
    const [s] = await tx
      .select({ u: usuariosPortal, cliente: terceros.razonSocial })
      .from(sesionesPortal)
      .innerJoin(usuariosPortal, eq(usuariosPortal.id, sesionesPortal.usuarioId))
      .innerJoin(terceros, eq(terceros.id, usuariosPortal.terceroId))
      .where(and(eq(sesionesPortal.tokenHash, t.hash), gt(sesionesPortal.vence, new Date()), eq(usuariosPortal.activo, true)))
    if (!s) return null
    const config = await obtenerConfiguracion(tx)
    if (!config.portal) return null
    const [e] = await tx
      .select({
        razonSocial: empresas.razonSocial,
        nombreFantasia: empresas.nombreFantasia,
        cuit: empresas.cuit,
        activa: empresas.activa,
      })
      .from(empresas)
      .where(eq(empresas.id, t.empresaId))
    if (!e?.activa) return null
    return {
      empresaId: t.empresaId,
      empresa: nombreEmpresa(e),
      cuit: e.cuit,
      color: config.portalColor,
      ordenes: config.portalOrdenes,
      contadores: config.portalContadores,
      encuesta: config.encuesta,
      usuario: { id: s.u.id, email: s.u.email, nombre: s.u.nombre },
      cliente: { id: s.u.terceroId, razonSocial: s.cliente },
    }
  })
}

export async function cerrarSesionPortal(token: string | undefined) {
  const t = leerToken(token)
  if (!t) return
  await conEmpresa(t.empresaId, (tx) => tx.delete(sesionesPortal).where(eq(sesionesPortal.tokenHash, t.hash)))
}

// ---------------------------------------------------------------- Lo que ve el cliente

export const ESTADOS_PORTAL: Record<string, string> = {
  pendiente: 'Recibida',
  proyectada: 'Recibida',
  asignada: 'Visita programada',
  vencida: 'Visita programada',
  informe: 'Trabajo realizado',
  cerrada_ok: 'Resuelta',
  cerrada_desvio: 'Resuelta',
  cerrada_no_cumplida: 'Cerrada sin resolver',
  cancelada: 'Cancelada',
}

/** Color del estado en el portal. */
export const tonoEstado = (estado: string): 'ok' | 'aviso' | 'neutro' =>
  estado === 'cerrada_ok' || estado === 'cerrada_desvio'
    ? 'ok'
    : estado === 'cancelada' || estado === 'cerrada_no_cumplida'
      ? 'neutro'
      : estado === 'asignada' || estado === 'vencida'
        ? 'aviso'
        : 'neutro'

export async function equiposDelCliente(tx: Transaccion, terceroId: string) {
  return tx
    .select({
      id: equipos.id,
      serie: equipos.serie,
      modelo: modelosEquipo.nombre,
      domicilio: equipos.domicilio,
      localidad: equipos.localidad,
      sector: equipos.sector,
      contrato: sql<boolean>`${equipos.contratoId} is not null`,
      ultimoContador: sql<
        number | null
      >`(select l.contador from lecturas l where l.equipo_id = ${equipos.id} order by l.fecha desc, l.creado desc limit 1)`,
      ultimaLectura: sql<
        string | null
      >`(select l.fecha::text from lecturas l where l.equipo_id = ${equipos.id} order by l.fecha desc, l.creado desc limit 1)`,
    })
    .from(equipos)
    .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
    .where(and(eq(equipos.terceroId, terceroId), eq(equipos.estado, 'instalado')))
    .orderBy(equipos.serie)
}

export async function ordenesDelCliente(tx: Transaccion, terceroId: string, limite = 100) {
  return tx
    .select({
      id: ordenesServicio.id,
      numero: ordenesServicio.numero,
      fecha: ordenesServicio.fecha,
      estado: ordenesServicio.estado,
      falla: ordenesServicio.falla,
      programada: ordenesServicio.programada,
      hora: ordenesServicio.hora,
      serie: equipos.serie,
      tipo: tiposOrden.nombre,
    })
    .from(ordenesServicio)
    .leftJoin(equipos, eq(equipos.id, ordenesServicio.equipoId))
    .leftJoin(tiposOrden, eq(tiposOrden.id, ordenesServicio.tipoOrdenId))
    .where(eq(ordenesServicio.terceroId, terceroId))
    .orderBy(desc(ordenesServicio.numero))
    .limit(limite)
}

/** Una orden del cliente (null si no es suya), con el enlace a la encuesta si corresponde. */
export async function ordenDelCliente(tx: Transaccion, s: SesionPortal, id: string) {
  const o = await obtenerOrden(tx, id)
  if (!o || o.cliente.id !== s.cliente.id) return null
  const cerrada = o.estado.startsWith('cerrada')
  const encuesta = cerrada && s.encuesta && !o.encuesta?.respondida ? await crearEncuesta(tx, o.id, s.empresaId) : null
  return { ...o, enlaceEncuesta: encuesta ? `/encuesta/${encuesta}` : null }
}

/** Foto o firma, solo si es de una orden del cliente. */
export async function archivoDelCliente(tx: Transaccion, terceroId: string, id: string) {
  const [a] = await tx
    .select({ datos: archivosServicio.datos, tipoMime: archivosServicio.tipoMime })
    .from(archivosServicio)
    .innerJoin(ordenesServicio, eq(ordenesServicio.id, archivosServicio.ordenId))
    .where(and(eq(archivosServicio.id, id), eq(ordenesServicio.terceroId, terceroId)))
  return a ?? null
}

/** Tipos de orden que el cliente puede pedir (los marcados "portal"). */
export async function tiposDelPortal(tx: Transaccion) {
  const marcados = await tx.select({ id: tiposOrden.id }).from(tiposOrden).where(eq(tiposOrden.portal, true))
  const ids = new Set(marcados.map((t) => t.id))
  return (await tiposParaOrden(tx)).filter((t) => ids.has(t.id))
}

const EsquemaPedido = z.object({
  equipoId: z
    .string()
    .optional()
    .transform((v) => v || null),
  tipoOrdenId: z
    .string()
    .optional()
    .transform((v) => v || null),
  falla: z.string().trim().min(3, { error: 'Contanos qué pasa.' }).max(2000),
  contacto: z.string().trim().max(120).optional(),
  telefono: z.string().trim().max(60).optional(),
  instrucciones: z.record(z.string(), z.unknown()).default({}),
})

/** El cliente pide un servicio: se abre una orden "pendiente" con origen portal y se avisa a la coordinación. */
export async function pedirServicio(tx: Transaccion, s: SesionPortal, entrada: unknown) {
  if (!s.ordenes) return { ok: false as const, error: 'El portal no permite pedir servicio.' }
  const p = EsquemaPedido.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const d = p.data
  if (d.equipoId) {
    const [e] = await tx
      .select({ id: equipos.id })
      .from(equipos)
      .where(and(eq(equipos.id, d.equipoId), eq(equipos.terceroId, s.cliente.id), eq(equipos.estado, 'instalado')))
    if (!e) return { ok: false as const, error: 'Elegí uno de tus equipos.' }
  }
  const tipos = await tiposDelPortal(tx)
  if (d.tipoOrdenId ? !tipos.some((t) => t.id === d.tipoOrdenId) : tipos.length > 0)
    return { ok: false as const, error: 'Elegí qué necesitás.' }
  const r = await guardarOrden(tx, s.usuario.id, {
    fecha: hoyArgentina(),
    terceroId: s.cliente.id,
    equipoId: d.equipoId,
    tipoOrdenId: d.tipoOrdenId,
    falla: d.falla,
    contacto: d.contacto || s.usuario.nombre || null,
    telefono: d.telefono || null,
    email: s.usuario.email,
    instrucciones: d.instrucciones,
    origen: 'portal',
  })
  if (!r.ok) return r
  const config = await obtenerConfiguracion(tx)
  if (emailValido(config.emailCoordinacion)) {
    const [o] = await tx.select({ numero: ordenesServicio.numero }).from(ordenesServicio).where(eq(ordenesServicio.id, r.id))
    await encolarCorreo(tx, {
      para: config.emailCoordinacion,
      asunto: `Pedido de servicio desde el portal: ${s.cliente.razonSocial}`,
      texto: `${s.usuario.nombre ?? s.usuario.email} (${s.cliente.razonSocial}) pidió un servicio desde el portal.\n\nOrden N° ${o?.numero}\n${d.falla}`,
      entidad: 'orden_servicio',
      entidadId: r.id,
      usuarioId: s.usuario.id,
    })
  }
  return { ok: true as const, id: r.id }
}

/** El cliente carga los contadores de sus equipos. Devuelve los problemas de cada uno. */
export async function cargarContadores(tx: Transaccion, s: SesionPortal, lecturas: { equipoId: string; contador: string }[]) {
  if (!s.contadores) return { ok: false as const, error: 'El portal no permite cargar contadores.' }
  const propios = await tx
    .select({ id: equipos.id, serie: equipos.serie })
    .from(equipos)
    .where(
      and(
        eq(equipos.terceroId, s.cliente.id),
        eq(equipos.estado, 'instalado'),
        inArray(
          equipos.id,
          lecturas.map((l) => l.equipoId).filter((v) => /^[0-9a-f-]{36}$/i.test(v)),
        ),
      ),
    )
  const series = new Map(propios.map((e) => [e.id, e.serie]))
  const fecha = hoyArgentina()
  const errores: { serie: string; error: string }[] = []
  let cargadas = 0
  for (const l of lecturas) {
    const contador = l.contador.replace(/\D/g, '')
    if (!contador) continue
    const serie = series.get(l.equipoId)
    if (!serie) {
      errores.push({ serie: '', error: 'Ese equipo no es tuyo.' })
      continue
    }
    const r = await registrarLectura(tx, s.usuario.id, { equipoId: l.equipoId, fecha, contador }, 'portal')
    if (!r.ok) {
      errores.push({ serie, error: r.error })
      continue
    }
    await emitir(tx, 'lectura.registrada', { equipoId: l.equipoId, serie, fecha, contador: Number(contador), origen: 'portal' })
    cargadas++
  }
  return { ok: true as const, cargadas, errores }
}
