import {
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { alicuotasIva, monedas } from './catalogos'
import { cantidad, cotizacion, empresaId, id, importe, marcasDeTiempo, precio } from './comunes'
import { articulos, condicionesPago, depositos, listasPrecios, terceros, transportes, vendedores } from './maestros'

/**
 * Etapa 1: circuito comercial sin valor fiscal (presupuestos, pedidos,
 * remitos) y stock. Mismas reglas que los maestros: empresa_id con RLS y
 * claves foráneas compuestas para que nada apunte a otra empresa.
 */

const deLaEmpresa = (
  nombre: string,
  empresa: Parameters<typeof foreignKey>[0]['columns'][0],
  columna: Parameters<typeof foreignKey>[0]['columns'][0],
  destino: { empresaId: Parameters<typeof foreignKey>[0]['columns'][0]; id: Parameters<typeof foreignKey>[0]['columns'][0] },
) => foreignKey({ name: nombre, columns: [empresa, columna], foreignColumns: [destino.empresaId, destino.id] })

/**
 * Último número usado por tipo de documento y punto de venta. Se toma con
 * SELECT … FOR UPDATE dentro de la transacción del documento: dos usuarios
 * no pueden obtener el mismo número (ver src/modulos/comercial/numeracion.ts).
 */
export const numeradores = pgTable(
  'numeradores',
  {
    id: id(),
    empresaId: empresaId(),
    /** presupuesto | pedido | remito (y en la etapa 2 los comprobantes fiscales) */
    tipo: text('tipo').notNull(),
    puntoVenta: integer('punto_venta').notNull().default(0),
    ultimo: integer('ultimo').notNull().default(0),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.tipo, t.puntoVenta)],
)

/** Cotización cargada por la empresa (manual) por moneda y fecha. */
export const cotizacionesEmpresa = pgTable(
  'cotizaciones_empresa',
  {
    id: id(),
    empresaId: empresaId(),
    moneda: text('moneda')
      .notNull()
      .references(() => monedas.codigo),
    fecha: date('fecha').notNull(),
    valor: cotizacion('valor').notNull(),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.moneda, t.fecha)],
)

/** Columnas comunes de presupuestos y pedidos. */
const cabeceraComercial = () => ({
  id: id(),
  empresaId: empresaId(),
  numero: integer('numero').notNull(),
  fecha: date('fecha').notNull(),
  terceroId: uuid('tercero_id').notNull(),
  vendedorId: uuid('vendedor_id'),
  listaPreciosId: uuid('lista_precios_id'),
  condicionPagoId: uuid('condicion_pago_id'),
  moneda: text('moneda')
    .notNull()
    .default('PES')
    .references(() => monedas.codigo),
  /** Pesos por unidad de la moneda del documento (1 si es en pesos). */
  cotizacion: cotizacion('cotizacion').notNull().default('1'),
  observaciones: text('observaciones'),
  neto: importe('neto').notNull().default('0'),
  iva: importe('iva').notNull().default('0'),
  total: importe('total').notNull().default('0'),
  usuarioId: uuid('usuario_id'),
  ...marcasDeTiempo(),
})

const itemComercial = () => ({
  id: id(),
  empresaId: empresaId(),
  orden: smallint('orden').notNull(),
  articuloId: uuid('articulo_id'),
  descripcion: text('descripcion').notNull(),
  cantidad: cantidad('cantidad').notNull(),
  /** Neto, en la moneda del documento. */
  precioUnitario: precio('precio_unitario').notNull(),
  descuento: precio('descuento').notNull().default('0'),
  alicuotaIva: smallint('alicuota_iva')
    .notNull()
    .references(() => alicuotasIva.codigo),
  neto: importe('neto').notNull(),
  iva: importe('iva').notNull(),
})

export const presupuestos = pgTable(
  'presupuestos',
  {
    ...cabeceraComercial(),
    /** borrador | enviado | aceptado | rechazado */
    estado: text('estado').notNull().default('borrador'),
    validezDias: smallint('validez_dias').notNull().default(15),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.numero),
    index().on(t.empresaId, t.terceroId),
    unique('presupuestos_empresa_id').on(t.empresaId, t.id),
    deLaEmpresa('presupuestos_tercero_fk', t.empresaId, t.terceroId, terceros),
    deLaEmpresa('presupuestos_vendedor_fk', t.empresaId, t.vendedorId, vendedores),
    deLaEmpresa('presupuestos_lista_fk', t.empresaId, t.listaPreciosId, listasPrecios),
    deLaEmpresa('presupuestos_condicion_fk', t.empresaId, t.condicionPagoId, condicionesPago),
  ],
)

export const presupuestosItems = pgTable(
  'presupuestos_items',
  { ...itemComercial(), presupuestoId: uuid('presupuesto_id').notNull() },
  (t) => [
    index().on(t.empresaId, t.presupuestoId),
    deLaEmpresa('presupuestos_items_presupuesto_fk', t.empresaId, t.presupuestoId, presupuestos).onDelete('cascade'),
    deLaEmpresa('presupuestos_items_articulo_fk', t.empresaId, t.articuloId, articulos),
  ],
)

export const pedidos = pgTable(
  'pedidos',
  {
    ...cabeceraComercial(),
    /** pendiente | parcial | entregado | cancelado */
    estado: text('estado').notNull().default('pendiente'),
    presupuestoId: uuid('presupuesto_id'),
    depositoId: uuid('deposito_id'),
    fechaEntrega: date('fecha_entrega'),
    /** manual | presupuesto | tienda */
    origen: text('origen').notNull().default('manual'),
    /** Número del pedido en la tienda u otro sistema. */
    idExterno: text('id_externo'),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.numero),
    index().on(t.empresaId, t.terceroId),
    index().on(t.empresaId, t.estado),
    uniqueIndex('pedidos_externo').on(t.empresaId, t.origen, t.idExterno),
    unique('pedidos_empresa_id').on(t.empresaId, t.id),
    deLaEmpresa('pedidos_tercero_fk', t.empresaId, t.terceroId, terceros),
    deLaEmpresa('pedidos_vendedor_fk', t.empresaId, t.vendedorId, vendedores),
    deLaEmpresa('pedidos_lista_fk', t.empresaId, t.listaPreciosId, listasPrecios),
    deLaEmpresa('pedidos_condicion_fk', t.empresaId, t.condicionPagoId, condicionesPago),
    deLaEmpresa('pedidos_presupuesto_fk', t.empresaId, t.presupuestoId, presupuestos),
    deLaEmpresa('pedidos_deposito_fk', t.empresaId, t.depositoId, depositos),
  ],
)

export const pedidosItems = pgTable(
  'pedidos_items',
  {
    ...itemComercial(),
    pedidoId: uuid('pedido_id').notNull(),
    cantidadEntregada: cantidad('cantidad_entregada').notNull().default('0'),
  },
  (t) => [
    index().on(t.empresaId, t.pedidoId),
    unique('pedidos_items_empresa_id').on(t.empresaId, t.id),
    deLaEmpresa('pedidos_items_pedido_fk', t.empresaId, t.pedidoId, pedidos).onDelete('cascade'),
    deLaEmpresa('pedidos_items_articulo_fk', t.empresaId, t.articuloId, articulos),
  ],
)

export const remitos = pgTable(
  'remitos',
  {
    id: id(),
    empresaId: empresaId(),
    puntoVenta: integer('punto_venta').notNull(),
    numero: integer('numero').notNull(),
    fecha: date('fecha').notNull(),
    terceroId: uuid('tercero_id').notNull(),
    pedidoId: uuid('pedido_id'),
    depositoId: uuid('deposito_id').notNull(),
    transporteId: uuid('transporte_id'),
    /** emitido | anulado */
    estado: text('estado').notNull().default('emitido'),
    observaciones: text('observaciones'),
    usuarioId: uuid('usuario_id'),
    anuladoPor: uuid('anulado_por'),
    anulado: timestamp('anulado', { withTimezone: true }),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.puntoVenta, t.numero),
    index().on(t.empresaId, t.terceroId),
    unique('remitos_empresa_id').on(t.empresaId, t.id),
    deLaEmpresa('remitos_tercero_fk', t.empresaId, t.terceroId, terceros),
    deLaEmpresa('remitos_pedido_fk', t.empresaId, t.pedidoId, pedidos),
    deLaEmpresa('remitos_deposito_fk', t.empresaId, t.depositoId, depositos),
    deLaEmpresa('remitos_transporte_fk', t.empresaId, t.transporteId, transportes),
  ],
)

export const remitosItems = pgTable(
  'remitos_items',
  {
    id: id(),
    empresaId: empresaId(),
    remitoId: uuid('remito_id').notNull(),
    orden: smallint('orden').notNull(),
    articuloId: uuid('articulo_id'),
    descripcion: text('descripcion').notNull(),
    cantidad: cantidad('cantidad').notNull(),
    pedidoItemId: uuid('pedido_item_id'),
    /** Números de serie entregados (equipos). */
    series: text('series').array(),
  },
  (t) => [
    index().on(t.empresaId, t.remitoId),
    deLaEmpresa('remitos_items_remito_fk', t.empresaId, t.remitoId, remitos).onDelete('cascade'),
    deLaEmpresa('remitos_items_articulo_fk', t.empresaId, t.articuloId, articulos),
    deLaEmpresa('remitos_items_pedido_item_fk', t.empresaId, t.pedidoItemId, pedidosItems),
  ],
)

/**
 * Cada entrada o salida de stock, con su origen. El stock de un artículo en
 * un depósito es la SUMA de sus movimientos: no hay un saldo guardado que se
 * pueda desfasar.
 */
export const movimientosStock = pgTable(
  'movimientos_stock',
  {
    id: id(),
    empresaId: empresaId(),
    fecha: timestamp('fecha', { withTimezone: true }).notNull().defaultNow(),
    articuloId: uuid('articulo_id').notNull(),
    depositoId: uuid('deposito_id').notNull(),
    /** Positiva entra, negativa sale. */
    cantidad: cantidad('cantidad').notNull(),
    /** inicial | ajuste | transferencia | remito | anulacion_remito | compra */
    tipo: text('tipo').notNull(),
    origenId: uuid('origen_id'),
    observacion: text('observacion'),
    usuarioId: uuid('usuario_id'),
  },
  (t) => [
    index().on(t.empresaId, t.articuloId, t.depositoId),
    index().on(t.empresaId, t.fecha),
    deLaEmpresa('movimientos_stock_articulo_fk', t.empresaId, t.articuloId, articulos),
    deLaEmpresa('movimientos_stock_deposito_fk', t.empresaId, t.depositoId, depositos),
  ],
)
