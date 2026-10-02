import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import {
  articulos,
  comprobantes,
  depositos,
  equipos,
  listasPrecios,
  modelosEquipo,
  ordenesServicio,
  ordenesServicioItems,
  ordenesServicioVisitas,
  tecnicos,
  terceros,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { monto } from '../../lib/dinero'
import { convertir, TASAS_IVA } from '../comercial/calculo'
import { decimal, opcionalUuid, primerError } from '../comercial/documentos'
import { siguienteNumero } from '../comercial/numeracion'
import { registrarMovimientos, saldoDe } from '../comercial/stock'
import { registrarLectura } from '../contratos/contratos'
import { guardarComprobante } from '../facturacion/comprobantes'
import { preciosVigentes } from '../maestros/articulos'
import { COBERTURAS, coberturaSugerida, estaAbierta, TIPOS_ORDEN } from './tipos'

export { COBERTURAS, ESTADOS_ORDEN, TIPOS_ORDEN, coberturaSugerida, estaAbierta } from './tipos'

/**
 * Servicio técnico: órdenes sobre los equipos de los clientes, con sus
 * visitas, los insumos y repuestos usados (descuentan stock al cargarlos) y,
 * si van con cargo, la factura en borrador.
 */

const texto = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)
const fechaOpcional = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .pipe(z.iso.date({ error: 'Fecha inválida.' }).nullable())
const fecha = z.iso.date({ error: 'Fecha inválida.' })
const claves = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]

type Error = { ok: false; error: string }
const error = (mensaje: string): Error => ({ ok: false, error: mensaje })

/** La orden bloqueada hasta el fin de la transacción (dos técnicos no la pisan). */
async function ordenParaCambiar(tx: Transaccion, id: string) {
  const [o] = await tx.select().from(ordenesServicio).where(eq(ordenesServicio.id, id)).for('update')
  return o ?? null
}

function soloAbierta(o: typeof ordenesServicio.$inferSelect | null): Error | null {
  if (!o) return error('Esa orden de servicio ya no existe.')
  if (o.estado === 'cancelada') return error('La orden está cancelada.')
  if (o.estado === 'resuelta') return error('La orden ya está resuelta: reabrila para cambiarla.')
  return null
}

// ---------------------------------------------------------------- Órdenes

const EsquemaOrden = z.object({
  fecha,
  terceroId: z.uuid({ error: 'Elegí el cliente.' }),
  equipoId: opcionalUuid,
  tipo: z.enum(claves(TIPOS_ORDEN)).default('correctivo'),
  prioridad: z.enum(['normal', 'urgente']).default('normal'),
  falla: z.string().trim().min(3, { error: 'Escribí qué pasa o qué pide el cliente.' }),
  contacto: texto,
  telefono: texto,
  domicilio: texto,
  tecnicoId: opcionalUuid,
  programada: fechaOpcional,
  /** Vacía: la sugerida según el equipo (contrato, garantía o cargo). */
  cobertura: z
    .enum(claves(COBERTURAS))
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  observaciones: texto,
})

/** Abre una orden nueva o corrige los datos de una que no está facturada ni cancelada. */
export async function guardarOrden(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string) {
  const p = EsquemaOrden.safeParse(entrada)
  if (!p.success) return error(primerError(p.error))
  const { cobertura, ...d } = p.data

  let equipo: typeof equipos.$inferSelect | undefined
  if (d.equipoId) {
    ;[equipo] = await tx.select().from(equipos).where(eq(equipos.id, d.equipoId))
    if (!equipo) return error('Ese equipo ya no existe.')
    if (equipo.terceroId && equipo.terceroId !== d.terceroId) return error('El equipo está instalado en otro cliente.')
  }
  if (d.programada && d.programada < d.fecha) return error('La visita no puede ser antes de la fecha del pedido.')

  const datos = {
    ...d,
    contratoId: equipo?.contratoId ?? null,
    domicilio: d.domicilio ?? (equipo ? [equipo.domicilio, equipo.localidad].filter(Boolean).join(', ') || null : null),
    contacto: d.contacto ?? equipo?.contacto ?? null,
    telefono: d.telefono ?? equipo?.telefono ?? null,
    cobertura: cobertura ?? coberturaSugerida(equipo ?? null, d.fecha),
  }

  let ordenId = id
  let numero: number
  if (id) {
    const o = await ordenParaCambiar(tx, id)
    if (!o) return error('Esa orden de servicio ya no existe.')
    if (o.estado === 'cancelada') return error('La orden está cancelada.')
    if (o.comprobanteId) return error('La orden ya está facturada: no se modifica.')
    const estado = estaAbierta(o.estado) ? (datos.tecnicoId ? 'asignada' : 'pendiente') : o.estado
    await tx
      .update(ordenesServicio)
      .set({ ...datos, estado })
      .where(eq(ordenesServicio.id, id))
    numero = o.numero
  } else {
    numero = await siguienteNumero(tx, 'orden_servicio')
    const [nueva] = await tx
      .insert(ordenesServicio)
      .values({ ...datos, numero, estado: datos.tecnicoId ? 'asignada' : 'pendiente', usuarioId })
      .returning({ id: ordenesServicio.id })
    ordenId = nueva.id
  }
  await auditar(tx, {
    usuarioId,
    accion: id ? 'modificacion' : 'alta',
    entidad: 'orden_servicio',
    entidadId: ordenId,
    despues: datos,
  })
  return { ok: true as const, id: ordenId!, numero }
}

const EsquemaAsignacion = z.object({ tecnicoId: opcionalUuid, programada: fechaOpcional })

/** Asigna (o desasigna) el técnico y el día de la visita. */
export async function asignarOrden(tx: Transaccion, usuarioId: string, id: string, entrada: unknown) {
  const p = EsquemaAsignacion.safeParse(entrada)
  if (!p.success) return error(primerError(p.error))
  const o = await ordenParaCambiar(tx, id)
  const no = soloAbierta(o)
  if (no) return no
  if (p.data.programada && p.data.programada < o!.fecha) return error('La visita no puede ser antes de la fecha del pedido.')
  await tx
    .update(ordenesServicio)
    .set({ ...p.data, estado: p.data.tecnicoId ? 'asignada' : 'pendiente' })
    .where(eq(ordenesServicio.id, id))
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'orden_servicio', entidadId: id, despues: p.data })
  return { ok: true as const }
}

// ---------------------------------------------------------------- Visitas

const EsquemaVisita = z.object({
  fecha,
  tecnicoId: opcionalUuid,
  horas: decimal('Las horas son un número (1,5 es una hora y media).').default('0'),
  detalle: z.string().trim().min(3, { error: 'Escribí qué se hizo en la visita.' }),
})

export async function registrarVisita(tx: Transaccion, usuarioId: string, ordenId: string, entrada: unknown) {
  const p = EsquemaVisita.safeParse(entrada)
  if (!p.success) return error(primerError(p.error))
  const o = await ordenParaCambiar(tx, ordenId)
  const no = soloAbierta(o)
  if (no) return no
  if (p.data.fecha < o!.fecha) return error('La visita no puede ser antes de la fecha del pedido.')
  const tecnicoId = p.data.tecnicoId ?? o!.tecnicoId
  await tx.insert(ordenesServicioVisitas).values({ ...p.data, tecnicoId, ordenId, usuarioId })
  // Quien fue a verla queda como técnico de la orden si no había uno.
  if (!o!.tecnicoId && tecnicoId) {
    await tx.update(ordenesServicio).set({ tecnicoId, estado: 'asignada' }).where(eq(ordenesServicio.id, ordenId))
  }
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'visita_servicio', entidadId: ordenId, despues: p.data })
  return { ok: true as const }
}

// ------------------------------------------------- Insumos y mano de obra

const EsquemaItem = z.object({
  articuloId: opcionalUuid,
  descripcion: texto,
  cantidad: decimal('La cantidad tiene que ser mayor que cero.').refine((v) => Number(v) > 0, {
    error: 'La cantidad tiene que ser mayor que cero.',
  }),
  depositoId: opcionalUuid,
  precioUnitario: decimal('El precio no puede ser negativo.').default('0'),
  alicuotaIva: z.coerce
    .number()
    .refine((v) => v in TASAS_IVA, { error: 'Alícuota de IVA inválida.' })
    .optional(),
})

/**
 * Agrega un insumo, repuesto o mano de obra. Si es un artículo con stock,
 * sale del depósito en ese momento; si el depósito no tenía, avisa y deja el
 * stock negativo (el técnico ya lo usó).
 */
export async function agregarItem(tx: Transaccion, usuarioId: string, ordenId: string, entrada: unknown) {
  const p = EsquemaItem.safeParse(entrada)
  if (!p.success) return error(primerError(p.error))
  const d = p.data
  const o = await ordenParaCambiar(tx, ordenId)
  const no = soloAbierta(o)
  if (no) return no

  let articulo: typeof articulos.$inferSelect | undefined
  if (d.articuloId) {
    ;[articulo] = await tx.select().from(articulos).where(eq(articulos.id, d.articuloId))
    if (!articulo) return error('Ese artículo ya no existe.')
  }
  const descripcion = d.descripcion ?? articulo?.nombre
  if (!descripcion) return error('Elegí un artículo o escribí qué se cobra (por ejemplo, Mano de obra).')
  const conStock = !!articulo?.llevaStock
  if (conStock && !d.depositoId) return error('Elegí de qué depósito sale.')

  const avisos: string[] = []
  if (conStock) {
    const saldo = monto(await saldoDe(tx, articulo!.id, d.depositoId!))
    if (saldo.lt(d.cantidad)) {
      avisos.push(`${articulo!.codigo}: el depósito tenía ${saldo.toString()} y salen ${d.cantidad}; queda stock negativo.`)
    }
  }
  const [item] = await tx
    .insert(ordenesServicioItems)
    .values({
      ordenId,
      articuloId: articulo?.id ?? null,
      descripcion,
      cantidad: d.cantidad,
      depositoId: conStock ? d.depositoId : null,
      precioUnitario: d.precioUnitario,
      alicuotaIva: d.alicuotaIva ?? articulo?.alicuotaIva ?? 5,
      usuarioId,
    })
    .returning()
  if (conStock) {
    await registrarMovimientos(tx, usuarioId, [
      {
        articuloId: articulo!.id,
        depositoId: d.depositoId!,
        cantidad: `-${d.cantidad}`,
        tipo: 'servicio',
        origenId: ordenId,
        observacion: `Orden de servicio ${o!.numero}`,
      },
    ])
  }
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'item_servicio', entidadId: item.id, despues: item })
  return { ok: true as const, id: item.id, avisos }
}

/** Quita un renglón de una orden abierta; lo que había salido del depósito vuelve. */
export async function quitarItem(tx: Transaccion, usuarioId: string, itemId: string) {
  const [item] = await tx.select().from(ordenesServicioItems).where(eq(ordenesServicioItems.id, itemId))
  if (!item) return error('Ese renglón ya no existe.')
  const o = await ordenParaCambiar(tx, item.ordenId)
  const no = soloAbierta(o)
  if (no) return no
  await tx.delete(ordenesServicioItems).where(eq(ordenesServicioItems.id, itemId))
  if (item.articuloId && item.depositoId) {
    await registrarMovimientos(tx, usuarioId, [
      {
        articuloId: item.articuloId,
        depositoId: item.depositoId,
        cantidad: item.cantidad,
        tipo: 'anulacion_servicio',
        origenId: item.ordenId,
        observacion: `Devuelto de la orden de servicio ${o!.numero}`,
      },
    ])
  }
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'item_servicio', entidadId: itemId, antes: item })
  return { ok: true as const }
}

// ----------------------------------------------- Resolver, reabrir, cancelar

const EsquemaResolucion = z.object({
  fecha,
  solucion: z.string().trim().min(3, { error: 'Escribí qué se hizo para resolverla.' }),
  contador: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((v) => (v === null || v === undefined || String(v).trim() === '' ? null : Number(String(v).replace(/\./g, ''))))
    .pipe(
      z
        .number({ error: 'El contador es un número entero.' })
        .int({ error: 'El contador es un número entero.' })
        .min(0)
        .nullable(),
    ),
  creditos: z.coerce.number().int().min(0, { error: 'Las copias de prueba son un número entero.' }).default(0),
})

/**
 * Da la orden por resuelta. Si el técnico tomó el contador del equipo, queda
 * también como lectura (con las copias de prueba, que no se le cobran).
 */
export async function resolverOrden(tx: Transaccion, usuarioId: string, id: string, entrada: unknown) {
  const p = EsquemaResolucion.safeParse(entrada)
  if (!p.success) return error(primerError(p.error))
  const d = p.data
  const o = await ordenParaCambiar(tx, id)
  const no = soloAbierta(o)
  if (no) return no
  if (d.fecha < o!.fecha) return error('No se puede resolver antes de la fecha del pedido.')
  if (d.contador !== null) {
    if (!o!.equipoId) return error('La orden no tiene equipo: el contador no se puede guardar.')
    const l = await registrarLectura(
      tx,
      usuarioId,
      { equipoId: o!.equipoId, fecha: d.fecha, contador: d.contador, creditos: d.creditos },
      'tecnico',
    )
    if (!l.ok) return l
  }
  await tx
    .update(ordenesServicio)
    .set({ estado: 'resuelta', solucion: d.solucion, fechaResolucion: d.fecha, contador: d.contador })
    .where(eq(ordenesServicio.id, id))
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'orden_servicio', entidadId: id, despues: d })
  return { ok: true as const }
}

/** Vuelve a abrir una orden resuelta (por ejemplo, si la falla se repitió). No si ya se facturó. */
export async function reabrirOrden(tx: Transaccion, usuarioId: string, id: string) {
  const o = await ordenParaCambiar(tx, id)
  if (!o) return error('Esa orden de servicio ya no existe.')
  if (o.estado !== 'resuelta') return error('Solo se reabre una orden resuelta.')
  if (o.comprobanteId) return error('La orden ya está facturada: abrí una nueva.')
  await tx
    .update(ordenesServicio)
    .set({ estado: o.tecnicoId ? 'asignada' : 'pendiente', fechaResolucion: null })
    .where(eq(ordenesServicio.id, id))
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'orden_servicio', entidadId: id, despues: { reabierta: true } })
  return { ok: true as const }
}

export async function cancelarOrden(tx: Transaccion, usuarioId: string, id: string, motivo: string) {
  const o = await ordenParaCambiar(tx, id)
  const no = soloAbierta(o)
  if (no) return no
  if (motivo.trim().length < 3) return error('Escribí por qué se cancela.')
  const [usado] = await tx
    .select({ id: ordenesServicioItems.id })
    .from(ordenesServicioItems)
    .where(eq(ordenesServicioItems.ordenId, id))
    .limit(1)
  if (usado) return error('La orden tiene insumos cargados: quitalos primero (vuelven al depósito) o resolvela.')
  await tx
    .update(ordenesServicio)
    .set({ estado: 'cancelada', motivoCancelacion: motivo.trim() })
    .where(eq(ordenesServicio.id, id))
  await auditar(tx, { usuarioId, accion: 'anulacion', entidad: 'orden_servicio', entidadId: id, despues: { motivo } })
  return { ok: true as const }
}

// ---------------------------------------------------------------- Facturar

const EsquemaFacturar = z.object({
  puntoVenta: z.coerce.number().int().min(1, { error: 'Elegí el punto de venta.' }),
  fecha,
})

/**
 * Factura (en borrador) lo que tiene precio en una orden resuelta con cargo
 * al cliente. Concepto para ARCA: productos si son solo artículos de tipo
 * producto, servicios si son solo servicios o mano de obra, y ambos si hay de
 * los dos.
 */
export async function facturarOrden(tx: Transaccion, usuarioId: string, id: string, entrada: unknown) {
  const p = EsquemaFacturar.safeParse(entrada)
  if (!p.success) return error(primerError(p.error))
  const o = await ordenParaCambiar(tx, id)
  if (!o) return error('Esa orden de servicio ya no existe.')
  if (o.estado !== 'resuelta') return error('Se factura una orden resuelta.')
  if (o.comprobanteId) return error('La orden ya está facturada.')
  if (o.cobertura !== 'cargo') {
    return error(`La orden está ${o.cobertura === 'contrato' ? 'cubierta por el contrato' : 'en garantía'}: no se factura.`)
  }
  const items = (
    await tx
      .select({ item: ordenesServicioItems, tipoArticulo: articulos.tipo })
      .from(ordenesServicioItems)
      .leftJoin(articulos, eq(articulos.id, ordenesServicioItems.articuloId))
      .where(eq(ordenesServicioItems.ordenId, id))
      .orderBy(asc(ordenesServicioItems.creado))
  ).filter((f) => Number(f.item.precioUnitario) > 0)
  if (!items.length) return error('La orden no tiene nada con precio para facturar.')

  // Un concepto escrito a mano (mano de obra, viático) es un servicio.
  const productos = items.some((f) => f.tipoArticulo === 'producto')
  const servicios = items.some((f) => f.tipoArticulo !== 'producto')
  const concepto = productos && servicios ? 3 : productos ? 1 : 2
  const [equipo] = o.equipoId ? await tx.select({ serie: equipos.serie }).from(equipos).where(eq(equipos.id, o.equipoId)) : []
  const f = await guardarComprobante(tx, usuarioId, {
    clase: 'factura',
    terceroId: o.terceroId,
    puntoVenta: p.data.puntoVenta,
    fecha: p.data.fecha,
    moneda: 'PES',
    cotizacion: '1',
    concepto,
    servicioDesde: concepto === 1 ? null : o.fecha,
    servicioHasta: concepto === 1 ? null : o.fechaResolucion,
    vencimiento: p.data.fecha,
    observaciones: `Orden de servicio N° ${o.numero}${equipo ? ` · equipo ${equipo.serie}` : ''}`,
    items: items.map(({ item: i }) => ({
      articuloId: i.articuloId,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
      alicuotaIva: i.alicuotaIva,
    })),
  })
  if (!f.ok) return f
  await tx.update(ordenesServicio).set({ comprobanteId: f.id }).where(eq(ordenesServicio.id, id))
  await auditar(tx, { usuarioId, accion: 'emision', entidad: 'orden_servicio', entidadId: id, despues: { comprobanteId: f.id } })
  return { ok: true as const, comprobanteId: f.id }
}

// -------------------------------------------------------------- Consultas

export type FiltroOrdenes = {
  q?: string
  /** abiertas (sin asignar + asignadas), un estado, o todas */
  estado?: string
  tecnicoId?: string
  equipoId?: string
  terceroId?: string
  limite?: number
}

export async function listarOrdenes(tx: Transaccion, filtro: FiltroOrdenes = {}) {
  const q = filtro.q?.trim()
  const estado =
    filtro.estado === 'todas'
      ? undefined
      : filtro.estado && filtro.estado !== 'abiertas'
        ? eq(ordenesServicio.estado, filtro.estado)
        : inArray(ordenesServicio.estado, ['pendiente', 'asignada'])
  return (
    tx
      .select({
        id: ordenesServicio.id,
        numero: ordenesServicio.numero,
        fecha: ordenesServicio.fecha,
        tipo: ordenesServicio.tipo,
        prioridad: ordenesServicio.prioridad,
        estado: ordenesServicio.estado,
        cobertura: ordenesServicio.cobertura,
        falla: ordenesServicio.falla,
        programada: ordenesServicio.programada,
        fechaResolucion: ordenesServicio.fechaResolucion,
        comprobanteId: ordenesServicio.comprobanteId,
        cliente: terceros.razonSocial,
        terceroId: ordenesServicio.terceroId,
        equipoId: ordenesServicio.equipoId,
        serie: equipos.serie,
        modelo: modelosEquipo.nombre,
        tecnico: tecnicos.nombre,
      })
      .from(ordenesServicio)
      .innerJoin(terceros, eq(terceros.id, ordenesServicio.terceroId))
      .leftJoin(equipos, eq(equipos.id, ordenesServicio.equipoId))
      .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
      .leftJoin(tecnicos, eq(tecnicos.id, ordenesServicio.tecnicoId))
      .where(
        and(
          estado,
          filtro.tecnicoId ? eq(ordenesServicio.tecnicoId, filtro.tecnicoId) : undefined,
          filtro.equipoId ? eq(ordenesServicio.equipoId, filtro.equipoId) : undefined,
          filtro.terceroId ? eq(ordenesServicio.terceroId, filtro.terceroId) : undefined,
          q
            ? or(
                ilike(terceros.razonSocial, `%${q}%`),
                ilike(equipos.serie, `%${q}%`),
                ilike(ordenesServicio.falla, `%${q}%`),
                /^\d+$/.test(q) ? eq(ordenesServicio.numero, Number(q)) : undefined,
              )
            : undefined,
        ),
      )
      // Abiertas: primero las urgentes y las más viejas. El resto, las más nuevas arriba.
      .orderBy(
        sql`case when ${ordenesServicio.estado} in ('pendiente', 'asignada') then 0 else 1 end`,
        sql`case when ${ordenesServicio.estado} in ('pendiente', 'asignada') and ${ordenesServicio.prioridad} = 'urgente' then 0 else 1 end`,
        sql`case when ${ordenesServicio.estado} in ('pendiente', 'asignada') then ${ordenesServicio.numero} else -${ordenesServicio.numero} end`,
      )
      .limit(filtro.limite ?? 300)
  )
}

/** Cuántas hay abiertas, sin asignar y urgentes (para el encabezado). */
export async function resumenOrdenes(tx: Transaccion) {
  const [r] = await tx
    .select({
      abiertas: sql<number>`count(*) filter (where ${ordenesServicio.estado} in ('pendiente', 'asignada'))::int`,
      sinAsignar: sql<number>`count(*) filter (where ${ordenesServicio.estado} = 'pendiente')::int`,
      urgentes: sql<number>`count(*) filter (where ${ordenesServicio.estado} in ('pendiente', 'asignada') and ${ordenesServicio.prioridad} = 'urgente')::int`,
      porFacturar: sql<number>`count(*) filter (where ${ordenesServicio.estado} = 'resuelta' and ${ordenesServicio.cobertura} = 'cargo' and ${ordenesServicio.comprobanteId} is null)::int`,
    })
    .from(ordenesServicio)
  return r
}

export async function obtenerOrden(tx: Transaccion, id: string) {
  const [o] = await tx.select().from(ordenesServicio).where(eq(ordenesServicio.id, id))
  if (!o) return null
  const [[cliente], [equipo], visitas, items, [factura]] = await Promise.all([
    tx
      .select({ id: terceros.id, razonSocial: terceros.razonSocial, listaPreciosId: terceros.listaPreciosId })
      .from(terceros)
      .where(eq(terceros.id, o.terceroId)),
    o.equipoId
      ? tx
          .select({
            id: equipos.id,
            serie: equipos.serie,
            modelo: modelosEquipo.nombre,
            garantiaHasta: equipos.garantiaHasta,
            contratoId: equipos.contratoId,
            sector: equipos.sector,
          })
          .from(equipos)
          .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
          .where(eq(equipos.id, o.equipoId))
      : Promise.resolve([]),
    tx
      .select({
        id: ordenesServicioVisitas.id,
        fecha: ordenesServicioVisitas.fecha,
        horas: ordenesServicioVisitas.horas,
        detalle: ordenesServicioVisitas.detalle,
        tecnico: tecnicos.nombre,
      })
      .from(ordenesServicioVisitas)
      .leftJoin(tecnicos, eq(tecnicos.id, ordenesServicioVisitas.tecnicoId))
      .where(eq(ordenesServicioVisitas.ordenId, id))
      .orderBy(asc(ordenesServicioVisitas.fecha), asc(ordenesServicioVisitas.creado)),
    tx
      .select({
        id: ordenesServicioItems.id,
        articuloId: ordenesServicioItems.articuloId,
        codigo: articulos.codigo,
        descripcion: ordenesServicioItems.descripcion,
        cantidad: ordenesServicioItems.cantidad,
        deposito: depositos.nombre,
        precioUnitario: ordenesServicioItems.precioUnitario,
        alicuotaIva: ordenesServicioItems.alicuotaIva,
      })
      .from(ordenesServicioItems)
      .leftJoin(articulos, eq(articulos.id, ordenesServicioItems.articuloId))
      .leftJoin(depositos, eq(depositos.id, ordenesServicioItems.depositoId))
      .where(eq(ordenesServicioItems.ordenId, id))
      .orderBy(asc(ordenesServicioItems.creado)),
    o.comprobanteId
      ? tx
          .select({
            id: comprobantes.id,
            estado: comprobantes.estado,
            letra: comprobantes.letra,
            puntoVenta: comprobantes.puntoVenta,
            numero: comprobantes.numero,
            total: comprobantes.total,
          })
          .from(comprobantes)
          .where(eq(comprobantes.id, o.comprobanteId))
      : Promise.resolve([]),
  ])
  const tecnico = o.tecnicoId ? (await tx.select().from(tecnicos).where(eq(tecnicos.id, o.tecnicoId)))[0] : null
  return { ...o, cliente, equipo: equipo ?? null, tecnico, visitas, items, factura: factura ?? null }
}

export async function listarTecnicos(tx: Transaccion) {
  return tx
    .select({ id: tecnicos.id, nombre: tecnicos.nombre })
    .from(tecnicos)
    .where(eq(tecnicos.activo, true))
    .orderBy(asc(tecnicos.nombre))
}

/** Equipos instalados de un cliente, para elegir sobre cuál es la orden. */
export async function equiposDelCliente(tx: Transaccion, terceroId: string) {
  return tx
    .select({
      id: equipos.id,
      serie: equipos.serie,
      modelo: modelosEquipo.nombre,
      sector: equipos.sector,
      contratoId: equipos.contratoId,
      garantiaHasta: equipos.garantiaHasta,
    })
    .from(equipos)
    .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
    .where(and(eq(equipos.terceroId, terceroId), eq(equipos.estado, 'instalado')))
    .orderBy(asc(equipos.serie))
}

/**
 * Artículos para cargar en la orden, con el precio en pesos de la lista del
 * cliente (o de la primera lista activa) y el stock total.
 */
export async function articulosParaOrden(tx: Transaccion, ordenId: string, buscar: string, cotizacionDolar: string | null) {
  const q = buscar.trim()
  if (q.length < 2) return []
  const [o] = await tx
    .select({ listaPreciosId: terceros.listaPreciosId })
    .from(ordenesServicio)
    .innerJoin(terceros, eq(terceros.id, ordenesServicio.terceroId))
    .where(eq(ordenesServicio.id, ordenId))
  if (!o) return []
  const listaId =
    o.listaPreciosId ??
    (
      await tx
        .select({ id: listasPrecios.id })
        .from(listasPrecios)
        .where(eq(listasPrecios.activa, true))
        .orderBy(asc(listasPrecios.codigo))
        .limit(1)
    )[0]?.id
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
  const precios = listaId
    ? await preciosVigentes(
        tx,
        listaId,
        arts.map((a) => a.id),
      )
    : new Map()
  return arts.map((a) => {
    const p = precios.get(a.id)
    let precio: string | null = null
    if (p) {
      try {
        precio = convertir(p.precio, p.moneda, 'PES', cotizacionDolar ?? '0')
      } catch {
        precio = null
      }
    }
    return { ...a, precio }
  })
}

/** Órdenes de un equipo, para su ficha. */
export async function ordenesDelEquipo(tx: Transaccion, equipoId: string) {
  return listarOrdenes(tx, { equipoId, estado: 'todas', limite: 50 })
}
