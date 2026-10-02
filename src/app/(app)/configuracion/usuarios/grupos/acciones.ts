'use server'

import { revalidatePath } from 'next/cache'

import { enLaEmpresa, requerirEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { miembros } from '@/modulos/empresa/usuarios'
import { asignarGruposUsuario, borrarGrupo, guardarGrupo } from '@/modulos/maestros/grupos'

export type Estado = { error?: string; ok?: string } | undefined

const RUTA = '/configuracion/usuarios/grupos'

async function intentar<T extends { ok: boolean; error?: string }>(f: () => Promise<T>) {
  try {
    return await f()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false as const, error: e.message }
    throw e
  }
}

export async function guardarGrupoAccion(_: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() => enLaEmpresa('empresa.usuarios', (tx, s) => guardarGrupo(tx, s.usuario.id, fd.get('nombre'))))
  if (!r.ok) return { error: r.error }
  revalidatePath(RUTA)
  return { ok: 'Grupo agregado.' }
}

export async function borrarGrupoAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('empresa.usuarios', (tx, s) => borrarGrupo(tx, s.usuario.id, id)))
  if (r.ok) revalidatePath(RUTA)
  return r
}

export async function gruposUsuarioAccion(usuarioId: string, _: Estado, fd: FormData): Promise<Estado> {
  // Solo usuarios de esta empresa (la membresía es de plataforma: se controla
  // aparte, fuera de la transacción de la empresa).
  const { lista } = await miembros((await requerirEmpresa()).empresa.id)
  if (!lista.some((m) => m.usuarioId === usuarioId)) return { error: 'Ese usuario no es de la empresa.' }
  const grupos = fd.getAll('grupo').map(String)
  const r = await intentar(() =>
    enLaEmpresa('empresa.usuarios', (tx, s) => asignarGruposUsuario(tx, s.usuario.id, usuarioId, grupos)),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath(RUTA)
  return { ok: 'Guardado.' }
}
