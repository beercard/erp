import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { articulos, depositos, movimientosStock } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { normalizarNumero } from '../../lib/dinero'

/**
 * Stock = suma de movimientos. Nada guarda un saldo aparte: no hay forma de
 * que el stock y su historia se contradigan.
 */

export type Movimiento = {
  articuloId: string
  depositoId: string
  /** Positiva entra, negativa sale. */
  cantidad: string
  tipo:
    | 'inicial'
    | 'ajuste'
    | 'transferencia'
    | 'remito'
    | 'anulacion_remito'
    | 'compra'
    | 'anulacion_compra'
    | 'servicio'
    | 'anulacion_servicio'
  origenId?: string | null
  observacion?: string | null
  fecha?: Date
}

export async function registrarMovimientos(tx: Transaccion, usuarioId: string, movimientos: Movimiento[]) {
  if (!movimientos.length) return
  await tx.insert(movimientosStock).values(movimientos.map((m) => ({ ...m, usuarioId })))
}

/** Saldo por artículo y depósito, de los artículos pedidos (o de todos). */
export async function saldos(tx: Transaccion, articuloIds?: string[]) {
  const filtro = articuloIds?.length ? inArray(movimientosStock.articuloId, articuloIds) : undefined
  return tx
    .select({
      articuloId: movimientosStock.articuloId,
      depositoId: movimientosStock.depositoId,
      cantidad: sql<string>`sum(${movimientosStock.cantidad})`,
    })
    .from(movimientosStock)
    .where(filtro)
    .groupBy(movimientosStock.articuloId, movimientosStock.depositoId)
}

/** Saldo de un artículo en un depósito. */
export async function saldoDe(tx: Transaccion, articuloId: string, depositoId: string): Promise<string> {
  const [fila] = await tx
    .select({ cantidad: sql<string>`coalesce(sum(${movimientosStock.cantidad}), 0)` })
    .from(movimientosStock)
    .where(and(eq(movimientosStock.articuloId, articuloId), eq(movimientosStock.depositoId, depositoId)))
  return fila.cantidad
}

export async function movimientosDe(tx: Transaccion, articuloId: string, limite = 50) {
  return tx
    .select({
      id: movimientosStock.id,
      fecha: movimientosStock.fecha,
      deposito: depositos.nombre,
      cantidad: movimientosStock.cantidad,
      tipo: movimientosStock.tipo,
      observacion: movimientosStock.observacion,
      origenId: movimientosStock.origenId,
    })
    .from(movimientosStock)
    .innerJoin(depositos, eq(depositos.id, movimientosStock.depositoId))
    .where(eq(movimientosStock.articuloId, articuloId))
    .orderBy(desc(movimientosStock.fecha))
    .limit(limite)
}

/** Listado de stock: artículos que llevan stock, con su saldo por depósito. */
export async function listarStock(tx: Transaccion, q?: string) {
  const texto = q?.trim()
  const arts = await tx
    .select({ id: articulos.id, codigo: articulos.codigo, nombre: articulos.nombre, stockMinimo: articulos.stockMinimo })
    .from(articulos)
    .where(
      and(
        eq(articulos.activo, true),
        eq(articulos.llevaStock, true),
        texto
          ? sql`(${articulos.nombre} ilike ${'%' + texto + '%'} or ${articulos.codigo} ilike ${'%' + texto + '%'})`
          : undefined,
      ),
    )
    .orderBy(asc(articulos.nombre))
  const deps = await tx.select().from(depositos).where(eq(depositos.activo, true)).orderBy(asc(depositos.codigo))
  const porArticulo = new Map<string, Map<string, string>>()
  for (const s of await saldos(tx, texto ? arts.map((a) => a.id) : undefined)) {
    if (!porArticulo.has(s.articuloId)) porArticulo.set(s.articuloId, new Map())
    porArticulo.get(s.articuloId)!.set(s.depositoId, s.cantidad)
  }
  return {
    depositos: deps,
    filas: arts.map((a) => ({ ...a, saldos: porArticulo.get(a.id) ?? new Map<string, string>() })),
  }
}

const cantidadValida = z
  .string()
  .trim()
  .transform((v) => normalizarNumero(v))
  .pipe(z.string().regex(/^-?\d+(\.\d{1,4})?$/, { error: 'Escribí una cantidad.' }))
  .refine((v) => Number(v) !== 0, { error: 'La cantidad no puede ser cero.' })

const EsquemaAjuste = z.object({
  articuloId: z.uuid(),
  depositoId: z.uuid({ error: 'Elegí el depósito.' }),
  cantidad: cantidadValida,
  motivo: z.string().trim().min(3, { error: 'Escribí el motivo del ajuste.' }),
})

/** Ajuste de inventario (positivo o negativo) con motivo obligatorio. */
export async function ajustarStock(tx: Transaccion, usuarioId: string, entrada: unknown) {
  const p = EsquemaAjuste.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message }
  await registrarMovimientos(tx, usuarioId, [
    {
      articuloId: p.data.articuloId,
      depositoId: p.data.depositoId,
      cantidad: p.data.cantidad,
      tipo: 'ajuste',
      observacion: p.data.motivo,
    },
  ])
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'ajuste_stock', entidadId: p.data.articuloId, despues: p.data })
  return { ok: true as const }
}

const EsquemaTransferencia = z
  .object({
    articuloId: z.uuid(),
    desde: z.uuid({ error: 'Elegí el depósito de origen.' }),
    hacia: z.uuid({ error: 'Elegí el depósito de destino.' }),
    cantidad: cantidadValida.refine((v) => Number(v) > 0, { error: 'La cantidad tiene que ser positiva.' }),
  })
  .refine((d) => d.desde !== d.hacia, { error: 'El origen y el destino tienen que ser distintos.', path: ['hacia'] })

/** Transferencia entre depósitos: dos movimientos con el mismo origen. */
export async function transferirStock(tx: Transaccion, usuarioId: string, entrada: unknown) {
  const p = EsquemaTransferencia.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message }
  const origenId = crypto.randomUUID()
  await registrarMovimientos(tx, usuarioId, [
    { articuloId: p.data.articuloId, depositoId: p.data.desde, cantidad: `-${p.data.cantidad}`, tipo: 'transferencia', origenId },
    { articuloId: p.data.articuloId, depositoId: p.data.hacia, cantidad: p.data.cantidad, tipo: 'transferencia', origenId },
  ])
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'transferencia_stock', entidadId: p.data.articuloId, despues: p.data })
  return { ok: true as const }
}
