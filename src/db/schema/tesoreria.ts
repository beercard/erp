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
    /** Caja que trabaja por turnos: para cobrar o pagar en efectivo tiene que estar abierta. */
    exigeTurno: boolean('exige_turno').notNull().default(false),
    /** Diferencia de cierre que puede aceptar el cajero; más que esto lo cierra un supervisor. */
    diferenciaMaxima: importe('diferencia_maxima'),
    /** A quién se manda el reporte del cierre (correos y celulares). */
    avisoCierre: jsonb('aviso_cierre').$type<{ correos: string[]; telefonos: string[] }>(),
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
     * rechazo_cheque | acreditacion | comision | ajuste_arqueo | canje_cheque |
     * vale | rendicion_vale
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
      sql`${t.tipo} in ('saldo_inicial', 'ingreso', 'egreso', 'transferencia', 'deposito_cheque', 'rechazo_cheque', 'acreditacion', 'comision', 'ajuste_arqueo', 'canje_cheque', 'vale', 'rendicion_vale')`,
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
 * Turno de una caja (sesión, como en un punto de venta): se abre contando el
 * fondo inicial y se cierra con el cierre de caja. Mientras está abierto, los
 * recibos que se cargan quedan en el turno.
 */
export const turnosCaja = pgTable(
  'turnos_caja',
  {
    id: id(),
    empresaId: empresaId(),
    cuentaId: uuid('cuenta_id').notNull(),
    /** abierto | cerrado */
    estado: text('estado').notNull().default('abierto'),
    abierto: timestamp('abierto', { withTimezone: true }).notNull().defaultNow(),
    /** Quien lo abrió (el cajero). */
    usuarioId: uuid('usuario_id'),
    /** Saldo del sistema al abrir y lo que se contó. */
    fondoEsperado: importe('fondo_esperado').notNull(),
    fondoContado: importe('fondo_contado').notNull(),
    conteoApertura: jsonb('conteo_apertura').$type<Record<string, number>>(),
    /** Si el fondo no coincidía, el arqueo con el ajuste. */
    arqueoAperturaId: uuid('arqueo_apertura_id'),
    nota: text('nota'),
    cierreId: uuid('cierre_id'),
    cerrado: timestamp('cerrado', { withTimezone: true }),
    ...marcasDeTiempo(),
  },
  (t) => [
    unique('turnos_caja_empresa_id').on(t.empresaId, t.id),
    index().on(t.empresaId, t.cuentaId, t.abierto),
    uniqueIndex('turnos_caja_uno_abierto')
      .on(t.empresaId, t.cuentaId)
      .where(sql`${t.estado} = 'abierto'`),
    check('turnos_caja_estado', sql`${t.estado} in ('abierto', 'cerrado')`),
    deLaEmpresa('turnos_caja_cuenta_fk', t.empresaId, t.cuentaId, cuentasTesoreria),
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
    /** El turno que cierra (si la caja trabaja por turnos). */
    turnoId: uuid('turno_id'),
    /** Arqueo de los demás medios: lo cobrado según el sistema contra lo que rindió el cajero. */
    medios: jsonb('medios').$type<{ medio: string; nombre: string; esperado: string; contado: string; diferencia: string }[]>(),
    /** Supervisor que aprobó una diferencia mayor a la permitida. */
    aprobadoPor: uuid('aprobado_por'),
    /** Envío del reporte: a quién y cómo salió. */
    envio: jsonb('envio').$type<{ destino: string; via: 'correo' | 'whatsapp'; ok: boolean; error?: string }[]>(),
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

/**
 * Vale a rendir: plata que sale de la caja para una persona (compras chicas,
 * viáticos). Al rendir, se detallan los gastos y vuelve lo que sobró (o se
 * le reintegra lo que puso de más).
 */
export const vales = pgTable(
  'vales',
  {
    id: id(),
    empresaId: empresaId(),
    numero: integer('numero').notNull(),
    cuentaId: uuid('cuenta_id').notNull(),
    /** A quién se le entregó. */
    persona: text('persona').notNull(),
    fecha: date('fecha').notNull(),
    importe: importe('importe').notNull(),
    motivo: text('motivo'),
    /** abierto | rendido | anulado */
    estado: text('estado').notNull().default('abierto'),
    movimientoId: uuid('movimiento_id'),
    /** Gastos rendidos: concepto, importe y comprobante. */
    gastos: jsonb('gastos').$type<{ concepto: string; importe: string; comprobante: string | null }[]>(),
    gastado: importe('gastado'),
    /** Positivo: lo que devolvió; negativo: lo que se le reintegró. */
    devuelto: importe('devuelto'),
    movimientoRendicionId: uuid('movimiento_rendicion_id'),
    fechaRendicion: date('fecha_rendicion'),
    usuarioId: uuid('usuario_id'),
    rendidoPor: uuid('rendido_por'),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.numero),
    index().on(t.empresaId, t.estado),
    check('vales_estado', sql`${t.estado} in ('abierto', 'rendido', 'anulado')`),
    check('vales_positivo', sql`${t.importe} > 0`),
    deLaEmpresa('vales_cuenta_fk', t.empresaId, t.cuentaId, cuentasTesoreria),
  ],
)
