'use server'

import { revalidatePath } from 'next/cache'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { guardarSaldosIniciales } from '@/modulos/impuestos/posicionIva'
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

const importe = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim()
  if (!s) return 0
  // "1.234,56" o "1234.56"
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : NaN
}

export async function saldosInicialesAccion(periodo: string, _: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('impuestos.libros', (tx, s) =>
      guardarSaldosIniciales(tx, s.usuario.id, periodo, importe(fd.get('tecnico')), importe(fd.get('libre'))),
    ),
  )
  revalidatePath('/impuestos/iva')
  return r.ok ? { ok: 'Saldos guardados.' } : { error: r.error }
}
