'use server'

import { and, asc, eq, ilike, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { terceros } from '@/db/schema'
import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { cotizacionVigente, fijarCotizacion } from '@/modulos/comercial/cotizacion'
import {
  articulosParaDocumento,
  cambiarEstadoPresupuesto,
  cancelarPedido,
  convertirEnPedido,
  guardarPedido,
  guardarPresupuesto,
} from '@/modulos/comercial/documentos'
import { anularRemito, emitirRemito } from '@/modulos/comercial/remitos'
import { ajustarStock, transferirStock } from '@/modulos/comercial/stock'

/** Ejecuta y convierte "sin permiso" en un mensaje para el usuario. */
async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

function leerJson(texto: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(texto ?? 'null'))
  } catch {
    return null
  }
}

// ----------------------------------------------------- Búsquedas del editor

export async function buscarClientes(texto: string) {
  const q = String(texto ?? '').trim()
  if (q.length < 2) return []
  return enLaEmpresa('ventas.ver', (tx) =>
    tx
      .select({
        id: terceros.id,
        codigo: terceros.codigo,
        razonSocial: terceros.razonSocial,
        numeroDocumento: terceros.numeroDocumento,
        listaPreciosId: terceros.listaPreciosId,
        vendedorId: terceros.vendedorId,
        condicionPagoId: terceros.condicionPagoId,
        condicionIva: terceros.condicionIva,
      })
      .from(terceros)
      .where(
        and(
          eq(terceros.esCliente, true),
          eq(terceros.activo, true),
          or(
            ilike(terceros.razonSocial, `%${q}%`),
            ilike(terceros.codigo, `%${q}%`),
            ilike(terceros.numeroDocumento, `%${q.replace(/\D/g, '') || q}%`),
          ),
        ),
      )
      .orderBy(asc(terceros.razonSocial))
      .limit(10),
  )
}

export async function buscarArticulos(texto: string, opciones: { listaId?: string | null; moneda: string; cotizacion: string }) {
  if (typeof texto !== 'string' || texto.length > 80) return []
  return enLaEmpresa('ventas.ver', (tx) => articulosParaDocumento(tx, texto, opciones))
}

export async function cotizacionDe(moneda: string, fecha: string) {
  return enLaEmpresa('ventas.ver', (tx) => cotizacionVigente(tx, moneda, fecha))
}

// ---------------------------------------------------------------- Documentos

export type EstadoEditor = { error?: string } | undefined

export async function guardarDocumentoAccion(
  tipo: 'presupuesto' | 'pedido',
  id: string | null,
  _: EstadoEditor,
  formData: FormData,
): Promise<EstadoEditor> {
  const datos = leerJson(formData.get('documento'))
  const r = await intentar(() =>
    tipo === 'presupuesto'
      ? enLaEmpresa('ventas.presupuestos', (tx, s) => guardarPresupuesto(tx, s.usuario.id, datos, id ?? undefined))
      : enLaEmpresa('ventas.pedidos', (tx, s) => guardarPedido(tx, s.usuario.id, datos, id ?? undefined)),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath(`/${tipo}s`)
  redirect(`/${tipo}s/${r.id}?guardado=1`)
}

export async function estadoPresupuestoAccion(id: string, estado: string) {
  const r = await intentar(() =>
    enLaEmpresa('ventas.presupuestos', (tx, s) => cambiarEstadoPresupuesto(tx, s.usuario.id, id, estado)),
  )
  revalidatePath(`/presupuestos/${id}`)
  if (!r.ok) redirect(`/presupuestos/${id}?error=${encodeURIComponent(r.error)}`)
}

export async function convertirAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('ventas.pedidos', (tx, s) => convertirEnPedido(tx, s.usuario.id, id)))
  if (!r.ok) redirect(`/presupuestos/${id}?error=${encodeURIComponent(r.error)}`)
  revalidatePath('/pedidos')
  redirect(`/pedidos/${r.id}?guardado=1`)
}

export async function cancelarPedidoAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('ventas.pedidos', (tx, s) => cancelarPedido(tx, s.usuario.id, id)))
  revalidatePath(`/pedidos/${id}`)
  if (!r.ok) redirect(`/pedidos/${id}?error=${encodeURIComponent(r.error)}`)
}

// ------------------------------------------------------------------ Remitos

export async function emitirRemitoAccion(_: EstadoEditor, formData: FormData): Promise<EstadoEditor> {
  const datos = leerJson(formData.get('remito'))
  const r = await intentar(() => enLaEmpresa('ventas.remitos', (tx, s) => emitirRemito(tx, s.usuario.id, datos)))
  if (!r.ok) return { error: r.error }
  revalidatePath('/remitos')
  revalidatePath('/stock')
  const avisos = r.avisos.length ? `&avisos=${encodeURIComponent(r.avisos.join('\n'))}` : ''
  redirect(`/remitos/${r.id}?guardado=1${avisos}`)
}

export async function anularRemitoAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('ventas.remitos', (tx, s) => anularRemito(tx, s.usuario.id, id)))
  revalidatePath(`/remitos/${id}`)
  revalidatePath('/stock')
  if (!r.ok) redirect(`/remitos/${id}?error=${encodeURIComponent(r.error)}`)
}

// -------------------------------------------------------------------- Stock

export type EstadoStock = { error?: string; ok?: string } | undefined

export async function ajustarStockAccion(articuloId: string, _: EstadoStock, formData: FormData): Promise<EstadoStock> {
  const r = await intentar(() =>
    enLaEmpresa('stock.ajustar', (tx, s) =>
      ajustarStock(tx, s.usuario.id, {
        articuloId,
        depositoId: formData.get('depositoId'),
        cantidad: formData.get('cantidad'),
        motivo: formData.get('motivo'),
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath(`/stock/${articuloId}`)
  return { ok: 'Ajuste registrado.' }
}

export async function transferirStockAccion(articuloId: string, _: EstadoStock, formData: FormData): Promise<EstadoStock> {
  const r = await intentar(() =>
    enLaEmpresa('stock.ajustar', (tx, s) =>
      transferirStock(tx, s.usuario.id, {
        articuloId,
        desde: formData.get('desde'),
        hacia: formData.get('hacia'),
        cantidad: formData.get('cantidad'),
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath(`/stock/${articuloId}`)
  return { ok: 'Transferencia registrada.' }
}

// --------------------------------------------------------------- Cotización

export async function fijarCotizacionAccion(_: EstadoStock, formData: FormData): Promise<EstadoStock> {
  const r = await intentar(() =>
    enLaEmpresa('maestros.configuracion', (tx, s) =>
      fijarCotizacion(tx, s.usuario.id, {
        moneda: formData.get('moneda'),
        fecha: formData.get('fecha'),
        valor: formData.get('valor'),
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/', 'layout')
  return { ok: 'Cotización grabada.' }
}
