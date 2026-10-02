/** Textos del servicio técnico (los usan también las pantallas del navegador). */

export const TIPOS_ORDEN = {
  correctivo: 'Correctivo (falla)',
  preventivo: 'Preventivo',
  instalacion: 'Instalación',
  retiro: 'Retiro',
  insumos: 'Entrega de insumos',
} as const

export const ESTADOS_ORDEN = {
  pendiente: 'Sin asignar',
  asignada: 'Asignada',
  resuelta: 'Resuelta',
  cancelada: 'Cancelada',
} as const

export const COBERTURAS = {
  contrato: 'Cubierta por el contrato',
  garantia: 'En garantía',
  cargo: 'Con cargo al cliente',
} as const

export type TipoOrden = keyof typeof TIPOS_ORDEN
export type EstadoOrden = keyof typeof ESTADOS_ORDEN
export type Cobertura = keyof typeof COBERTURAS

/** Una orden se trabaja (visitas, insumos) mientras no está resuelta ni cancelada. */
export const estaAbierta = (estado: string) => estado === 'pendiente' || estado === 'asignada'

/**
 * Quién paga, si no se dice otra cosa: el contrato si el equipo está en uno,
 * la garantía si sigue vigente, y si no el cliente.
 */
export function coberturaSugerida(
  equipo: { contratoId: string | null; garantiaHasta: string | null } | null,
  fecha: string,
): Cobertura {
  if (equipo?.contratoId) return 'contrato'
  if (equipo?.garantiaHasta && equipo.garantiaHasta >= fecha) return 'garantia'
  return 'cargo'
}
