/** Medios de pago a proveedores (sin dependencias de servidor: lo usan las pantallas). */
export const MEDIOS_PAGO = {
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  cheque_propio: 'Cheque propio',
  echeq_propio: 'ECHEQ propio',
  cheque_tercero: 'Cheque de terceros',
  tarjeta: 'Tarjeta de la empresa',
  otro: 'Otro',
} as const

export type MedioPago = keyof typeof MEDIOS_PAGO
