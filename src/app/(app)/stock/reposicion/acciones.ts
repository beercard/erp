'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { normalizarNumero } from '@/lib/dinero'
import { hoyArgentina } from '@/lib/fechas'
import { generarOrdenesReposicion } from '@/modulos/comercial/reposicion'

export type EstadoReposicion = { error?: string } | undefined

/** Arma las órdenes de compra con los artículos marcados y las cantidades escritas. */
export async function generarOrdenesAccion(_: EstadoReposicion, fd: FormData): Promise<EstadoReposicion> {
  const elegidos: Record<string, string> = {}
  for (const id of fd.getAll('articulo').map(String)) elegidos[id] = normalizarNumero(String(fd.get(`cantidad_${id}`) ?? ''))
  if (!Object.keys(elegidos).length) return { error: 'Marcá los artículos que querés pedir.' }
  let r
  try {
    r = await enLaEmpresa('compras.cargar', (tx, s) => generarOrdenesReposicion(tx, s.usuario.id, hoyArgentina(), elegidos))
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message }
    throw e
  }
  if (!r.ok) return { error: r.error }
  revalidatePath('/stock', 'layout')
  revalidatePath('/ordenes-compra', 'layout')
  const sin = r.sinProveedor.length ? `&sinProveedor=${encodeURIComponent(r.sinProveedor.join(', '))}` : ''
  redirect(`/stock/reposicion?ordenes=${r.ordenes.length}${sin}`)
}
