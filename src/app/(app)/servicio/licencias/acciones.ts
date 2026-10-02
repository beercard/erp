'use server'

import { revalidatePath } from 'next/cache'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { borrarExcepcion, guardarExcepcion } from '@/modulos/servicio/excepciones'

export type Estado = { ok?: string; error?: string } | undefined

async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

const v = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()

export async function guardarExcepcionAccion(_: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('servicio.cargar', (tx, s) =>
      guardarExcepcion(tx, s.usuario.id, {
        tecnicoId: v(fd, 'tecnicoId'),
        desde: v(fd, 'desde'),
        hasta: v(fd, 'hasta') || v(fd, 'desde'),
        tipo: v(fd, 'tipo'),
        jornadaDesde: v(fd, 'jornadaDesde'),
        jornadaHasta: v(fd, 'jornadaHasta'),
        motivo: v(fd, 'motivo'),
      }),
    ),
  )
  revalidatePath('/servicio/licencias')
  revalidatePath('/servicio/calendario')
  return r.ok ? { ok: 'Guardado.' } : { error: r.error }
}

export async function borrarExcepcionAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('servicio.cargar', (tx, s) => borrarExcepcion(tx, s.usuario.id, id)))
  revalidatePath('/servicio/licencias')
  revalidatePath('/servicio/calendario')
  return r
}
