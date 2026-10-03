import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { empresaId, id, marcasDeTiempo } from './comunes'
import { comprobantes } from './facturacion'
import { terceros } from './maestros'
import { empresas, eventosSuscripcion, usuarios } from './plataforma'

/** Un renglón guardado para facturar después (abono, lote). */
export type RenglonGuardado = {
  articuloId?: string | null
  descripcion: string
  cantidad: string
  precioUnitario: string
  descuento?: string
  alicuotaIva: number
}

/**
 * Facturas recurrentes (abonos): la misma factura a un cliente cada mes,
 * bimestre, trimestre, semestre o año. La tarea periódica la arma en la
 * fecha que toca, la autoriza en ARCA y se la manda al cliente si así se
 * eligió. En la descripción, {periodo} se reemplaza por el mes facturado.
 */
export const facturasRecurrentes = pgTable(
  'facturas_recurrentes',
  {
    id: id(),
    empresaId: empresaId(),
    terceroId: uuid('tercero_id')
      .notNull()
      .references(() => terceros.id),
    /** Nombre interno, por ejemplo "Abono mantenimiento". */
    nombre: text('nombre').notNull(),
    /** Meses entre una factura y la siguiente: 1, 2, 3, 6 o 12. */
    cadaMeses: smallint('cada_meses').notNull().default(1),
    /** Próxima fecha de factura. */
    proxima: date('proxima').notNull(),
    /** Última fecha en la que se factura (vacío: sin fin). */
    hasta: date('hasta'),
    puntoVenta: integer('punto_venta').notNull(),
    /** 1 productos, 2 servicios, 3 productos y servicios. */
    concepto: smallint('concepto').notNull().default(2),
    /** Días desde la factura hasta el vencimiento del pago. */
    diasVencimiento: smallint('dias_vencimiento').notNull().default(10),
    renglones: jsonb('renglones').$type<RenglonGuardado[]>().notNull(),
    observaciones: text('observaciones'),
    /** Pedir el CAE solo (si no, queda en borrador para revisar). */
    autorizar: boolean('autorizar').notNull().default(true),
    /** Mandarle la factura al cliente por email. */
    enviar: boolean('enviar').notNull().default(true),
    activa: boolean('activa').notNull().default(true),
    ultimaFacturaId: uuid('ultima_factura_id').references(() => comprobantes.id),
    ultimoError: text('ultimo_error'),
    emitidas: integer('emitidas').notNull().default(0),
    ...marcasDeTiempo(),
  },
  (t) => [
    index().on(t.empresaId, t.activa, t.proxima),
    check('facturas_recurrentes_cada', sql`${t.cadaMeses} in (1, 2, 3, 6, 12)`),
    check('facturas_recurrentes_concepto', sql`${t.concepto} between 1 and 3`),
  ],
)

/**
 * Facturación masiva: una planilla (o un pedido por la API) con muchas
 * facturas. Se arman como borradores y se autorizan de a poco (desde la
 * pantalla o desde la tarea periódica) para no colgar la página ni ARCA.
 */
export const lotesFacturacion = pgTable(
  'lotes_facturacion',
  {
    id: id(),
    empresaId: empresaId(),
    nombre: text('nombre').notNull(),
    /** Las facturas del lote (borradores al principio). */
    comprobantes: uuid('comprobantes')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    autorizar: boolean('autorizar').notNull().default(true),
    enviar: boolean('enviar').notNull().default(true),
    /** preparado | autorizando | terminado */
    estado: text('estado').notNull().default('preparado'),
    /** Errores por comprobante: { [id]: mensaje }. */
    errores: jsonb('errores').$type<Record<string, string>>().notNull().default({}),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    ...marcasDeTiempo(),
  },
  (t) => [
    index().on(t.empresaId, t.estado),
    check('lotes_facturacion_estado', sql`${t.estado} in ('preparado', 'autorizando', 'terminado')`),
  ],
)

/**
 * Facturas de Vektra a sus suscriptores (de plataforma, sin RLS): cada pago
 * registrado de una suscripción deja una fila acá y la tarea periódica emite
 * la factura desde la empresa de Vektra (VEKTRA_EMPRESA_ID) y se la manda.
 */
export const facturasSuscripcion = pgTable(
  'facturas_suscripcion',
  {
    id: id(),
    /** La empresa suscriptora (la que recibe la factura). */
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresas.id),
    eventoId: uuid('evento_id')
      .notNull()
      .references(() => eventosSuscripcion.id),
    /** Importe cobrado, con IVA. */
    importe: numeric('importe', { precision: 18, scale: 2 }).notNull(),
    detalle: text('detalle').notNull(),
    desde: date('desde'),
    hasta: date('hasta'),
    /** pendiente | emitida | error */
    estado: text('estado').notNull().default('pendiente'),
    /** El comprobante en la empresa de Vektra. */
    comprobanteId: uuid('comprobante_id'),
    numero: text('numero'),
    error: text('error'),
    intentos: smallint('intentos').notNull().default(0),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
    actualizado: timestamp('actualizado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex().on(t.eventoId),
    index().on(t.estado),
    check('facturas_suscripcion_estado', sql`${t.estado} in ('pendiente', 'emitida', 'error')`),
  ],
)
