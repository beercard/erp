import { eq } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { bloqueosModulo } from '../../db/schema'
import { auditar } from '../../lib/auditoria'

/**
 * Cierre de períodos por módulo: con un módulo cerrado hasta una fecha, no
 * se carga, modifica ni anula nada de ese módulo con fecha hasta ese día.
 */

export const MODULOS_BLOQUEABLES = {
  ventas: { nombre: 'Ventas y cobranzas', detalle: 'Facturas, notas de crédito y débito, recibos' },
  compras: { nombre: 'Compras y pagos', detalle: 'Comprobantes de proveedores y órdenes de pago' },
  tesoreria: { nombre: 'Tesorería', detalle: 'Movimientos de caja y bancos, cheques, arqueos y vales' },
} as const

export type ModuloBloqueable = keyof typeof MODULOS_BLOQUEABLES

const dma = (f: string) => f.split('-').reverse().join('/')

export async function bloqueos(tx: Transaccion) {
  const filas = await tx.select().from(bloqueosModulo)
  return Object.fromEntries(filas.map((f) => [f.modulo, f.cerradoHasta])) as Partial<Record<ModuloBloqueable, string>>
}

/** Mensaje de error si la fecha cae en un período cerrado del módulo (o null si se puede). */
export async function controlarBloqueo(tx: Transaccion, modulo: ModuloBloqueable, fecha: string) {
  const [b] = await tx.select().from(bloqueosModulo).where(eq(bloqueosModulo.modulo, modulo))
  if (!b || fecha > b.cerradoHasta) return null
  return `${MODULOS_BLOQUEABLES[modulo].nombre} está cerrado hasta el ${dma(b.cerradoHasta)}: usá una fecha posterior o pedí que lo reabran.`
}

const Esquema = z.object({
  modulo: z.enum(Object.keys(MODULOS_BLOQUEABLES) as [ModuloBloqueable, ...ModuloBloqueable[]]),
  /** Vacío: se abre el módulo del todo. */
  cerradoHasta: z.iso.date({ error: 'Fecha inválida.' }).nullable(),
})

/** Cierra (o reabre, con una fecha anterior o vacía) un módulo hasta una fecha. */
export async function fijarBloqueo(tx: Transaccion, usuarioId: string, entrada: unknown, hoy: string) {
  const p = Esquema.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message }
  const { modulo, cerradoHasta } = p.data
  if (cerradoHasta && cerradoHasta >= hoy) return { ok: false as const, error: 'Solo se pueden cerrar días que ya pasaron.' }
  const [antes] = await tx.select().from(bloqueosModulo).where(eq(bloqueosModulo.modulo, modulo))
  if (!cerradoHasta) {
    await tx.delete(bloqueosModulo).where(eq(bloqueosModulo.modulo, modulo))
  } else {
    await tx
      .insert(bloqueosModulo)
      .values({ modulo, cerradoHasta, usuarioId })
      .onConflictDoUpdate({
        target: [bloqueosModulo.empresaId, bloqueosModulo.modulo],
        set: { cerradoHasta, usuarioId, actualizado: new Date() },
      })
  }
  await auditar(tx, {
    usuarioId,
    accion: 'modificacion',
    entidad: 'bloqueo_modulo',
    antes: { modulo, cerradoHasta: antes?.cerradoHasta ?? null },
    despues: { modulo, cerradoHasta },
  })
  return { ok: true as const }
}
