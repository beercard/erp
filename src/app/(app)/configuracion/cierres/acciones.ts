'use server'

import { revalidatePath } from 'next/cache'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { fijarBloqueo } from '@/modulos/empresa/bloqueos'

export async function fijarBloqueoAccion(modulo: string, _: { error?: string } | undefined, fd: FormData) {
  const fecha = fd.get('reabrir') ? '' : String(fd.get('cerradoHasta') ?? '').trim()
  try {
    const r = await enLaEmpresa('empresa.bloqueos', (tx, s) =>
      fijarBloqueo(tx, s.usuario.id, { modulo, cerradoHasta: fecha || null }, hoyArgentina()),
    )
    if (!r.ok) return { error: r.error }
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message }
    throw e
  }
  revalidatePath('/configuracion/cierres')
  return undefined
}
