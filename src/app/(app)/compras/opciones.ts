import { asc, eq } from 'drizzle-orm'

import type { Transaccion } from '@/db/conexion'
import { depositos, provincias } from '@/db/schema'
import { nombresDeArticulos } from '@/modulos/comercial/documentos'
import { itemsDeOrden } from '@/modulos/compras/ordenes'

import { dolarHoy } from '../comercial/opciones'
import type { LineaCompra } from './FormularioCompra'

/** Desplegables y dólar del día del formulario de compras y órdenes. */
export async function opcionesCompra(tx: Transaccion) {
  const [deps, provs, dolar] = await Promise.all([
    tx
      .select({ valor: depositos.id, texto: depositos.nombre })
      .from(depositos)
      .where(eq(depositos.activo, true))
      .orderBy(asc(depositos.codigo)),
    tx.select({ valor: provincias.codigo, texto: provincias.nombre }).from(provincias).orderBy(asc(provincias.nombre)),
    dolarHoy(tx),
  ])
  return { depositos: deps, provincias: provs, dolar }
}

/** Renglones de una orden para el formulario: todo (para editarla) o lo que falta recibir. */
export async function lineasDeOrden(tx: Transaccion, ordenId: string, soloPendiente: boolean): Promise<LineaCompra[]> {
  const items = await itemsDeOrden(tx, ordenId)
  const codigos = await nombresDeArticulos(
    tx,
    items.map((i) => i.articuloId).filter((x): x is string => !!x),
  )
  return items
    .filter((i) => !soloPendiente || Number(i.pendiente) > 0)
    .map((i) => ({
      clave: i.id,
      articuloId: i.articuloId,
      codigo: i.articuloId ? (codigos.get(i.articuloId) ?? null) : null,
      descripcion: i.descripcion,
      cantidad: String(Number(soloPendiente ? i.pendiente : i.cantidad)),
      precioUnitario: String(Number(i.precioUnitario)),
      descuento: Number(i.descuento) ? String(Number(i.descuento)) : '',
      alicuotaIva: i.alicuotaIva,
      ordenItemId: soloPendiente ? i.id : null,
    }))
}
