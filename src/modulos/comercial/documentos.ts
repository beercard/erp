import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { articulos, pedidos, pedidosItems, presupuestos, presupuestosItems, terceros } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { normalizarNumero } from '../../lib/dinero'
import { hoyArgentina } from '../../lib/fechas'
import { preciosVigentes } from '../maestros/articulos'
import { calcularTotales, convertir, TASAS_IVA } from './calculo'
import { siguienteNumero } from './numeracion'
import { saldos } from './stock'

/**
 * Presupuestos y pedidos: documentos sin valor fiscal con renglones, moneda
 * y cotización. Un presupuesto aceptado se convierte en pedido; un pedido se
 * entrega con uno o más remitos (src/modulos/comercial/remitos.ts).
 */

export const decimal = (mensaje: string, minimo = 0) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => normalizarNumero(String(v)))
    .pipe(z.string().regex(/^\d+(\.\d+)?$/, { error: mensaje }))
    .refine((v) => Number(v) >= minimo, { error: mensaje })

export const EsquemaItem = z.object({
  articuloId: z.uuid().nullable().optional(),
  descripcion: z.string().trim().min(1, { error: 'Cada renglón necesita una descripción.' }),
  cantidad: decimal('La cantidad tiene que ser mayor que cero.').refine((v) => Number(v) > 0, {
    error: 'La cantidad tiene que ser mayor que cero.',
  }),
  precioUnitario: decimal('El precio no puede ser negativo.'),
  descuento: decimal('El descuento va de 0 a 100.')
    .refine((v) => Number(v) <= 100, { error: 'El descuento va de 0 a 100.' })
    .optional(),
  alicuotaIva: z.coerce.number().refine((v) => v in TASAS_IVA, { error: 'Alícuota de IVA inválida.' }),
})

export const opcionalUuid = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable())

const EsquemaDocumento = z.object({
  terceroId: z.uuid({ error: 'Elegí el cliente.' }),
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  moneda: z.enum(['PES', 'DOL', '060']),
  cotizacion: decimal('Escribí la cotización.').refine((v) => Number(v) > 0, {
    error: 'La cotización tiene que ser mayor que cero.',
  }),
  listaPreciosId: opcionalUuid,
  vendedorId: opcionalUuid,
  condicionPagoId: opcionalUuid,
  observaciones: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
  items: z.array(EsquemaItem).min(1, { error: 'Agregá al menos un renglón.' }),
})

const EsquemaPresupuesto = EsquemaDocumento.extend({ validezDias: z.coerce.number().int().min(1).max(365).default(15) })
const EsquemaPedido = EsquemaDocumento.extend({
  depositoId: opcionalUuid,
  fechaEntrega: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null)
    .pipe(z.iso.date().nullable()),
})

export type ResultadoDocumento = { ok: true; id: string; numero: number } | { ok: false; error: string }

export function primerError(e: z.ZodError): string {
  const i = e.issues[0]
  const renglon = i.path[0] === 'items' && typeof i.path[1] === 'number' ? `Renglón ${i.path[1] + 1}: ` : ''
  return renglon + i.message
}

function preparar<T extends z.infer<typeof EsquemaDocumento>>(datos: T) {
  const { lineas, totales } = calcularTotales(
    datos.items.map((i) => ({
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
      descuento: i.descuento ?? '0',
      alicuotaIva: i.alicuotaIva,
    })),
  )
  const moneda = datos.moneda
  const items = datos.items.map((i, n) => ({
    orden: n + 1,
    articuloId: i.articuloId ?? null,
    descripcion: i.descripcion,
    cantidad: i.cantidad,
    precioUnitario: i.precioUnitario,
    descuento: i.descuento ?? '0',
    alicuotaIva: i.alicuotaIva,
    neto: lineas[n].neto,
    iva: lineas[n].iva,
  }))
  return {
    cabecera: {
      terceroId: datos.terceroId,
      fecha: datos.fecha,
      moneda,
      cotizacion: moneda === 'PES' ? '1' : datos.cotizacion,
      listaPreciosId: datos.listaPreciosId,
      vendedorId: datos.vendedorId,
      condicionPagoId: datos.condicionPagoId,
      observaciones: datos.observaciones,
      neto: totales.neto,
      iva: totales.iva,
      total: totales.total,
    },
    items,
  }
}

export function errorDeBase(e: unknown): string | null {
  const m = (e as { cause?: { message?: string } }).cause?.message ?? ''
  if (m.includes('violates foreign key')) return 'Un dato elegido (cliente, artículo, lista o vendedor) ya no existe.'
  return null
}

// ------------------------------------------------------------ Presupuestos

export async function guardarPresupuesto(
  tx: Transaccion,
  usuarioId: string,
  entrada: unknown,
  id?: string,
): Promise<ResultadoDocumento> {
  const p = EsquemaPresupuesto.safeParse(entrada)
  if (!p.success) return { ok: false, error: primerError(p.error) }
  const { cabecera, items } = preparar(p.data)
  try {
    if (id) {
      const [antes] = await tx.select().from(presupuestos).where(eq(presupuestos.id, id))
      if (!antes) return { ok: false, error: 'Ese presupuesto ya no existe.' }
      if (!['borrador', 'enviado'].includes(antes.estado)) {
        return { ok: false, error: `El presupuesto está ${antes.estado}: ya no se modifica. Hacé uno nuevo.` }
      }
      await tx
        .update(presupuestos)
        .set({ ...cabecera, validezDias: p.data.validezDias })
        .where(eq(presupuestos.id, id))
      await tx.delete(presupuestosItems).where(eq(presupuestosItems.presupuestoId, id))
      await tx.insert(presupuestosItems).values(items.map((i) => ({ ...i, presupuestoId: id })))
      await auditar(tx, {
        usuarioId,
        accion: 'modificacion',
        entidad: 'presupuesto',
        entidadId: id,
        antes,
        despues: { cabecera, items },
      })
      return { ok: true, id, numero: antes.numero }
    }
    const numero = await siguienteNumero(tx, 'presupuesto')
    const [nuevo] = await tx
      .insert(presupuestos)
      .values({ ...cabecera, numero, validezDias: p.data.validezDias, usuarioId })
      .returning()
    await tx.insert(presupuestosItems).values(items.map((i) => ({ ...i, presupuestoId: nuevo.id })))
    await auditar(tx, {
      usuarioId,
      accion: 'alta',
      entidad: 'presupuesto',
      entidadId: nuevo.id,
      despues: { numero, cabecera, items },
    })
    return { ok: true, id: nuevo.id, numero }
  } catch (e) {
    const m = errorDeBase(e)
    if (m) return { ok: false, error: m }
    throw e
  }
}

const TRANSICIONES: Record<string, string[]> = {
  borrador: ['enviado', 'aceptado', 'rechazado'],
  enviado: ['aceptado', 'rechazado', 'borrador'],
  rechazado: ['borrador'],
  aceptado: [],
}

export async function cambiarEstadoPresupuesto(tx: Transaccion, usuarioId: string, id: string, estado: string) {
  const [antes] = await tx.select().from(presupuestos).where(eq(presupuestos.id, id))
  if (!antes) return { ok: false as const, error: 'Ese presupuesto ya no existe.' }
  if (!TRANSICIONES[antes.estado]?.includes(estado)) {
    return { ok: false as const, error: `Un presupuesto ${antes.estado} no puede pasar a ${estado}.` }
  }
  await tx.update(presupuestos).set({ estado }).where(eq(presupuestos.id, id))
  await auditar(tx, {
    usuarioId,
    accion: 'modificacion',
    entidad: 'presupuesto',
    entidadId: id,
    antes: { estado: antes.estado },
    despues: { estado },
  })
  return { ok: true as const }
}

/** Convierte un presupuesto en pedido (y lo marca aceptado). */
export async function convertirEnPedido(
  tx: Transaccion,
  usuarioId: string,
  presupuestoId: string,
  depositoId?: string | null,
): Promise<ResultadoDocumento> {
  const [pres] = await tx.select().from(presupuestos).where(eq(presupuestos.id, presupuestoId)).for('update')
  if (!pres) return { ok: false, error: 'Ese presupuesto ya no existe.' }
  const [yaHecho] = await tx.select({ numero: pedidos.numero }).from(pedidos).where(eq(pedidos.presupuestoId, presupuestoId))
  if (yaHecho) return { ok: false, error: `Este presupuesto ya es el pedido ${yaHecho.numero}.` }
  if (pres.estado === 'rechazado') return { ok: false, error: 'El presupuesto está rechazado.' }
  const items = await tx
    .select()
    .from(presupuestosItems)
    .where(eq(presupuestosItems.presupuestoId, presupuestoId))
    .orderBy(asc(presupuestosItems.orden))
  const numero = await siguienteNumero(tx, 'pedido')
  const [pedido] = await tx
    .insert(pedidos)
    .values({
      terceroId: pres.terceroId,
      vendedorId: pres.vendedorId,
      listaPreciosId: pres.listaPreciosId,
      condicionPagoId: pres.condicionPagoId,
      moneda: pres.moneda,
      cotizacion: pres.cotizacion,
      observaciones: pres.observaciones,
      neto: pres.neto,
      iva: pres.iva,
      total: pres.total,
      numero,
      fecha: hoyArgentina(),
      origen: 'presupuesto',
      presupuestoId,
      depositoId: depositoId ?? null,
      usuarioId,
    })
    .returning()
  await tx.insert(pedidosItems).values(
    items.map((i) => ({
      pedidoId: pedido.id,
      orden: i.orden,
      articuloId: i.articuloId,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
      descuento: i.descuento,
      alicuotaIva: i.alicuotaIva,
      neto: i.neto,
      iva: i.iva,
      cantidadEntregada: '0',
    })),
  )
  await tx.update(presupuestos).set({ estado: 'aceptado' }).where(eq(presupuestos.id, presupuestoId))
  await auditar(tx, {
    usuarioId,
    accion: 'alta',
    entidad: 'pedido',
    entidadId: pedido.id,
    despues: { numero, desdePresupuesto: pres.numero },
  })
  return { ok: true, id: pedido.id, numero }
}

// ----------------------------------------------------------------- Pedidos

export async function guardarPedido(
  tx: Transaccion,
  usuarioId: string,
  entrada: unknown,
  id?: string,
): Promise<ResultadoDocumento> {
  const p = EsquemaPedido.safeParse(entrada)
  if (!p.success) return { ok: false, error: primerError(p.error) }
  const { cabecera, items } = preparar(p.data)
  const extra = { depositoId: p.data.depositoId, fechaEntrega: p.data.fechaEntrega }
  try {
    if (id) {
      const [antes] = await tx.select().from(pedidos).where(eq(pedidos.id, id)).for('update')
      if (!antes) return { ok: false, error: 'Ese pedido ya no existe.' }
      const [entregado] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(pedidosItems)
        .where(and(eq(pedidosItems.pedidoId, id), sql`${pedidosItems.cantidadEntregada} > 0`))
      if (antes.estado !== 'pendiente' || entregado.n > 0) {
        return { ok: false, error: 'El pedido ya tiene entregas o está cerrado: no se modifica.' }
      }
      await tx
        .update(pedidos)
        .set({ ...cabecera, ...extra })
        .where(eq(pedidos.id, id))
      await tx.delete(pedidosItems).where(eq(pedidosItems.pedidoId, id))
      await tx.insert(pedidosItems).values(items.map((i) => ({ ...i, pedidoId: id })))
      await auditar(tx, {
        usuarioId,
        accion: 'modificacion',
        entidad: 'pedido',
        entidadId: id,
        antes,
        despues: { cabecera, items },
      })
      return { ok: true, id, numero: antes.numero }
    }
    const numero = await siguienteNumero(tx, 'pedido')
    const [nuevo] = await tx
      .insert(pedidos)
      .values({ ...cabecera, ...extra, numero, usuarioId })
      .returning()
    await tx.insert(pedidosItems).values(items.map((i) => ({ ...i, pedidoId: nuevo.id })))
    await auditar(tx, { usuarioId, accion: 'alta', entidad: 'pedido', entidadId: nuevo.id, despues: { numero, cabecera, items } })
    return { ok: true, id: nuevo.id, numero }
  } catch (e) {
    const m = errorDeBase(e)
    if (m) return { ok: false, error: m }
    throw e
  }
}

/** Cancela lo que falta entregar de un pedido. Lo entregado queda. */
export async function cancelarPedido(tx: Transaccion, usuarioId: string, id: string) {
  const [antes] = await tx.select().from(pedidos).where(eq(pedidos.id, id)).for('update')
  if (!antes) return { ok: false as const, error: 'Ese pedido ya no existe.' }
  if (['entregado', 'cancelado'].includes(antes.estado))
    return { ok: false as const, error: `El pedido ya está ${antes.estado}.` }
  await tx.update(pedidos).set({ estado: 'cancelado' }).where(eq(pedidos.id, id))
  await auditar(tx, { usuarioId, accion: 'anulacion', entidad: 'pedido', entidadId: id, antes: { estado: antes.estado } })
  return { ok: true as const }
}

/** Recalcula el estado de un pedido según lo entregado. */
export async function actualizarEstadoPedido(tx: Transaccion, pedidoId: string) {
  const [pedido] = await tx.select().from(pedidos).where(eq(pedidos.id, pedidoId))
  if (!pedido || pedido.estado === 'cancelado') return
  const items = await tx.select().from(pedidosItems).where(eq(pedidosItems.pedidoId, pedidoId))
  const nada = items.every((i) => Number(i.cantidadEntregada) === 0)
  const todo = items.every((i) => Number(i.cantidadEntregada) >= Number(i.cantidad))
  const estado = todo ? 'entregado' : nada ? 'pendiente' : 'parcial'
  if (estado !== pedido.estado) await tx.update(pedidos).set({ estado }).where(eq(pedidos.id, pedidoId))
}

// ---------------------------------------------------------------- Consultas

export type FiltroDocumentos = { q?: string; estado?: string }

function filtroTexto(q: string | undefined, numero: typeof presupuestos.numero | typeof pedidos.numero) {
  const texto = q?.trim()
  if (!texto) return undefined
  return /^\d+$/.test(texto)
    ? or(eq(numero, Number(texto)), ilike(terceros.razonSocial, `%${texto}%`))
    : ilike(terceros.razonSocial, `%${texto}%`)
}

export async function listarPresupuestos(tx: Transaccion, filtro: FiltroDocumentos = {}) {
  return tx
    .select({
      id: presupuestos.id,
      numero: presupuestos.numero,
      fecha: presupuestos.fecha,
      cliente: terceros.razonSocial,
      moneda: presupuestos.moneda,
      total: presupuestos.total,
      estado: presupuestos.estado,
      validezDias: presupuestos.validezDias,
    })
    .from(presupuestos)
    .innerJoin(terceros, eq(terceros.id, presupuestos.terceroId))
    .where(and(filtro.estado ? eq(presupuestos.estado, filtro.estado) : undefined, filtroTexto(filtro.q, presupuestos.numero)))
    .orderBy(desc(presupuestos.numero))
    .limit(200)
}

export async function listarPedidos(tx: Transaccion, filtro: FiltroDocumentos = {}) {
  return tx
    .select({
      id: pedidos.id,
      numero: pedidos.numero,
      fecha: pedidos.fecha,
      cliente: terceros.razonSocial,
      moneda: pedidos.moneda,
      total: pedidos.total,
      estado: pedidos.estado,
      origen: pedidos.origen,
      fechaEntrega: pedidos.fechaEntrega,
    })
    .from(pedidos)
    .innerJoin(terceros, eq(terceros.id, pedidos.terceroId))
    .where(and(filtro.estado ? eq(pedidos.estado, filtro.estado) : undefined, filtroTexto(filtro.q, pedidos.numero)))
    .orderBy(desc(pedidos.numero))
    .limit(200)
}

export async function obtenerPresupuesto(tx: Transaccion, id: string) {
  const [cab] = await tx.select().from(presupuestos).where(eq(presupuestos.id, id))
  if (!cab) return null
  const items = await tx
    .select()
    .from(presupuestosItems)
    .where(eq(presupuestosItems.presupuestoId, id))
    .orderBy(asc(presupuestosItems.orden))
  const [cliente] = await tx.select().from(terceros).where(eq(terceros.id, cab.terceroId))
  const [pedido] = await tx.select({ id: pedidos.id, numero: pedidos.numero }).from(pedidos).where(eq(pedidos.presupuestoId, id))
  return { ...cab, items, cliente, pedido: pedido ?? null }
}

export async function obtenerPedido(tx: Transaccion, id: string) {
  const [cab] = await tx.select().from(pedidos).where(eq(pedidos.id, id))
  if (!cab) return null
  const items = await tx.select().from(pedidosItems).where(eq(pedidosItems.pedidoId, id)).orderBy(asc(pedidosItems.orden))
  const [cliente] = await tx.select().from(terceros).where(eq(terceros.id, cab.terceroId))
  return { ...cab, items, cliente }
}

// ------------------------------------------- Búsqueda para cargar renglones

/**
 * Artículos para agregar a un documento: con el precio de la lista elegida
 * ya pasado a la moneda del documento, la alícuota y el stock total.
 */
export async function articulosParaDocumento(
  tx: Transaccion,
  texto: string,
  opciones: { listaId?: string | null; moneda: string; cotizacion: string },
) {
  const q = texto.trim()
  if (q.length < 2) return []
  const arts = await tx
    .select({
      id: articulos.id,
      codigo: articulos.codigo,
      nombre: articulos.nombre,
      alicuotaIva: articulos.alicuotaIva,
      llevaStock: articulos.llevaStock,
    })
    .from(articulos)
    .where(
      and(
        eq(articulos.activo, true),
        or(ilike(articulos.nombre, `%${q}%`), ilike(articulos.codigo, `%${q}%`), eq(articulos.codigoBarras, q)),
      ),
    )
    .orderBy(asc(articulos.nombre))
    .limit(12)
  if (!arts.length) return []
  const ids = arts.map((a) => a.id)
  const precios = opciones.listaId ? await preciosVigentes(tx, opciones.listaId, ids) : new Map()
  const stock = new Map<string, number>()
  for (const s of await saldos(tx, ids)) stock.set(s.articuloId, (stock.get(s.articuloId) ?? 0) + Number(s.cantidad))
  return arts.map((a) => {
    const p = precios.get(a.id)
    let precio: string | null = null
    let aviso: string | null = null
    if (p) {
      try {
        precio = convertir(p.precio, p.moneda, opciones.moneda, opciones.cotizacion)
      } catch {
        aviso = `El precio está en ${p.moneda}: no se puede pasar a ${opciones.moneda}.`
      }
    }
    return { ...a, precio, aviso, stock: a.llevaStock ? (stock.get(a.id) ?? 0) : null, precioOriginal: p ?? null }
  })
}

export async function nombresDeArticulos(tx: Transaccion, ids: string[]) {
  if (!ids.length) return new Map<string, string>()
  const filas = await tx.select({ id: articulos.id, codigo: articulos.codigo }).from(articulos).where(inArray(articulos.id, ids))
  return new Map(filas.map((f) => [f.id, f.codigo]))
}
