import { and, eq, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { numeradores } from '../../db/schema'

/**
 * Próximo número de un tipo de documento y punto de venta. Bloquea la fila
 * del numerador hasta que termina la transacción: si dos usuarios emiten a
 * la vez, el segundo espera y obtiene el número siguiente. Si la emisión
 * falla, la transacción se revierte y el número no se pierde.
 */
export async function siguienteNumero(tx: Transaccion, tipo: string, puntoVenta = 0): Promise<number> {
  // Crea el numerador si no existe (sin pisar uno existente).
  await tx.insert(numeradores).values({ tipo, puntoVenta, ultimo: 0 }).onConflictDoNothing()
  const [fila] = await tx
    .select()
    .from(numeradores)
    .where(and(eq(numeradores.tipo, tipo), eq(numeradores.puntoVenta, puntoVenta)))
    .for('update')
  const numero = fila.ultimo + 1
  await tx
    .update(numeradores)
    .set({ ultimo: sql`${numeradores.ultimo} + 1` })
    .where(eq(numeradores.id, fila.id))
  return numero
}

/** Formato de número de comprobante: 0004-00012345. */
export function formatearNumero(puntoVenta: number, numero: number): string {
  return `${String(puntoVenta).padStart(4, '0')}-${String(numero).padStart(8, '0')}`
}
