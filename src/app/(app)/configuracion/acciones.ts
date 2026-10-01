'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { cambiarEstadoCatalogo, catalogo, guardarCatalogo } from '@/modulos/configuracion/catalogos'

export type EstadoCatalogo = { errores?: Record<string, string>; mensaje?: string; valores?: Record<string, string> } | undefined

const UUID = /^[0-9a-f-]{36}$/i

export async function guardarCatalogoAccion(
  clave: string,
  id: string | null,
  _: EstadoCatalogo,
  formData: FormData,
): Promise<EstadoCatalogo> {
  const def = catalogo(clave)
  if (!def || (id && !UUID.test(id))) return { mensaje: 'Pantalla inválida.' }
  const valores = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>
  let r
  try {
    r = await enLaEmpresa('maestros.configuracion', (tx, s) => guardarCatalogo(tx, s.usuario.id, def, valores, id ?? undefined))
  } catch (e) {
    if (e instanceof SinPermiso) return { mensaje: e.message, valores }
    throw e
  }
  if (!r.ok) return { errores: r.errores, mensaje: r.mensaje ?? 'Revisá los campos marcados.', valores }
  revalidatePath(`/configuracion/${clave}`)
  redirect(`/configuracion/${clave}?guardado=1`)
}

export async function cambiarEstadoAccion(clave: string, id: string, activo: boolean) {
  const def = catalogo(clave)
  if (!def || !UUID.test(id)) return
  await enLaEmpresa('maestros.configuracion', (tx, s) => cambiarEstadoCatalogo(tx, s.usuario.id, def, id, activo))
  revalidatePath(`/configuracion/${clave}`)
}
