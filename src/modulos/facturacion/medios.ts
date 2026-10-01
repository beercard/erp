/** Medios de cobro (y de pago, en la etapa 3). Sin base de datos: lo usan las pantallas. */
export const MEDIOS = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  echeq: 'ECHEQ',
  tarjeta_credito: 'Tarjeta de crédito',
  tarjeta_debito: 'Tarjeta de débito',
  mercado_pago: 'Mercado Pago',
  retencion_iibb: 'Retención de IIBB',
  retencion_ganancias: 'Retención de Ganancias',
  retencion_iva: 'Retención de IVA',
  retencion_suss: 'Retención de SUSS',
  otro: 'Otro',
} as const
