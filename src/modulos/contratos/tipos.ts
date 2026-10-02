/** Textos del módulo de contratos (los usan también las pantallas del navegador). */

export const MODALIDADES = {
  abono: 'Abono (cargo fijo + copias libres + excedente)',
  excedente: 'Solo excedente (todas las copias)',
  cargo_fijo: 'Solo cargo fijo',
} as const

export const COMERCIALIZACIONES = {
  contrato: 'Contrato por copias',
  venta: 'Vendido (servicio)',
  servicio_tecnico: 'Servicio técnico',
  comodato: 'Comodato',
  leasing: 'Leasing',
  donacion: 'Donación',
} as const

export const ESTADOS_CONTRATO = { activo: 'Activo', suspendido: 'Suspendido', finalizado: 'Finalizado' } as const
