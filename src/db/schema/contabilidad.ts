import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
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

import { empresaId, id, importe, marcasDeTiempo } from './comunes'

/**
 * Etapa 7: contabilidad. Los asientos se generan solos desde las
 * operaciones (facturas, compras, cobranzas, pagos, tesorería): cada
 * operación tiene a lo sumo un asiento vigente y, si se anula, se le hace
 * el contraasiento. Los asientos manuales son para lo que no sale de una
 * operación (amortizaciones, sueldos, ajustes del contador).
 */

const deLaEmpresa = (
  nombre: string,
  empresa: Parameters<typeof foreignKey>[0]['columns'][0],
  columna: Parameters<typeof foreignKey>[0]['columns'][0],
  destino: { empresaId: Parameters<typeof foreignKey>[0]['columns'][0]; id: Parameters<typeof foreignKey>[0]['columns'][0] },
) => foreignKey({ name: nombre, columns: [empresa, columna], foreignColumns: [destino.empresaId, destino.id] })

/** Configuración contable: desde cuándo se contabiliza solo y hasta qué fecha está cerrado. */
export const configuracionContable = pgTable(
  'configuracion_contable',
  {
    id: id(),
    empresaId: empresaId(),
    /** Las operaciones desde esta fecha se contabilizan solas (lo anterior entra con el asiento de apertura). */
    inicio: date('inicio').notNull(),
    /** No se registran ni anulan asientos con fecha hasta acá (inclusive). */
    cerradoHasta: date('cerrado_hasta'),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex('configuracion_contable_empresa').on(t.empresaId)],
)

/** Plan de cuentas. Las no imputables agrupan (rubros); los asientos van a las imputables. */
export const cuentasContables = pgTable(
  'cuentas_contables',
  {
    id: id(),
    empresaId: empresaId(),
    /** "1.1.01.02": el nivel sale de los puntos y el rubro, del prefijo. */
    codigo: text('codigo').notNull(),
    nombre: text('nombre').notNull(),
    /** activo | pasivo | patrimonio | ingreso | egreso */
    tipo: text('tipo').notNull(),
    imputable: boolean('imputable').notNull().default(true),
    activa: boolean('activa').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('cuentas_contables_codigo').on(t.empresaId, t.codigo),
    unique('cuentas_contables_empresa_id').on(t.empresaId, t.id),
    check('cuentas_contables_tipo', sql`${t.tipo} in ('activo', 'pasivo', 'patrimonio', 'ingreso', 'egreso')`),
    check('cuentas_contables_codigo_valido', sql`${t.codigo} ~ '^[0-9]+(\\.[0-9]+)*$'`),
  ],
)

/**
 * Qué cuenta usa cada asiento automático: claves fijas ("deudores",
 * "iva_debito"…) y por objeto ("tesoreria:<id>" para cada caja o banco,
 * "proveedor:<id>" para la cuenta de gasto habitual de un proveedor,
 * "concepto:<texto>" para los movimientos de tesorería).
 */
export const imputacionesContables = pgTable(
  'imputaciones_contables',
  {
    id: id(),
    empresaId: empresaId(),
    clave: text('clave').notNull(),
    cuentaId: uuid('cuenta_id').notNull(),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('imputaciones_contables_clave').on(t.empresaId, t.clave),
    deLaEmpresa('imputaciones_contables_cuenta_fk', t.empresaId, t.cuentaId, cuentasContables),
  ],
)

export const ejercicios = pgTable(
  'ejercicios',
  {
    id: id(),
    empresaId: empresaId(),
    inicio: date('inicio').notNull(),
    fin: date('fin').notNull(),
    /** abierto | cerrado */
    estado: text('estado').notNull().default('abierto'),
    cerrado: timestamp('cerrado', { withTimezone: true }),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('ejercicios_inicio').on(t.empresaId, t.inicio),
    unique('ejercicios_empresa_id').on(t.empresaId, t.id),
    check('ejercicios_fechas', sql`${t.fin} > ${t.inicio}`),
    check('ejercicios_estado', sql`${t.estado} in ('abierto', 'cerrado')`),
  ],
)

export const asientos = pgTable(
  'asientos',
  {
    id: id(),
    empresaId: empresaId(),
    numero: integer('numero').notNull(),
    fecha: date('fecha').notNull(),
    concepto: text('concepto').notNull(),
    /**
     * manual | venta | compra | cobranza | pago | cheque_propio | tesoreria |
     * cheque_rechazado | liquidacion_iva | refundicion | apertura
     */
    origen: text('origen').notNull().default('manual'),
    /** La operación que lo generó (factura, compra, recibo…). */
    origenId: uuid('origen_id'),
    automatico: boolean('automatico').notNull().default(false),
    /** registrado | anulado */
    estado: text('estado').notNull().default('registrado'),
    /** El contraasiento de qué asiento (al anularse la operación). */
    revierteId: uuid('revierte_id'),
    usuarioId: uuid('usuario_id'),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('asientos_numero').on(t.empresaId, t.numero),
    // Una operación tiene un solo asiento vigente (y, si se anuló, un solo contraasiento).
    uniqueIndex('asientos_origen')
      .on(t.empresaId, t.origen, t.origenId, sql`(${t.revierteId} is not null)`)
      .where(sql`${t.origenId} is not null and ${t.estado} = 'registrado'`),
    index().on(t.empresaId, t.fecha),
    unique('asientos_empresa_id').on(t.empresaId, t.id),
    check('asientos_estado', sql`${t.estado} in ('registrado', 'anulado')`),
    check(
      'asientos_origen_valido',
      sql`${t.origen} in ('manual', 'venta', 'compra', 'cobranza', 'pago', 'cheque_propio', 'tesoreria', 'cheque_rechazado', 'liquidacion_iva', 'refundicion', 'apertura')`,
    ),
  ],
)

export const asientosLineas = pgTable(
  'asientos_lineas',
  {
    id: id(),
    empresaId: empresaId(),
    asientoId: uuid('asiento_id').notNull(),
    orden: smallint('orden').notNull(),
    cuentaId: uuid('cuenta_id').notNull(),
    debe: importe('debe').notNull().default('0'),
    haber: importe('haber').notNull().default('0'),
    detalle: text('detalle'),
    /** Cliente o proveedor (para el mayor por tercero). */
    terceroId: uuid('tercero_id'),
  },
  (t) => [
    index().on(t.empresaId, t.asientoId),
    index().on(t.empresaId, t.cuentaId),
    check('asientos_lineas_un_lado', sql`(${t.debe} = 0) <> (${t.haber} = 0) and ${t.debe} >= 0 and ${t.haber} >= 0`),
    deLaEmpresa('asientos_lineas_asiento_fk', t.empresaId, t.asientoId, asientos).onDelete('cascade'),
    deLaEmpresa('asientos_lineas_cuenta_fk', t.empresaId, t.cuentaId, cuentasContables),
  ],
)
