'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requerirEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { actualizarEmpresa } from '@/modulos/empresa/datos'

export type EstadoEmpresa = { errores?: Record<string, string>; valores?: Record<string, string> } | undefined

export async function guardarEmpresaAccion(_: EstadoEmpresa, formData: FormData): Promise<EstadoEmpresa> {
  const s = await requerirEmpresa()
  if (!tienePermiso(s.permisos, 'empresa.datos'))
    return { errores: { razonSocial: 'No tenés permiso para modificar estos datos.' } }
  const valores = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>
  // La empresa es siempre la de la sesión: el formulario no elige cuál.
  const r = await actualizarEmpresa(s.empresa.id, s.usuario.id, valores)
  if (!r.ok) return { errores: r.errores, valores }
  revalidatePath('/', 'layout')
  redirect('/configuracion/empresa?guardado=1')
}
