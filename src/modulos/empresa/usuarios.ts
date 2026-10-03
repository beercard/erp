import { createHash, randomBytes } from 'node:crypto'

import { and, asc, desc, eq, gt, isNull, or, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { comoPlataforma, conEmpresa } from '../../db/empresa'
import { empresas, invitaciones, membresias, roles, usuarios } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { anotar, superado } from '../../lib/frenos'
import { hashearClave, problemaDeClave, verificarClave } from '../../lib/auth/clave'
import { PERMISOS, tienePermiso } from '../../lib/permisos'
import { controlarLimite } from '../plataforma/suscripciones'

/**
 * Usuarios, invitaciones y roles de una empresa. Son tablas de plataforma
 * (sin RLS), así que TODA consulta de acá filtra por empresa a mano y recibe
 * el empresaId de la sesión, nunca del formulario.
 */

const DIAS_INVITACION = 7
const hashDe = (token: string) => createHash('sha256').update(token).digest('hex')

export async function rolesDisponibles(tx: Transaccion, empresaId: string) {
  return tx
    .select()
    .from(roles)
    .where(or(isNull(roles.empresaId), eq(roles.empresaId, empresaId)))
    .orderBy(sql`${roles.empresaId} nulls first`, asc(roles.nombre))
}

async function rolDeLaEmpresa(tx: Transaccion, empresaId: string, rolId: string) {
  const [rol] = await tx
    .select()
    .from(roles)
    .where(and(eq(roles.id, rolId), or(isNull(roles.empresaId), eq(roles.empresaId, empresaId))))
  return rol ?? null
}

export async function miembros(empresaId: string) {
  return comoPlataforma(async (tx) => {
    const lista = await tx
      .select({
        membresiaId: membresias.id,
        usuarioId: usuarios.id,
        nombre: usuarios.nombre,
        email: usuarios.email,
        rolId: roles.id,
        rol: roles.nombre,
        permisos: roles.permisos,
        activa: membresias.activa,
        ultimoIngreso: usuarios.ultimoIngreso,
      })
      .from(membresias)
      .innerJoin(usuarios, eq(usuarios.id, membresias.usuarioId))
      .innerJoin(roles, eq(roles.id, membresias.rolId))
      .where(eq(membresias.empresaId, empresaId))
      .orderBy(desc(membresias.activa), asc(usuarios.nombre))
    const pendientes = await tx
      .select({ id: invitaciones.id, email: invitaciones.email, rol: roles.nombre, vence: invitaciones.vence })
      .from(invitaciones)
      .innerJoin(roles, eq(roles.id, invitaciones.rolId))
      .where(and(eq(invitaciones.empresaId, empresaId), isNull(invitaciones.aceptada), gt(invitaciones.vence, new Date())))
      .orderBy(desc(invitaciones.creada))
    return { lista, pendientes, roles: await rolesDisponibles(tx, empresaId) }
  })
}

/** Permisos del rol con que el actor está en la empresa (vacío si no tiene acceso). */
async function permisosDelActor(tx: Transaccion, empresaId: string, actor: string): Promise<string[]> {
  const [m] = await tx
    .select({ permisos: roles.permisos })
    .from(membresias)
    .innerJoin(roles, eq(roles.id, membresias.rolId))
    .where(and(eq(membresias.empresaId, empresaId), eq(membresias.usuarioId, actor), eq(membresias.activa, true)))
  return m?.permisos ?? []
}

/**
 * ¿Puede el actor otorgar (o quitar) un rol con estos permisos? Solo si él
 * mismo tiene todo lo que el rol da: nadie reparte permisos que no tiene, y
 * el acceso total ("*") solo lo maneja otro dueño.
 */
export function cubre(delActor: readonly string[], delRol: readonly string[]) {
  if (delActor.includes('*')) return true
  if (delRol.includes('*')) return false
  const concretos = Object.keys(PERMISOS).filter((p) => tienePermiso(delRol, p))
  return concretos.every((p) => tienePermiso(delActor, p))
}

const SIN_ALCANCE = 'No podés dar ni quitar permisos que vos no tenés. Pedíselo a un dueño de la empresa.'

/** Cuántos dueños activos (rol con "*") quedarían si se aplica el cambio. */
async function duenosActivos(tx: Transaccion, empresaId: string, excluirMembresia?: string) {
  const filas = await tx
    .select({ id: membresias.id })
    .from(membresias)
    .innerJoin(roles, eq(roles.id, membresias.rolId))
    .where(and(eq(membresias.empresaId, empresaId), eq(membresias.activa, true), sql`'*' = any(${roles.permisos})`))
  return filas.filter((f) => f.id !== excluirMembresia).length
}

export type Resultado = { ok: true } | { ok: false; error: string }

export async function invitar(
  empresaId: string,
  invitadoPor: string,
  entrada: { email: unknown; rolId: unknown },
): Promise<{ ok: true; token: string; vence: Date } | { ok: false; error: string }> {
  const p = z
    .object({
      email: z.email({ error: 'Escribí un email válido.' }).trim().toLowerCase(),
      rolId: z.uuid({ error: 'Elegí un rol.' }),
    })
    .safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const { email, rolId } = p.data
  const limite = await controlarLimite(empresaId, 'usuarios')
  if (limite) return { ok: false, error: limite }
  const token = randomBytes(32).toString('base64url')
  const vence = new Date(Date.now() + DIAS_INVITACION * 86_400_000)
  const r = await comoPlataforma(async (tx) => {
    const rol = await rolDeLaEmpresa(tx, empresaId, rolId)
    if (!rol) return 'Ese rol no existe en esta empresa.'
    if (!cubre(await permisosDelActor(tx, empresaId, invitadoPor), rol.permisos)) return SIN_ALCANCE
    const [ya] = await tx
      .select({ id: membresias.id })
      .from(membresias)
      .innerJoin(usuarios, eq(usuarios.id, membresias.usuarioId))
      .where(and(eq(membresias.empresaId, empresaId), sql`lower(${usuarios.email}) = ${email}`))
    if (ya) return 'Esa persona ya tiene acceso a esta empresa.'
    await tx.insert(invitaciones).values({ empresaId, email, rolId, hashToken: hashDe(token), invitadoPor, vence })
    return null
  })
  if (r) return { ok: false, error: r }
  await conEmpresa(empresaId, (tx) =>
    auditar(tx, { usuarioId: invitadoPor, accion: 'alta', entidad: 'invitacion', despues: { email, rolId } }),
  )
  return { ok: true, token, vence }
}

export async function cancelarInvitacion(empresaId: string, actor: string, invitacionId: string) {
  await comoPlataforma((tx) =>
    tx
      .update(invitaciones)
      .set({ vence: new Date() })
      .where(and(eq(invitaciones.id, invitacionId), eq(invitaciones.empresaId, empresaId))),
  )
  await conEmpresa(empresaId, (tx) =>
    auditar(tx, { usuarioId: actor, accion: 'baja', entidad: 'invitacion', entidadId: invitacionId }),
  )
}

/** Datos de una invitación vigente, para mostrar la pantalla de aceptación. */
export async function leerInvitacion(token: string) {
  return comoPlataforma(async (tx) => {
    const [inv] = await tx
      .select({
        id: invitaciones.id,
        email: invitaciones.email,
        empresaId: invitaciones.empresaId,
        empresa: empresas.razonSocial,
        rol: roles.nombre,
        rolId: invitaciones.rolId,
      })
      .from(invitaciones)
      .innerJoin(empresas, eq(empresas.id, invitaciones.empresaId))
      .innerJoin(roles, eq(roles.id, invitaciones.rolId))
      .where(and(eq(invitaciones.hashToken, hashDe(token)), isNull(invitaciones.aceptada), gt(invitaciones.vence, new Date())))
    if (!inv) return null
    const [usuario] = await tx
      .select({ id: usuarios.id, nombre: usuarios.nombre })
      .from(usuarios)
      .where(sql`lower(${usuarios.email}) = ${inv.email}`)
    return { ...inv, usuarioExistente: usuario ?? null }
  })
}

/**
 * Acepta la invitación. Si el email no tiene cuenta, la crea con el nombre y
 * la clave elegidos. Si ya tiene (por ejemplo un contador con varias
 * empresas), pide su clave actual: el enlace solo no alcanza para sumar una
 * empresa a la cuenta de otra persona.
 */
export async function aceptarInvitacion(
  token: string,
  entrada: { nombre?: unknown; clave?: unknown; repetir?: unknown },
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const inv = await leerInvitacion(token)
  if (!inv) return { ok: false, error: 'La invitación venció o ya se usó. Pedí una nueva.' }
  const clave = typeof entrada.clave === 'string' ? entrada.clave : ''

  let usuarioId: string
  if (inv.usuarioExistente) {
    // Mismo freno que el ingreso: la invitación no puede servir para adivinar la clave de otra cuenta.
    const freno = `ingreso:email:${inv.email.toLowerCase()}`
    if (await superado([freno], 8, 15 * 60_000)) {
      return { ok: false, error: 'Demasiados intentos fallidos. Esperá 15 minutos y probá de nuevo.' }
    }
    const [u] = await comoPlataforma((tx) => tx.select().from(usuarios).where(eq(usuarios.id, inv.usuarioExistente!.id)))
    if (!(await verificarClave(clave, u.hashClave))) {
      await anotar([freno])
      return { ok: false, error: 'La contraseña no es correcta.' }
    }
    usuarioId = u.id
  } else {
    const nombre = typeof entrada.nombre === 'string' ? entrada.nombre.trim() : ''
    if (nombre.length < 2) return { ok: false, error: 'Escribí tu nombre.' }
    const problema = problemaDeClave(clave)
    if (problema) return { ok: false, error: problema }
    if (clave !== entrada.repetir) return { ok: false, error: 'Las dos contraseñas no coinciden.' }
    const hash = await hashearClave(clave)
    const [nuevo] = await comoPlataforma((tx) =>
      tx.insert(usuarios).values({ email: inv.email, nombre, hashClave: hash }).returning(),
    )
    usuarioId = nuevo.id
  }

  const resultado = await comoPlataforma(async (tx) => {
    // Se marca usada en la misma transacción: un enlace sirve una sola vez.
    const marcadas = await tx
      .update(invitaciones)
      .set({ aceptada: new Date() })
      .where(and(eq(invitaciones.id, inv.id), isNull(invitaciones.aceptada)))
      .returning()
    if (!marcadas.length) return false
    await tx
      .insert(membresias)
      .values({ usuarioId, empresaId: inv.empresaId, rolId: inv.rolId })
      .onConflictDoUpdate({ target: [membresias.usuarioId, membresias.empresaId], set: { rolId: inv.rolId, activa: true } })
    return true
  })
  if (!resultado) return { ok: false, error: 'La invitación ya se usó.' }
  await conEmpresa(inv.empresaId, (tx) =>
    auditar(tx, { usuarioId, accion: 'alta', entidad: 'membresia', despues: { email: inv.email, rol: inv.rol } }),
  )
  return { ok: true, email: inv.email }
}

export async function cambiarRol(empresaId: string, actor: string, membresiaId: string, rolId: string): Promise<Resultado> {
  const error = await comoPlataforma(async (tx) => {
    const rol = await rolDeLaEmpresa(tx, empresaId, rolId)
    if (!rol) return 'Ese rol no existe en esta empresa.'
    const [m] = await tx
      .select()
      .from(membresias)
      .where(and(eq(membresias.id, membresiaId), eq(membresias.empresaId, empresaId)))
    if (!m) return 'Ese usuario no está en la empresa.'
    if (m.usuarioId === actor) return 'No podés cambiar tu propio rol: pedíselo a otro administrador.'
    const delActor = await permisosDelActor(tx, empresaId, actor)
    const [actual] = await tx.select({ permisos: roles.permisos }).from(roles).where(eq(roles.id, m.rolId))
    if (!cubre(delActor, rol.permisos) || !cubre(delActor, actual?.permisos ?? [])) return SIN_ALCANCE
    if (!rol.permisos.includes('*') && (await duenosActivos(tx, empresaId, membresiaId)) === 0) {
      return 'La empresa tiene que tener al menos un dueño con acceso total.'
    }
    await tx.update(membresias).set({ rolId }).where(eq(membresias.id, membresiaId))
    return null
  })
  if (error) return { ok: false, error }
  await conEmpresa(empresaId, (tx) =>
    auditar(tx, { usuarioId: actor, accion: 'modificacion', entidad: 'membresia', entidadId: membresiaId, despues: { rolId } }),
  )
  return { ok: true }
}

export async function cambiarAcceso(empresaId: string, actor: string, membresiaId: string, activa: boolean): Promise<Resultado> {
  const error = await comoPlataforma(async (tx) => {
    const [m] = await tx
      .select()
      .from(membresias)
      .where(and(eq(membresias.id, membresiaId), eq(membresias.empresaId, empresaId)))
    if (!m) return 'Ese usuario no está en la empresa.'
    if (!activa && m.usuarioId === actor) return 'No podés quitarte el acceso a vos mismo.'
    const [suyo] = await tx.select({ permisos: roles.permisos }).from(roles).where(eq(roles.id, m.rolId))
    if (!cubre(await permisosDelActor(tx, empresaId, actor), suyo?.permisos ?? [])) return SIN_ALCANCE
    if (!activa && (await duenosActivos(tx, empresaId, membresiaId)) === 0)
      return 'La empresa tiene que tener al menos un dueño con acceso total.'
    await tx.update(membresias).set({ activa }).where(eq(membresias.id, membresiaId))
    return null
  })
  if (error) return { ok: false, error }
  await conEmpresa(empresaId, (tx) =>
    auditar(tx, {
      usuarioId: actor,
      accion: activa ? 'modificacion' : 'baja',
      entidad: 'membresia',
      entidadId: membresiaId,
      despues: { activa },
    }),
  )
  return { ok: true }
}

export async function guardarRol(
  empresaId: string,
  actor: string,
  entrada: { nombre: unknown; descripcion: unknown; permisos: unknown },
  id?: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const p = z
    .object({
      nombre: z.string().trim().min(2, { error: 'Escribí el nombre del rol.' }),
      descripcion: z.string().trim().optional(),
      permisos: z.array(z.string()).min(1, { error: 'Elegí al menos un permiso.' }),
    })
    .safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const desconocidos = p.data.permisos.filter((x) => !(x in PERMISOS))
  if (desconocidos.length) return { ok: false, error: `Permisos que no existen: ${desconocidos.join(', ')}` }

  const r = await comoPlataforma(async (tx) => {
    if (!cubre(await permisosDelActor(tx, empresaId, actor), p.data.permisos)) return { error: SIN_ALCANCE }
    if (id) {
      const [rol] = await tx
        .select()
        .from(roles)
        .where(and(eq(roles.id, id), eq(roles.empresaId, empresaId)))
      if (!rol) return { error: 'Los roles de sistema no se modifican: creá uno propio.' }
      await tx
        .update(roles)
        .set({ nombre: p.data.nombre, descripcion: p.data.descripcion || null, permisos: p.data.permisos })
        .where(eq(roles.id, id))
      return { id }
    }
    const [nuevo] = await tx
      .insert(roles)
      .values({ empresaId, nombre: p.data.nombre, descripcion: p.data.descripcion || null, permisos: p.data.permisos })
      .returning()
    return { id: nuevo.id }
  })
  if ('error' in r) return { ok: false, error: r.error! }
  await conEmpresa(empresaId, (tx) =>
    auditar(tx, { usuarioId: actor, accion: id ? 'modificacion' : 'alta', entidad: 'rol', entidadId: r.id, despues: p.data }),
  )
  return { ok: true, id: r.id }
}
