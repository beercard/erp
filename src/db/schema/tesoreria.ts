import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { monedas } from './catalogos'
import { empresaId, id, importe, marcasDeTiempo } from './comunes'

/**
 * Etapa 4: tesorería.
 *
 * Reglas de diseño:
 * - Cada caja, cuenta bancaria, billetera (Mercado Pago) o "tarjetas a
 *   acreditar" es una cuenta de tesorería con su moneda.
 * - El saldo de una cuenta no se guarda: sale de los valores de los recibos
 *   y pagos emitidos que entraron o salieron por ella, más los movimientos de
 *   tesorería (gastos, ingresos, transferencias, depósitos de cheques,
 *   acreditaciones, ajustes de arqueo). Anular un recibo o un pago lo saca solo.
 * - Un cheque propio debita el banco en su fecha de pago.
 * - Los movimientos no se borran ni se editan: se anulan.
 */

const deLaEmpresa = (
  nombre: string,
  empresa: Parameters<typeof foreignKey>[0]['columns'][0],
  columna: Parameters<typeof foreignKey>[0]['columns'][0],
  destino: { empresaId: Parameters<typeof foreignKey>[0]['columns'][0]; id: Parameters<typeof foreignKey>[0]['columns'][0] },
) => foreignKey({ name: nombre, columns: [empresa, columna], foreignColumns: [destino.empresaId, destino.id] })

export const cuentasTesoreria = pgTable(
  'cuentas_tesoreria',
  {
    id: id(),
    empresaId: empresaId(),
    codigo: text('codigo').notNull(),
    nombre: text('nombre').notNull(),
    /**
     * caja | banco | billetera (Mercado Pago) | cupones (cobros con tarjeta a
     * acreditar) | tarjeta (tarjeta de crédito de la empresa: saldo negativo es
     * deuda) | inversion (fondos comunes, plazos fijos)
     */
    tipo: text('tipo').notNull(),
    moneda: text('moneda')
      .notNull()
      .default('PES')
      .references(() => monedas.codigo),
    banco: text('banco'),
    numeroCuenta: text('numero_cuenta'),
    cbu: text('cbu'),
    /** Medios de cobro y pago que entran o salen por esta cuenta si no se elige otra. */
    mediosPredeterminados: text('medios_predeterminados')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    activa: boolean('activa').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.codigo),
    unique('cuentas_tesoreria_empresa_id').on(t.empresaId, t.id),
    check('cuentas_tesoreria_tipo', sql`${t.tipo} in ('caja', 'banco', 'billetera', 'cupones', 'tarjeta', 'inversion')`),
  ],
)

/**
 * Movimientos que no vienen de un recibo ni de un pago. Una transferencia
 * entre cuentas son dos movimientos con el mismo transferencia_id.
 */
export const movimientosTesoreria = pgTable(
  'movimientos_tesoreria',
  {
    id: id(),
    empresaId: empresaId(),
    cuentaId: uuid('cuenta_id').notNull(),
    fecha: date('fecha').notNull(),
    /** Positivo entra, negativo sale (en la moneda de la cuenta). */
    importe: importe('importe').notNull(),
    /**
     * saldo_inicial | ingreso | egreso | transferencia | deposito_cheque |
     * rechazo_cheque | acreditacion | comision | ajuste_arqueo
     */
    tipo: text('tipo').notNull(),
    /** Para qué fue (gastos bancarios, retiro, sueldos…): agrupa los informes. */
    concepto: text('concepto'),
    detalle: text('detalle'),
    /** Número de operación o de comprobante. */
    comprobante: text('comprobante'),
    transferenciaId: uuid('transferencia_id'),
    /** El cheque de terceros depositado o rechazado (recibos_valores). */
    chequeId: uuid('cheque_id'),
    /** vigente | anulado */
    estado: text('estado').notNull().default('vigente'),
    usuarioId: uuid('usuario_id'),
    anulado: timestamp('anulado', { withTimezone: true }),
    anuladoPor: uuid('anulado_por'),
    ...marcasDeTiempo(),
  },
  (t) => [
    index().on(t.empresaId, t.cuentaId, t.fecha),
    index().on(t.empresaId, t.chequeId),
    unique('movimientos_tesoreria_empresa_id').on(t.empresaId, t.id),
    check(
      'movimientos_tesoreria_tipo',
      sql`${t.tipo} in ('saldo_inicial', 'ingreso', 'egreso', 'transferencia', 'deposito_cheque', 'rechazo_cheque', 'acreditacion', 'comision', 'ajuste_arqueo')`,
    ),
    check('movimientos_tesoreria_estado', sql`${t.estado} in ('vigente', 'anulado')`),
    check('movimientos_tesoreria_no_cero', sql`${t.importe} <> 0`),
    deLaEmpresa('movimientos_tesoreria_cuenta_fk', t.empresaId, t.cuentaId, cuentasTesoreria),
  ],
)

/** Cheque de terceros rechazado: vuelve la deuda del cliente (y la del proveedor si se le había entregado). */
export const chequesRechazados = pgTable(
  'cheques_rechazados',
  {
    id: id(),
    empresaId: empresaId(),
    /** recibos_valores.id */
    chequeId: uuid('cheque_id').notNull(),
    fecha: date('fecha').notNull(),
    motivo: text('motivo'),
    /** Gastos que cobró el banco. */
    gastos: importe('gastos').notNull().default('0'),
    /** Nota de débito interna al cliente (comprobantes). */
    notaDebitoClienteId: uuid('nota_debito_cliente_id'),
    /** Nota de débito interna del proveedor al que se le había entregado (compras). */
    notaDebitoProveedorId: uuid('nota_debito_proveedor_id'),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.chequeId)],
)

/** Arqueo: lo contado contra lo que dice el sistema. Si no coincide, se ajusta. */
export const arqueos = pgTable(
  'arqueos',
  {
    id: id(),
    empresaId: empresaId(),
    cuentaId: uuid('cuenta_id').notNull(),
    fecha: date('fecha').notNull(),
    saldoSistema: importe('saldo_sistema').notNull(),
    contado: importe('contado').notNull(),
    diferencia: importe('diferencia').notNull(),
    movimientoAjusteId: uuid('movimiento_ajuste_id'),
    observaciones: text('observaciones'),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.empresaId, t.cuentaId, t.fecha),
    deLaEmpresa('arqueos_cuenta_fk', t.empresaId, t.cuentaId, cuentasTesoreria),
  ],
)

/**
 * Cierre de caja de un turno o del día: lo que entró y salió de la caja
 * desde el cierre anterior, el efectivo esperado contra el contado, la
 * diferencia y un resumen de las cobranzas del período (por medio y por
 * cajero). La diferencia queda como arqueo con su ajuste.
 */
export const cierresCaja = pgTable(
  'cierres_caja',
  {
    id: id(),
    empresaId: empresaId(),
    cuentaId: uuid('cuenta_id').notNull(),
    desde: timestamp('desde', { withTimezone: true }).notNull(),
    hasta: timestamp('hasta', { withTimezone: true }).notNull(),
    saldoInicial: importe('saldo_inicial').notNull(),
    ingresos: importe('ingresos').notNull(),
    egresos: importe('egresos').notNull(),
    esperado: importe('esperado').notNull(),
    contado: importe('contado').notNull(),
    diferencia: importe('diferencia').notNull(),
    /** Conteo por billete y moneda, si se hizo. */
    conteo: jsonb('conteo').$type<Record<string, number>>(),
    /** Cobranzas por medio y por cajero, cobros online, ventas y movimientos del período. */
    resumen: jsonb('resumen').$type<Record<string, unknown>>().notNull(),
    arqueoId: uuid('arqueo_id'),
    observaciones: text('observaciones'),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.empresaId, t.cuentaId, t.hasta),
    deLaEmpresa('cierres_caja_cuenta_fk', t.empresaId, t.cuentaId, cuentasTesoreria),
  ],
)

/** Extracto bancario importado para conciliar. */
export const extractos = pgTable(
  'extractos',
  {
    id: id(),
    empresaId: empresaId(),
    cuentaId: uuid('cuenta_id').notNull(),
    archivo: text('archivo'),
    desde: date('desde'),
    hasta: date('hasta'),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('extractos_empresa_id').on(t.empresaId, t.id),
    deLaEmpresa('extractos_cuenta_fk', t.empresaId, t.cuentaId, cuentasTesoreria),
  ],
)

export const extractosLineas = pgTable(
  'extractos_lineas',
  {
    id: id(),
    empresaId: empresaId(),
    extractoId: uuid('extracto_id').notNull(),
    cuentaId: uuid('cuenta_id').notNull(),
    fecha: date('fecha').notNull(),
    descripcion: text('descripcion').notNull(),
    referencia: text('referencia'),
    /** Positivo: crédito del banco (entra); negativo: débito. */
    importe: importe('importe').notNull(),
    saldo: importe('saldo'),
    /** Clave para no importar dos veces la misma línea. */
    huella: text('huella').notNull(),
    orden: integer('orden').notNull(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.cuentaId, t.huella),
    index().on(t.empresaId, t.cuentaId, t.fecha),
    unique('extractos_lineas_empresa_id').on(t.empresaId, t.id),
    deLaEmpresa('extractos_lineas_extracto_fk', t.empresaId, t.extractoId, extractos).onDelete('cascade'),
  ],
)

/**
 * Qué movimiento del sistema corresponde a cada línea del extracto. El
 * movimiento puede ser un valor de recibo, un valor de pago o un movimiento
 * de tesorería. Una línea del banco puede juntar varios del sistema (un
 * depósito de varios cheques).
 */
export const conciliaciones = pgTable(
  'conciliaciones',
  {
    id: id(),
    empresaId: empresaId(),
    lineaId: uuid('linea_id').notNull(),
    /** recibo_valor | pago_valor | movimiento */
    origen: text('origen').notNull(),
    origenId: uuid('origen_id').notNull(),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.origen, t.origenId),
    index().on(t.empresaId, t.lineaId),
    check('conciliaciones_origen', sql`${t.origen} in ('recibo_valor', 'pago_valor', 'movimiento')`),
    deLaEmpresa('conciliaciones_linea_fk', t.empresaId, t.lineaId, extractosLineas).onDelete('cascade'),
  ],
)
