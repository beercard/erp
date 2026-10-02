'use server'

import { revalidatePath } from 'next/cache'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { marcarPresentada, reabrirPeriodo } from '@/modulos/impuestos/presentaciones'

export type Estado = { error?: string; ok?: string } | undefined

async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

export async function presentadaAccion(id: string, _: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('impuestos.libros', (tx, s) =>
      marcarPresentada(tx, s.usuario.id, id, { transaccion: String(fd.get('transaccion') ?? '') }),
    ),
  )
  revalidatePath('/impuestos', 'layout')
  return r.ok ? { ok: 'Marcada como presentada: el período quedó cerrado.' } : { error: r.error }
}

export async function reabrirAccion(id: string, _: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('impuestos.libros', (tx, s) => reabrirPeriodo(tx, s.usuario.id, id, String(fd.get('motivo') ?? ''))),
  )
  revalidatePath('/impuestos', 'layout')
  return r.ok ? { ok: 'Período reabierto. La próxima descarga es la rectificativa.' } : { error: r.error }
}
