'use server'

import { revalidatePath } from 'next/cache'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { actualizarDesdeArba, guardarConfiguracionArba } from '@/modulos/impuestos/arba'
import { configurarRetencionIibb } from '@/modulos/impuestos/padronesIibb'

type Estado = { error?: string; ok?: string } | undefined

const decimal = (v: FormDataEntryValue | null) =>
  String(v ?? '')
    .trim()
    .replace(/\./g, '')
    .replace(',', '.')

async function conPermiso<T>(f: (empresaId: string) => Promise<T>) {
  const empresaId = await enLaEmpresa('empresa.datos', async (_, s) => s.empresa.id)
  return f(empresaId)
}

export async function retencionIibbAccion(_: Estado, fd: FormData): Promise<Estado> {
  try {
    const r = await enLaEmpresa('empresa.datos', (tx) =>
      configurarRetencionIibb(tx, {
        activa: fd.get('activa') === 'on',
        provincia: String(fd.get('provincia') ?? '') || null,
        minimo: decimal(fd.get('minimo')) || '0',
        alicuotaGeneral: decimal(fd.get('alicuotaGeneral')) || null,
      }),
    )
    if (!r.ok) return { error: r.error }
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message }
    throw e
  }
  revalidatePath('/configuracion/padrones')
  return { ok: 'Guardado.' }
}

export async function arbaAccion(_: Estado, fd: FormData): Promise<Estado> {
  try {
    const r = await enLaEmpresa('empresa.datos', (tx) =>
      guardarConfiguracionArba(tx, {
        usuario: String(fd.get('usuario') ?? ''),
        cit: String(fd.get('cit') ?? ''),
        ambiente: fd.get('ambiente'),
        cotPlanta: String(fd.get('cotPlanta') ?? '0') || '0',
        cotPuerta: String(fd.get('cotPuerta') ?? '0') || '0',
      }),
    )
    if (!r.ok) return { error: r.error }
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message }
    throw e
  }
  revalidatePath('/configuracion/padrones')
  return { ok: 'Guardado.' }
}

export async function consultarArbaAccion(_: Estado): Promise<Estado> {
  try {
    const r = await conPermiso((empresaId) => actualizarDesdeArba(empresaId, hoyArgentina()))
    revalidatePath('/configuracion/padrones')
    return r.ok ? { ok: `ARBA informó ${r.guardados} CUIT para el mes.` } : { error: r.error }
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message }
    throw e
  }
}
