'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enLaEmpresa, exigirPermiso, SinPermiso } from '@/lib/auth/servidor'
import { leerPlanillaSubida } from '@/lib/planillaSubida'
import { clienteArca } from '@/modulos/arca/cliente'
import {
  activarRecurrente,
  avanzarLote,
  buscarEnPadron,
  crearLote,
  eliminarRecurrente,
  guardarRecurrente,
} from '@/modulos/facturacion/automatica'
import { aFacturaDeLote, leerPlanillaFacturas, type FacturaExterna } from '@/modulos/facturacion/externa'

/**
 * Acciones de la facturación automática: facturas recurrentes y facturación
 * masiva desde una planilla.
 */

type Estado = { error?: string; ok?: string } | undefined

async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

// --------------------------------------------------------------- Recurrentes

export async function guardarRecurrenteAccion(id: string | null, _: Estado, fd: FormData): Promise<Estado> {
  let datos: unknown = null
  try {
    datos = JSON.parse(String(fd.get('datos') ?? 'null'))
  } catch {}
  const r = await intentar(() =>
    enLaEmpresa('ventas.facturar', (tx, s) => guardarRecurrente(tx, s.usuario.id, datos, id ?? undefined)),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/facturas/recurrentes')
  redirect('/facturas/recurrentes?guardada=1')
}

export async function activarRecurrenteAccion(id: string, activa: boolean) {
  await enLaEmpresa('ventas.facturar', (tx, s) => activarRecurrente(tx, s.usuario.id, id, activa))
  revalidatePath('/facturas/recurrentes')
}

export async function eliminarRecurrenteAccion(id: string) {
  await enLaEmpresa('ventas.facturar', (tx, s) => eliminarRecurrente(tx, s.usuario.id, id))
  revalidatePath('/facturas/recurrentes')
  redirect('/facturas/recurrentes')
}

// ------------------------------------------------------------------- Masiva

export type Vista = {
  error?: string
  nombre?: string
  facturas?: { filas: number[]; factura: FacturaExterna }[]
  errores?: { fila: number; error: string }[]
}

/** Lee la planilla y devuelve lo que se va a facturar, para revisar antes de armar el lote. */
export async function leerPlanillaAccion(_: Vista | undefined, fd: FormData): Promise<Vista> {
  await exigirPermiso('ventas.facturar')
  const l = await leerPlanillaSubida(fd.get('planilla'))
  if (!l.ok) return { error: l.error }
  const { registros } = l
  const r = leerPlanillaFacturas(registros)
  if (r.facturas.length > 500) return { error: 'Van hasta 500 facturas por planilla: partila en varias.' }
  return { nombre: l.nombre, ...r }
}

export async function crearLoteAccion(datos: {
  nombre: string
  autorizar: boolean
  enviar: boolean
  puntoVenta: number | null
  facturas: FacturaExterna[]
}): Promise<{ error: string } | undefined> {
  const r = await intentar(() =>
    enLaEmpresa('ventas.facturar', (tx, s) =>
      crearLote(tx, s.usuario.id, { ...datos, facturas: datos.facturas.map(aFacturaDeLote) }, undefined, buscarEnPadron),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/facturas/masiva')
  redirect(`/facturas/masiva/${r.id}${r.errores.length ? `?noArmadas=${encodeURIComponent(JSON.stringify(r.errores))}` : ''}`)
}

/** Autoriza la próxima tanda del lote; la pantalla la llama hasta que no quede nada. */
export async function avanzarLoteAccion(id: string) {
  const sesion = await exigirPermiso('ventas.facturar')
  const r = await avanzarLote(sesion.empresa.id, id, (tx, cuit) => clienteArca(tx, cuit), 5)
  revalidatePath(`/facturas/masiva/${id}`)
  return r
}
