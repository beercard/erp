'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { requerirEmpresa, type SesionConEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { cambiarAcceso, cambiarRol, cancelarInvitacion, guardarRol, invitar } from '@/modulos/empresa/usuarios'

async function administrador(): Promise<SesionConEmpresa> {
  const s = await requerirEmpresa()
  if (!tienePermiso(s.permisos, 'empresa.usuarios')) throw new Error('No tenés permiso para administrar usuarios.')
  return s
}

export type EstadoInvitacion = { error?: string; enlace?: string; email?: string; vence?: string } | undefined

export async function invitarAccion(_: EstadoInvitacion, formData: FormData): Promise<EstadoInvitacion> {
  const s = await administrador()
  const r = await invitar(s.empresa.id, s.usuario.id, { email: formData.get('email'), rolId: formData.get('rolId') })
  if (!r.ok) return { error: r.error }
  // En producción la dirección sale de APP_URL, no del encabezado Host que manda el navegador.
  const h = await headers()
  const origen = process.env.APP_URL ?? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
  revalidatePath('/configuracion/usuarios')
  return {
    enlace: `${origen}/invitacion/${r.token}`,
    email: String(formData.get('email')),
    vence: r.vence.toLocaleDateString('es-AR'),
  }
}

export async function cancelarInvitacionAccion(id: string) {
  const s = await administrador()
  await cancelarInvitacion(s.empresa.id, s.usuario.id, id)
  revalidatePath('/configuracion/usuarios')
}

export async function cambiarRolAccion(membresiaId: string, formData: FormData) {
  const s = await administrador()
  const r = await cambiarRol(s.empresa.id, s.usuario.id, membresiaId, String(formData.get('rolId')))
  revalidatePath('/configuracion/usuarios')
  if (!r.ok) redirect(`/configuracion/usuarios?error=${encodeURIComponent(r.error)}`)
}

export async function cambiarAccesoAccion(membresiaId: string, activa: boolean) {
  const s = await administrador()
  const r = await cambiarAcceso(s.empresa.id, s.usuario.id, membresiaId, activa)
  revalidatePath('/configuracion/usuarios')
  if (!r.ok) redirect(`/configuracion/usuarios?error=${encodeURIComponent(r.error)}`)
}

export type EstadoRol = { error?: string } | undefined

export async function guardarRolAccion(id: string | null, _: EstadoRol, formData: FormData): Promise<EstadoRol> {
  const s = await administrador()
  const r = await guardarRol(
    s.empresa.id,
    s.usuario.id,
    {
      nombre: formData.get('nombre'),
      descripcion: formData.get('descripcion') ?? '',
      permisos: formData.getAll('permisos').map(String),
    },
    id ?? undefined,
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/configuracion/usuarios')
  redirect('/configuracion/usuarios?guardado=1')
}
