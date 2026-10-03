import { and, asc, eq } from 'drizzle-orm'

import type { Transaccion } from '@/db/conexion'
import { puntosVenta, terceros } from '@/db/schema'

/** Clientes y puntos de venta electrónicos para el formulario. */
export async function opcionesRecurrente(tx: Transaccion) {
  const [clientes, pvs] = await Promise.all([
    tx
      .select({ valor: terceros.id, texto: terceros.razonSocial })
      .from(terceros)
      .where(and(eq(terceros.esCliente, true), eq(terceros.activo, true)))
      .orderBy(asc(terceros.razonSocial)),
    tx
      .select({ numero: puntosVenta.numero, nombre: puntosVenta.nombre })
      .from(puntosVenta)
      .where(and(eq(puntosVenta.activo, true), eq(puntosVenta.tipo, 'electronico')))
      .orderBy(asc(puntosVenta.numero)),
  ])
  return {
    clientes,
    puntosVenta: pvs.map((p) => ({ valor: p.numero, texto: `${String(p.numero).padStart(5, '0')} · ${p.nombre}` })),
  }
}
