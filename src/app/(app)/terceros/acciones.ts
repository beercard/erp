'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { guardarTercero, type DatosTercero } from '@/modulos/maestros/terceros'

export type EstadoFormulario =
  { errores?: Partial<Record<keyof DatosTercero, string>>; mensaje?: string; valores?: Record<string, string> } | undefined

export async function guardar(id: string | null, _: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const valores = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string') as [string, string][])
  const entrada = { ...valores, esCliente: formData.has('esCliente'), esProveedor: formData.has('esProveedor') }
  let resultado
  try {
    resultado = await enLaEmpresa('maestros.terceros', (tx, sesion) =>
      guardarTercero(tx, sesion.usuario.id, entrada, id ?? undefined),
    )
  } catch (e) {
    if (e instanceof SinPermiso) return { mensaje: e.message, valores }
    throw e
  }
  if (!resultado.ok) {
    return {
      errores: resultado.errores,
      mensaje: resultado.mensaje ?? 'Revisá los campos marcados.',
      valores,
    }
  }
  revalidatePath('/terceros')
  redirect(`/terceros/${resultado.id}?guardado=1`)
}
