import 'server-only'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache, type CSSProperties } from 'react'

import { DIAS_SESION_PORTAL, leerSesionPortal, type SesionPortal } from '@/modulos/portal/portal'

/** Cookie del portal de clientes: separada de la del ERP (otro usuario, otros permisos). */
const COOKIE = 'erp_portal'

export async function guardarCookiePortal(token: string, vence: Date) {
  ;(await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/portal',
    expires: vence,
    maxAge: DIAS_SESION_PORTAL * 86_400,
  })
}

export async function tokenPortal() {
  return (await cookies()).get(COOKIE)?.value
}

export async function borrarCookiePortal() {
  ;(await cookies()).delete({ name: COOKIE, path: '/portal' })
}

export const sesionPortal = cache(async (): Promise<SesionPortal | null> =>
  leerSesionPortal(await tokenPortal()).catch(() => null),
)

export async function requerirPortal(): Promise<SesionPortal> {
  const s = await sesionPortal()
  if (!s) redirect('/portal/ingresar')
  return s
}

/** El color de la marca de la empresa, como acento del portal. */
export const colores = (color: string) =>
  ({
    '--acento': color,
    '--acento-hover': `color-mix(in srgb, ${color} 85%, black)`,
    '--acento-suave': `color-mix(in srgb, ${color} 12%, transparent)`,
    '--sobre-acento': '#ffffff',
    '--anillo': `color-mix(in srgb, ${color} 25%, transparent)`,
  }) as CSSProperties
