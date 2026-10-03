'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { consultarPadron } from '@/modulos/arca/padron'
import { guardarTercero, type DatosTercero } from '@/modulos/maestros/terceros'

export type EstadoFormulario =
  { errores?: Partial<Record<keyof DatosTercero, string>>; mensaje?: string; valores?: Record<string, string> } | undefined

export async function guardar(id: string | null, _: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const valores = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string') as [string, string][])
  const entrada = {
    ...valores,
    esCliente: formData.has('esCliente'),
    esProveedor: formData.has('esProveedor'),
    gananciasInscripto: formData.has('gananciasInscripto'),
  }
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

/** Datos de la constancia de inscripción de ARCA para completar la ficha. */
export async function consultarPadronAccion(cuit: string) {
  try {
    return await enLaEmpresa('maestros.terceros', (tx, s) => consultarPadron(tx, s.empresa.cuit, cuit))
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false as const, error: e.message }
    return { ok: false as const, error: e instanceof Error ? e.message : 'No se pudo consultar a ARCA.' }
  }
}
