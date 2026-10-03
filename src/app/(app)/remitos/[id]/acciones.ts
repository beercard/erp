'use server'

import { revalidatePath } from 'next/cache'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { pedirCot } from '@/modulos/comercial/cot'

type Estado = { error?: string; ok?: string } | undefined

export async function pedirCotAccion(remitoId: string, _: Estado, fd: FormData): Promise<Estado> {
  try {
    const empresaId = await enLaEmpresa('ventas.remitos', async (_, s) => s.empresa.id)
    const r = await pedirCot(
      empresaId,
      remitoId,
      { patente: String(fd.get('patente') ?? ''), salida: String(fd.get('salida') ?? ''), hora: String(fd.get('hora') ?? '') },
      hoyArgentina(),
    )
    if (!r.ok) return { error: r.error }
    revalidatePath(`/remitos/${remitoId}`)
    return { ok: `COT ${r.cot}` }
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message }
    throw e
  }
}
