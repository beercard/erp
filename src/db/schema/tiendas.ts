import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { pedidos } from './comercial'
import { empresaId, id, marcasDeTiempo } from './comunes'
import { articulos, depositos, listasPrecios } from './maestros'
import { empresas } from './plataforma'

/**
 * Tiendas online (aplicación "Tienda online y MercadoLibre" del plan): cada
 * canal es una cuenta de Mercado Libre, una tienda de Tienda Nube o una de
 * WooCommerce. El ERP les manda stock y precios y trae los pedidos.
 */

const deLaEmpresa = (
  nombre: string,
  empresa: Parameters<typeof foreignKey>[0]['columns'][0],
  columna: Parameters<typeof foreignKey>[0]['columns'][0],
  destino: { empresaId: Parameters<typeof foreignKey>[0]['columns'][0]; id: Parameters<typeof foreignKey>[0]['columns'][0] },
) => foreignKey({ name: nombre, columns: [empresa, columna], foreignColumns: [destino.empresaId, destino.id] })

export const canalesVenta = pgTable(
  'canales_venta',
  {
    id: id(),
    empresaId: empresaId(),
    /** mercadolibre | tiendanube | woocommerce */
    tipo: text('tipo').notNull(),
    nombre: text('nombre').notNull(),
    /** Cuenta en la plataforma: usuario de Mercado Libre, tienda de Tienda Nube o dirección de WooCommerce. */
    cuenta: text('cuenta').notNull(),
    /** conectado | desconectado | error */
    estado: text('estado').notNull().default('conectado'),
    /** Credenciales (tokens o claves) cifradas con ERP_CLAVE_MAESTRA. */
    credenciales: text('credenciales').notNull(),
    /** Secreto con que la tienda firma sus avisos (WooCommerce), cifrado. */
    secretoAvisos: text('secreto_avisos'),
    /** De qué lista salen los precios publicados; sin lista, no se mandan precios. */
    listaPreciosId: uuid('lista_precios_id'),
    /** De qué depósito sale el stock publicado; sin depósito, la suma de todos. */
    depositoId: uuid('deposito_id'),
    enviarStock: boolean('enviar_stock').notNull().default(true),
    enviarPrecios: boolean('enviar_precios').notNull().default(false),
    traerPedidos: boolean('traer_pedidos').notNull().default(true),
    /** Hasta dónde se trajeron pedidos (la próxima vuelta pide desde acá, con margen). */
    pedidosHasta: timestamp('pedidos_hasta', { withTimezone: true }),
    ultimaSincronizacion: timestamp('ultima_sincronizacion', { withTimezone: true }),
    ultimoError: text('ultimo_error'),
    ...marcasDeTiempo(),
  },
  (t) => [
    unique('canales_venta_empresa_id').on(t.empresaId, t.id),
    uniqueIndex('canales_venta_cuenta').on(t.empresaId, t.tipo, t.cuenta),
    check('canales_venta_tipo', sql`${t.tipo} in ('mercadolibre', 'tiendanube', 'woocommerce')`),
    check('canales_venta_estado', sql`${t.estado} in ('conectado', 'desconectado', 'error')`),
    deLaEmpresa('canales_venta_lista_fk', t.empresaId, t.listaPreciosId, listasPrecios),
    deLaEmpresa('canales_venta_deposito_fk', t.empresaId, t.depositoId, depositos),
  ],
)

/**
 * Para los avisos de las plataformas, que llegan sin sesión: de qué empresa
 * es cada cuenta. Es de plataforma (sin RLS) y solo guarda el vínculo, ningún
 * dato del negocio. Una cuenta se conecta a una sola empresa.
 */
export const cuentasCanal = pgTable(
  'cuentas_canal',
  {
    tipo: text('tipo').notNull(),
    cuenta: text('cuenta').notNull(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresas.id),
    canalId: uuid('canal_id').notNull().unique(),
  },
  (t) => [uniqueIndex('cuentas_canal_cuenta').on(t.tipo, t.cuenta)],
)

/** Cada publicación (o variante) de la tienda y a qué artículo del ERP corresponde. */
export const publicacionesCanal = pgTable(
  'publicaciones_canal',
  {
    id: id(),
    empresaId: empresaId(),
    canalId: uuid('canal_id').notNull(),
    externoId: text('externo_id').notNull(),
    /** Variante dentro de la publicación; vacío si no tiene. */
    varianteId: text('variante_id').notNull().default(''),
    sku: text('sku'),
    titulo: text('titulo').notNull(),
    enlace: text('enlace'),
    /** Nulo: sin vincular (no se le manda nada; sus ventas entran sin artículo). */
    articuloId: uuid('articulo_id'),
    /** Lo último que se le mandó, para mandar solo cuando cambia. */
    stockEnviado: numeric('stock_enviado', { precision: 18, scale: 4 }),
    precioEnviado: numeric('precio_enviado', { precision: 18, scale: 2 }),
    enviadoEn: timestamp('enviado_en', { withTimezone: true }),
    error: text('error'),
    activa: boolean('activa').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('publicaciones_canal_clave').on(t.empresaId, t.canalId, t.externoId, t.varianteId),
    index().on(t.empresaId, t.articuloId),
    deLaEmpresa('publicaciones_canal_canal_fk', t.empresaId, t.canalId, canalesVenta).onDelete('cascade'),
    deLaEmpresa('publicaciones_canal_articulo_fk', t.empresaId, t.articuloId, articulos),
  ],
)

/** Pedidos que llegaron de cada canal: el registro de qué se importó, qué falló y por qué. */
export const pedidosCanal = pgTable(
  'pedidos_canal',
  {
    id: id(),
    empresaId: empresaId(),
    canalId: uuid('canal_id').notNull(),
    externoId: text('externo_id').notNull(),
    numero: text('numero'),
    /** importado | error | ignorado */
    estado: text('estado').notNull(),
    pedidoId: uuid('pedido_id'),
    comprador: text('comprador'),
    total: numeric('total', { precision: 18, scale: 2 }),
    fecha: timestamp('fecha', { withTimezone: true }),
    detalle: text('detalle'),
    datos: jsonb('datos'),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('pedidos_canal_clave').on(t.empresaId, t.canalId, t.externoId),
    index().on(t.empresaId, t.canalId, t.creado),
    check('pedidos_canal_estado', sql`${t.estado} in ('importado', 'error', 'ignorado')`),
    deLaEmpresa('pedidos_canal_canal_fk', t.empresaId, t.canalId, canalesVenta).onDelete('cascade'),
    deLaEmpresa('pedidos_canal_pedido_fk', t.empresaId, t.pedidoId, pedidos),
  ],
)
