import { asc, eq } from 'drizzle-orm'

import type { Transaccion } from '@/db/conexion'
import { condicionesPago, depositos, listasPrecios, puntosVenta, transportes, vendedores } from '@/db/schema'
import { normalizarNumero } from '@/lib/dinero'
import { hoyArgentina } from '@/lib/fechas'
import { cotizacionVigente } from '@/modulos/comercial/cotizacion'

/** Desplegables de los documentos comerciales. */
export async function opcionesDocumento(tx: Transaccion) {
  const [listas, vends, condiciones, deps, pvs, transps] = await Promise.all([
    tx
      .select({ valor: listasPrecios.id, texto: listasPrecios.nombre })
      .from(listasPrecios)
      .where(eq(listasPrecios.activa, true))
      .orderBy(asc(listasPrecios.codigo)),
    tx
      .select({ valor: vendedores.id, texto: vendedores.nombre })
      .from(vendedores)
      .where(eq(vendedores.activo, true))
      .orderBy(asc(vendedores.nombre)),
    tx
      .select({ valor: condicionesPago.id, texto: condicionesPago.nombre })
      .from(condicionesPago)
      .where(eq(condicionesPago.activa, true))
      .orderBy(asc(condicionesPago.dias)),
    tx
      .select({ valor: depositos.id, texto: depositos.nombre })
      .from(depositos)
      .where(eq(depositos.activo, true))
      .orderBy(asc(depositos.codigo)),
    tx
      .select({ numero: puntosVenta.numero, nombre: puntosVenta.nombre, tipo: puntosVenta.tipo })
      .from(puntosVenta)
      .where(eq(puntosVenta.activo, true))
      .orderBy(asc(puntosVenta.numero)),
    tx
      .select({ valor: transportes.id, texto: transportes.nombre })
      .from(transportes)
      .where(eq(transportes.activo, true))
      .orderBy(asc(transportes.nombre)),
  ])
  return { listas, vendedores: vends, condiciones, depositos: deps, puntosVenta: pvs, transportes: transps }
}

/** Dólar vigente hoy, para convertir precios en el editor. */
export async function dolarHoy(tx: Transaccion): Promise<string | null> {
  const c = await cotizacionVigente(tx, 'DOL', hoyArgentina())
  return c ? String(Number(normalizarNumero(c.valor))) : null
}
