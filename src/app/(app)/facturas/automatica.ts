'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enLaEmpresa, exigirPermiso, SinPermiso } from '@/lib/auth/servidor'
import { leerCsv } from '@/lib/csv'
import { leerXlsx } from '@/lib/xlsx'
import { clienteArca } from '@/modulos/arca/cliente'
import {
  activarRecurrente,
  avanzarLote,
  buscarEnPadron,
  crearLote,
  eliminarRecurrente,
  guardarRecurrente,
} from '@/modulos/facturacion/automatica'
import { aFacturaDeLote, leerPlanillaFacturas, registrosDeFilas, type FacturaExterna } from '@/modulos/facturacion/externa'

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
  const archivo = fd.get('planilla')
  if (!(archivo instanceof File) || !archivo.size) return { error: 'Elegí la planilla (.xlsx o .csv).' }
  if (archivo.size > 5 * 1024 * 1024) return { error: 'La planilla pesa más de 5 MB.' }
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  let registros: Record<string, string>[]
  try {
    if (/\.xlsx$/i.test(archivo.name)) registros = registrosDeFilas(await leerXlsx(bytes))
    else {
      const texto = new TextDecoder().decode(bytes)
      const primera = texto.split(/\r?\n/, 1)[0] ?? ''
      const separador = primera.includes(';') ? ';' : primera.includes('\t') ? '\t' : ','
      registros = leerCsv(texto, separador)
    }
  } catch {
    return { error: 'No se pudo leer la planilla: guardala como .xlsx o .csv y probá de nuevo.' }
  }
  if (registros.length > 2000) return { error: 'Van hasta 2.000 filas por planilla.' }
  const r = leerPlanillaFacturas(registros)
  if (r.facturas.length > 500) return { error: 'Van hasta 500 facturas por planilla: partila en varias.' }
  return { nombre: archivo.name, ...r }
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
