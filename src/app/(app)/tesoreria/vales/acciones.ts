'use server'

import { revalidatePath } from 'next/cache'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { normalizarNumero } from '@/lib/dinero'
import { anularVale, entregarVale, rendirVale } from '@/modulos/tesoreria/vales'

export type EstadoVale = { error?: string; ok?: string } | undefined

const valor = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

async function intentar(trabajo: () => Promise<{ ok: true; numero?: number } | { ok: false; error: string }>) {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false as const, error: e.message }
    throw e
  }
}

export async function entregarValeAccion(_: EstadoVale, fd: FormData): Promise<EstadoVale> {
  const r = await intentar(() =>
    enLaEmpresa('tesoreria.mover', (tx, s) =>
      entregarVale(tx, s.usuario.id, {
        cuentaId: valor(fd, 'cuentaId'),
        persona: valor(fd, 'persona'),
        fecha: valor(fd, 'fecha'),
        importe: normalizarNumero(valor(fd, 'importe') || '0'),
        motivo: valor(fd, 'motivo'),
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/tesoreria', 'layout')
  revalidatePath('/cobranzas/caja', 'layout')
  return { ok: `Vale N° ${r.numero} entregado.` }
}

export async function rendirValeAccion(id: string, _: EstadoVale, fd: FormData): Promise<EstadoVale> {
  const conceptos = fd.getAll('concepto').map(String)
  const importes = fd.getAll('importe').map(String)
  const comprobantes = fd.getAll('comprobante').map(String)
  const gastos = conceptos
    .map((concepto, i) => ({
      concepto: concepto.trim(),
      importe: normalizarNumero(importes[i] ?? ''),
      comprobante: comprobantes[i] ?? '',
    }))
    .filter((g) => g.concepto || Number(g.importe))
  const r = await intentar(() =>
    enLaEmpresa('tesoreria.mover', (tx, s) => rendirVale(tx, s.usuario.id, id, { fecha: valor(fd, 'fecha'), gastos })),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/tesoreria', 'layout')
  revalidatePath('/cobranzas/caja', 'layout')
  return { ok: 'Vale rendido.' }
}

export async function anularValeAccion(id: string) {
  await intentar(() => enLaEmpresa('tesoreria.mover', (tx, s) => anularVale(tx, s.usuario.id, id)))
  revalidatePath('/tesoreria', 'layout')
  revalidatePath('/cobranzas/caja', 'layout')
}
