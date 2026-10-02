/** Datos de tesorería sin dependencias de servidor (los usan las pantallas). */

export const TIPOS_CUENTA = {
  caja: 'Caja',
  banco: 'Banco',
  billetera: 'Billetera (Mercado Pago)',
  cupones: 'Cupones de tarjeta a acreditar',
  tarjeta: 'Tarjeta de crédito de la empresa',
  inversion: 'Inversión (FCI, plazo fijo)',
} as const

export type TipoCuenta = keyof typeof TIPOS_CUENTA

/** Medios de cobro que entran a una cuenta (los cheques van a la cartera; las retenciones no son fondos). */
export const MEDIOS_COBRO_CON_CUENTA = ['efectivo', 'transferencia', 'tarjeta_credito', 'tarjeta_debito', 'mercado_pago', 'otro']

/** Medios de pago que salen de una cuenta (los cheques de terceros salen de la cartera). */
export const MEDIOS_PAGO_CON_CUENTA = ['efectivo', 'transferencia', 'cheque_propio', 'echeq_propio', 'tarjeta', 'otro']

/** Medios que se pueden asignar por defecto a una cuenta, con su nombre. */
export const MEDIOS_PREDETERMINABLES = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencias',
  mercado_pago: 'Mercado Pago',
  tarjeta_credito: 'Cobros con tarjeta de crédito',
  tarjeta_debito: 'Cobros con tarjeta de débito',
  cheque_propio: 'Cheques propios',
  echeq_propio: 'ECHEQ propios',
  tarjeta: 'Pagos con tarjeta de la empresa',
} as const

export const TIPOS_MOVIMIENTO = {
  saldo_inicial: 'Saldo inicial',
  ingreso: 'Ingreso',
  egreso: 'Egreso',
  transferencia: 'Transferencia',
  deposito_cheque: 'Depósito de cheque',
  rechazo_cheque: 'Cheque rechazado',
  acreditacion: 'Acreditación',
  comision: 'Comisiones y gastos',
  ajuste_arqueo: 'Ajuste de arqueo',
} as const

export const ESTADOS_CHEQUE = {
  cartera: 'En cartera',
  depositado: 'Depositado',
  entregado: 'Entregado a proveedor',
  rechazado: 'Rechazado',
  anulado: 'Anulado (recibo anulado)',
} as const

export type EstadoCheque = keyof typeof ESTADOS_CHEQUE
