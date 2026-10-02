'use server'

import { after } from 'next/server'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { enviarPendientes } from '@/modulos/comunicaciones/correo'
import { habilitarUsuarioPortal, invitarAlPortal } from '@/modulos/portal/portal'

const RUTA = '/servicio/configuracion'

async function origen() {
  const h = await headers()
  return process.env.APP_URL ?? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
}

async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

export type EstadoInvitacion =
  { ok: true; enlace: string; texto: string; email: string } | { ok: false; error: string } | undefined

/** Invita (o vuelve a invitar) a un usuario del cliente al portal. */
export async function invitarPortalAccion(_: EstadoInvitacion, formData: FormData): Promise<EstadoInvitacion> {
  const base = await origen()
  const email = String(formData.get('email') ?? '')
  const r = await intentar(() =>
    enLaEmpresa('servicio.configurar', async (tx, s) => ({
      ...(await invitarAlPortal(tx, s.usuario.id, s.empresa.id, base, {
        terceroId: formData.get('terceroId'),
        email,
        nombre: String(formData.get('nombre') ?? ''),
      })),
      empresaId: s.empresa.id,
    })),
  )
  if (!r.ok) return { ok: false, error: r.error }
  after(() => enviarPendientes(r.empresaId).catch(() => undefined))
  revalidatePath(RUTA)
  return { ok: true, enlace: r.enlace, texto: r.texto, email: email.trim().toLowerCase() }
}

export async function habilitarPortalAccion(id: string, activo: boolean) {
  await intentar(() => enLaEmpresa('servicio.configurar', (tx, s) => habilitarUsuarioPortal(tx, s.usuario.id, id, activo)))
  revalidatePath(RUTA)
}
