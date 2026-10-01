'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { fijarPrecio, guardarArticulo, quitarPrecioEspecial } from '@/modulos/maestros/articulo'

export type EstadoArticulo = { errores?: Record<string, string>; mensaje?: string; valores?: Record<string, string> } | undefined

export async function guardarArticuloAccion(id: string | null, _: EstadoArticulo, formData: FormData): Promise<EstadoArticulo> {
  const valores = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>
  const entrada = { ...valores, llevaStock: formData.has('llevaStock'), llevaSerie: formData.has('llevaSerie') }
  let r
  try {
    r = await enLaEmpresa('maestros.articulos', (tx, s) => guardarArticulo(tx, s.usuario.id, entrada, id ?? undefined))
  } catch (e) {
    if (e instanceof SinPermiso) return { mensaje: e.message, valores }
    throw e
  }
  if (!r.ok) return { errores: r.errores as Record<string, string>, mensaje: r.mensaje ?? 'Revisá los campos marcados.', valores }
  revalidatePath('/articulos')
  redirect(`/articulos/${r.id}?guardado=1`)
}

export type EstadoPrecio = { error?: string; ok?: boolean } | undefined

export async function fijarPrecioAccion(
  articuloId: string,
  listaId: string,
  _: EstadoPrecio,
  formData: FormData,
): Promise<EstadoPrecio> {
  try {
    const r = await enLaEmpresa('maestros.articulos', (tx, s) =>
      fijarPrecio(tx, s.usuario.id, articuloId, listaId, {
        precio: formData.get('precio'),
        desde: formData.get('desde'),
        moneda: formData.get('moneda'),
      }),
    )
    if (!r.ok) return { error: r.error }
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message }
    throw e
  }
  revalidatePath(`/articulos/${articuloId}`)
  revalidatePath('/articulos')
  return { ok: true }
}

export async function quitarPrecioEspecialAccion(articuloId: string, listaId: string) {
  await enLaEmpresa('maestros.articulos', (tx, s) => quitarPrecioEspecial(tx, s.usuario.id, articuloId, listaId))
  revalidatePath(`/articulos/${articuloId}`)
  revalidatePath('/articulos')
}
