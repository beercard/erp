import { createHash, randomBytes } from 'node:crypto'

import { and, eq, gt, isNotNull, isNull, or, sql } from 'drizzle-orm'

import { conEmpresa, comoPlataforma } from '../../db/empresa'
import { auditoria, empresas, membresias, roles, sesiones, usuarios } from '../../db/schema'
import { suscripcionDe } from '../../modulos/plataforma/suscripciones'
import { hoyArgentina } from '../fechas'
import { PERMISOS, tienePermiso } from '../permisos'
import { permitidoPorPlan, situacion, type Funcion, type Situacion } from '../planes'
import { hashearClave, verificarClave } from './clave'

/**
 * Sesiones guardadas en la base. La cookie lleva un token aleatorio de 32
 * bytes; la base guarda solo su SHA-256, así que una copia de la base no
 * sirve para entrar. Cerrar sesión es borrar la fila.
 *
 * No depende de Next: la capa de cookies está en src/lib/auth/servidor.ts.
 */

export const DIAS_DE_SESION = 14

export type EmpresaDeUsuario = { id: string; razonSocial: string; cuit: string; rol: string; codigo: string | null }

export type SesionActiva = {
  sesionId: string
  usuario: { id: string; nombre: string; email: string; adminPlataforma: boolean }
  /** Empresa en la que se está trabajando; null hasta que elige una. */
  empresa: { id: string; razonSocial: string; cuit: string } | null
  /** Lo que habilita la suscripción de esa empresa. */
  suscripcion: {
    plan: string
    nombrePlan: string
    funciones: Funcion[]
    soloLectura: boolean
    aviso: Situacion['aviso']
  } | null
  rol: string | null
  permisos: string[]
  empresas: EmpresaDeUsuario[]
  /**
   * Acceso de soporte de la plataforma a una empresa de la que no es
   * miembro: solo lectura y hasta una hora fija. Nulo en el uso normal.
   */
  soporte: { hasta: Date } | null
}

/** Rol que se muestra durante un acceso de soporte. */
export const ROL_SOPORTE = 'Soporte de la plataforma'

type Meta = { ip?: string | null; navegador?: string | null }

function hashDe(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// Hash de una clave cualquiera para comparar cuando el email no existe: así
// la respuesta tarda lo mismo y no revela qué emails tienen cuenta.
let hashFicticio: Promise<string> | null = null

async function empresasDe(usuarioId: string): Promise<EmpresaDeUsuario[]> {
  return comoPlataforma((tx) =>
    tx
      .select({
        id: empresas.id,
        razonSocial: empresas.razonSocial,
        cuit: empresas.cuit,
        rol: roles.nombre,
        codigo: empresas.codigo,
      })
      .from(membresias)
      .innerJoin(empresas, eq(empresas.id, membresias.empresaId))
      .innerJoin(roles, eq(roles.id, membresias.rolId))
      .where(and(eq(membresias.usuarioId, usuarioId), eq(membresias.activa, true), eq(empresas.activa, true)))
      .orderBy(empresas.razonSocial),
  )
}

export type ResultadoIngreso = { ok: true; token: string; vence: Date } | { ok: false; error: string }

/**
 * Con empresa (el ingreso desde su subdominio): solo entra quien es usuario
 * de esa empresa, y la sesión queda en ella.
 */
export async function iniciarSesion(
  email: string,
  clave: string,
  meta: Meta = {},
  empresaId?: string,
): Promise<ResultadoIngreso> {
  const usuario = await comoPlataforma(async (tx) => {
    const [u] = await tx
      .select()
      .from(usuarios)
      .where(sql`lower(${usuarios.email}) = lower(${email.trim()})`)
    return u
  })

  hashFicticio ??= hashearClave(randomBytes(16).toString('hex'))
  const correcta = await verificarClave(clave, usuario?.hashClave ?? (await hashFicticio))
  if (!usuario || !correcta || !usuario.activo) {
    return { ok: false, error: 'El email o la contraseña no son correctos.' }
  }

  const disponibles = await empresasDe(usuario.id)
  if (empresaId && !disponibles.some((e) => e.id === empresaId)) {
    return { ok: false, error: 'Ese usuario no tiene acceso a esta empresa.' }
  }
  const elegida = empresaId ?? (disponibles.length === 1 ? disponibles[0].id : null)
  const token = randomBytes(32).toString('base64url')
  const vence = new Date(Date.now() + DIAS_DE_SESION * 86_400_000)

  await comoPlataforma(async (tx) => {
    await tx.insert(sesiones).values({
      hashToken: hashDe(token),
      usuarioId: usuario.id,
      // Con una sola empresa no hay nada que elegir.
      empresaId: elegida,
      vence,
      ip: meta.ip ?? null,
      navegador: meta.navegador?.slice(0, 300) ?? null,
    })
    await tx.update(usuarios).set({ ultimoIngreso: new Date() }).where(eq(usuarios.id, usuario.id))
  })
  if (elegida) await registrarIngreso(elegida, usuario.id, meta)
  return { ok: true, token, vence }
}

export async function leerSesion(token: string): Promise<SesionActiva | null> {
  const fila = await comoPlataforma(async (tx) => {
    const [s] = await tx
      .select({
        sesionId: sesiones.id,
        empresaId: sesiones.empresaId,
        soporteHasta: sesiones.soporteHasta,
        usuario: { id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email, adminPlataforma: usuarios.adminPlataforma },
      })
      .from(sesiones)
      .innerJoin(usuarios, eq(usuarios.id, sesiones.usuarioId))
      .where(and(eq(sesiones.hashToken, hashDe(token)), gt(sesiones.vence, new Date()), eq(usuarios.activo, true)))
    return s
  })
  if (!fila) return null

  const disponibles = await empresasDe(fila.usuario.id)
  const base = { sesionId: fila.sesionId, usuario: fila.usuario, empresas: disponibles, soporte: null }
  const sinEmpresa = { ...base, empresa: null, suscripcion: null, rol: null, permisos: [] }
  if (!fila.empresaId) return sinEmpresa

  // Acceso de soporte: solo para quien sigue administrando la plataforma y
  // mientras no venza. Vencido, la sesión sigue sin empresa.
  if (fila.soporteHasta) {
    if (!fila.usuario.adminPlataforma || fila.soporteHasta <= new Date()) return sinEmpresa
    return sesionDeSoporte(base, fila.empresaId, fila.soporteHasta)
  }

  const actual = await comoPlataforma(async (tx) => {
    const [m] = await tx
      .select({
        empresa: { id: empresas.id, razonSocial: empresas.razonSocial, cuit: empresas.cuit },
        rol: roles.nombre,
        permisos: roles.permisos,
      })
      .from(membresias)
      .innerJoin(empresas, eq(empresas.id, membresias.empresaId))
      .innerJoin(roles, eq(roles.id, membresias.rolId))
      .where(
        and(
          eq(membresias.usuarioId, fila.usuario.id),
          eq(membresias.empresaId, fila.empresaId!),
          eq(membresias.activa, true),
          eq(empresas.activa, true),
          // El rol tiene que ser de sistema o de esta misma empresa.
          or(isNull(roles.empresaId), eq(roles.empresaId, fila.empresaId!)),
        ),
      )
    return m
  })
  // Si le quitaron el acceso a la empresa, la sesión sigue pero sin empresa.
  if (!actual) return sinEmpresa
  // Los permisos que valen son los del rol que además habilita la suscripción.
  const sit = situacion(await suscripcionDe(actual.empresa.id), hoyArgentina())
  const permisos = Object.keys(PERMISOS).filter((p) => tienePermiso(actual.permisos, p) && permitidoPorPlan(sit, p))
  return {
    ...base,
    empresa: actual.empresa,
    suscripcion: {
      plan: sit.plan.id,
      nombrePlan: sit.plan.nombre,
      funciones: sit.funciones,
      soloLectura: sit.soloLectura,
      aviso: sit.aviso,
    },
    rol: actual.rol,
    permisos,
  }
}

/**
 * Sesión de soporte: la empresa (aunque esté dada de baja), sin rol propio y
 * con solo los permisos de consulta (".ver") que habilita su plan. No hay
 * forma de cargar ni cambiar nada: toda acción pasa por un permiso.
 */
async function sesionDeSoporte(
  base: Pick<SesionActiva, 'sesionId' | 'usuario' | 'empresas'>,
  empresaId: string,
  hasta: Date,
): Promise<SesionActiva> {
  const [empresa] = await comoPlataforma((tx) =>
    tx
      .select({ id: empresas.id, razonSocial: empresas.razonSocial, cuit: empresas.cuit })
      .from(empresas)
      .where(eq(empresas.id, empresaId)),
  )
  if (!empresa) return { ...base, empresa: null, suscripcion: null, rol: null, permisos: [], soporte: null }
  const sit = situacion(await suscripcionDe(empresa.id), hoyArgentina())
  // Solo consulta: ni siquiera "empresa.suscripcion", que permite pedir un cambio de plan.
  const permisos = Object.keys(PERMISOS).filter((p) => p.endsWith('.ver') && permitidoPorPlan(sit, p))
  return {
    ...base,
    empresa,
    suscripcion: { plan: sit.plan.id, nombrePlan: sit.plan.nombre, funciones: sit.funciones, soloLectura: true, aviso: null },
    rol: ROL_SOPORTE,
    permisos,
    soporte: { hasta },
  }
}

export async function elegirEmpresa(token: string, empresaId: string, meta: Meta = {}): Promise<boolean> {
  const sesion = await leerSesion(token)
  if (!sesion || !sesion.empresas.some((e) => e.id === empresaId)) return false
  // Elegir una empresa propia termina un acceso de soporte en curso.
  await comoPlataforma((tx) => tx.update(sesiones).set({ empresaId, soporteHasta: null }).where(eq(sesiones.id, sesion.sesionId)))
  await registrarIngreso(empresaId, sesion.usuario.id, meta)
  return true
}

/** Duración de un acceso de soporte. */
export const MINUTOS_DE_SOPORTE = 60

/**
 * Abre un acceso de soporte de solo lectura a una empresa. Solo para quien
 * administra la plataforma; queda en la auditoría de la empresa (la ve su
 * dueño) además de la de la plataforma (src/modulos/plataforma/consola.ts).
 */
export async function abrirSoporte(
  token: string,
  empresaId: string,
  meta: Meta = {},
  ahora = new Date(),
): Promise<{ ok: true; hasta: Date } | { ok: false; error: string }> {
  const sesion = await leerSesion(token)
  if (!sesion?.usuario.adminPlataforma) return { ok: false, error: 'Solo quien administra la plataforma.' }
  const [empresa] = await comoPlataforma((tx) => tx.select({ id: empresas.id }).from(empresas).where(eq(empresas.id, empresaId)))
  if (!empresa) return { ok: false, error: 'No existe esa empresa.' }
  const hasta = new Date(ahora.getTime() + MINUTOS_DE_SOPORTE * 60_000)
  // Primero queda registrado en la empresa; recién después se abre el acceso.
  // Así no hay forma de entrar sin que la empresa lo vea en su auditoría.
  await conEmpresa(empresaId, (tx) =>
    tx.insert(auditoria).values({
      usuarioId: sesion.usuario.id,
      accion: 'ingreso',
      entidad: 'soporte',
      despues: { hasta: hasta.toISOString(), email: sesion.usuario.email },
      ip: meta.ip ?? null,
    }),
  )
  await comoPlataforma((tx) =>
    tx.update(sesiones).set({ empresaId, soporteHasta: hasta }).where(eq(sesiones.id, sesion.sesionId)),
  )
  return { ok: true, hasta }
}

/** Termina el acceso de soporte: la sesión queda sin empresa. */
export async function cerrarSoporte(token: string): Promise<void> {
  await comoPlataforma((tx) =>
    tx
      .update(sesiones)
      .set({ empresaId: null, soporteHasta: null })
      .where(and(eq(sesiones.hashToken, hashDe(token)), isNotNull(sesiones.soporteHasta))),
  )
}

export async function cerrarSesion(token: string): Promise<void> {
  await comoPlataforma((tx) => tx.delete(sesiones).where(eq(sesiones.hashToken, hashDe(token))))
}

async function registrarIngreso(empresaId: string, usuarioId: string, meta: Meta) {
  await conEmpresa(empresaId, (tx) =>
    tx.insert(auditoria).values({ usuarioId, accion: 'ingreso', entidad: 'sesion', ip: meta.ip ?? null }),
  )
}
