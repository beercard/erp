import 'server-only'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'

import type { Transaccion } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import { tienePermiso } from '../permisos'
import { FUNCIONES, funcionDePermiso, permisoDeLectura, type Funcion } from '../planes'
import { DIAS_DE_SESION, leerSesion, type SesionActiva } from './sesiones'

/** Cookie de sesión: solo la lee el servidor (httpOnly). */
export const COOKIE_SESION = 'erp_sesion'

export async function guardarCookieDeSesion(token: string, vence: Date) {
  ;(await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: vence,
    maxAge: DIAS_DE_SESION * 86_400,
  })
}

export async function tokenDeSesion(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_SESION)?.value
}

export async function borrarCookieDeSesion() {
  ;(await cookies()).delete(COOKIE_SESION)
}

export async function datosDelPedido() {
  const h = await headers()
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null,
    navegador: h.get('user-agent'),
  }
}

/** Una sola lectura de la sesión por pedido, aunque la pidan varios componentes. */
export const sesionActual = cache(async (): Promise<SesionActiva | null> => {
  const token = await tokenDeSesion()
  return token ? leerSesion(token) : null
})

export async function requerirSesion(): Promise<SesionActiva> {
  const sesion = await sesionActual()
  if (!sesion) redirect('/ingresar')
  return sesion
}

export type SesionConEmpresa = SesionActiva & {
  empresa: NonNullable<SesionActiva['empresa']>
  suscripcion: NonNullable<SesionActiva['suscripcion']>
}

/** Sesión con empresa elegida; si falta alguna de las dos, lleva a elegirla. */
export async function requerirEmpresa(): Promise<SesionConEmpresa> {
  const sesion = await requerirSesion()
  if (!sesion.empresa) redirect('/empresas')
  return sesion as SesionConEmpresa
}

/**
 * Para páginas: sin el permiso, lleva a una pantalla que explica cuál falta
 * (en vez de un error genérico). Las acciones usan SinPermiso.
 */
export async function exigirPermiso(permiso: string): Promise<SesionConEmpresa> {
  const sesion = await requerirEmpresa()
  if (!tienePermiso(sesion.permisos, permiso)) {
    // Lo que falta es el plan, no el permiso: se muestra qué plan lo incluye.
    const funcion = funcionDePermiso(permiso)
    if (funcion && !sesion.suscripcion.funciones.includes(funcion)) redirect(`/configuracion/suscripcion?funcion=${funcion}`)
    if (sesion.suscripcion.soloLectura && !permisoDeLectura(permiso)) redirect('/configuracion/suscripcion')
    redirect(`/sin-permiso?permiso=${encodeURIComponent(permiso)}`)
  }
  return sesion
}

export class SinPermiso extends Error {
  constructor(permiso: string, sesion?: SesionConEmpresa) {
    const funcion = funcionDePermiso(permiso)
    super(
      sesion && funcion && !sesion.suscripcion.funciones.includes(funcion)
        ? `${FUNCIONES[funcion].nombre} no está incluido en el plan ${sesion.suscripcion.nombrePlan}. Se suma desde Configuración › Suscripción.`
        : sesion?.suscripcion.soloLectura && !permisoDeLectura(permiso)
          ? 'La suscripción no está al día: se pueden consultar los datos, pero no cargar nada nuevo.'
          : `No tenés permiso para esta acción (${permiso}). Pedíselo a quien administra la empresa.`,
    )
  }
}

/**
 * Trabajo sobre la empresa de la sesión, verificando el permiso. Es la
 * puerta de entrada de las acciones del servidor: devuelve también la sesión
 * para auditar con el usuario.
 */
export async function enLaEmpresa<T>(
  permiso: string,
  trabajo: (tx: Transaccion, sesion: SesionConEmpresa) => Promise<T>,
): Promise<T> {
  const sesion = await requerirEmpresa()
  if (!tienePermiso(sesion.permisos, permiso)) throw new SinPermiso(permiso, sesion)
  return conEmpresa(sesion, (tx) => trabajo(tx, sesion))
}

/**
 * Para secciones enteras (su layout): si el plan no incluye la función, lleva
 * a la suscripción, que explica qué plan la trae.
 */
export async function exigirFuncion(funcion: Funcion): Promise<SesionConEmpresa> {
  const sesion = await requerirEmpresa()
  if (!sesion.suscripcion.funciones.includes(funcion)) redirect(`/configuracion/suscripcion?funcion=${funcion}`)
  return sesion
}
