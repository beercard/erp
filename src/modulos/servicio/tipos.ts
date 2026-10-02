/** Textos y reglas del servicio técnico (los usan también las pantallas del navegador). */

/** Clases de orden (cada tipo de orden pertenece a una). */
export const TIPOS_ORDEN = {
  correctivo: 'Correctivo (falla)',
  preventivo: 'Preventivo',
  instalacion: 'Instalación',
  retiro: 'Retiro',
  insumos: 'Entrega de insumos',
} as const

/** Estados como en Persat. */
export const ESTADOS_ORDEN = {
  pendiente: 'Pendiente',
  proyectada: 'Proyectada',
  asignada: 'Asignada',
  informe: 'Informe para revisar',
  vencida: 'Vencida',
  cerrada_ok: 'Cerrada OK',
  cerrada_desvio: 'Cerrada con desvío',
  cerrada_no_cumplida: 'No cumplida',
  cancelada: 'Cancelada',
} as const

/** Qué quiere decir cada estado (para la ayuda de las pantallas). */
export const AYUDA_ESTADOS: Record<EstadoOrden, string> = {
  pendiente: 'Sin día de visita.',
  proyectada: 'Con día de visita, sin técnico.',
  asignada: 'Con día de visita y técnico.',
  informe: 'El técnico la completó; falta que la revise el supervisor.',
  vencida: 'Pasó el plazo y el técnico no la informó.',
  cerrada_ok: 'Hecha sin pendientes.',
  cerrada_desvio: 'Hecha, con algo pendiente o para aclarar.',
  cerrada_no_cumplida: 'No se hizo.',
  cancelada: 'Se dio de baja sin hacerse.',
}

export const CIERRES = { ok: 'OK', desvio: 'Con desvío', no_cumplida: 'No cumplida' } as const

/** Frecuencias de las reglas de preventivo. */
export const FRECUENCIAS = { semanal: 'Cada N semanas', mensual: 'Cada N meses', copias: 'Cada N copias' } as const

export const COBERTURAS = {
  contrato: 'Cubierta por el contrato',
  garantia: 'En garantía',
  cargo: 'Con cargo al cliente',
} as const

export type TipoOrden = keyof typeof TIPOS_ORDEN
export type EstadoOrden = keyof typeof ESTADOS_ORDEN
export type Cierre = keyof typeof CIERRES
export type Cobertura = keyof typeof COBERTURAS

export const ABIERTAS: EstadoOrden[] = ['pendiente', 'proyectada', 'asignada', 'vencida']
export const CERRADAS: EstadoOrden[] = ['cerrada_ok', 'cerrada_desvio', 'cerrada_no_cumplida']

/** Todavía no se hizo: se planifica y el técnico la puede informar. */
export const estaAbierta = (estado: string) => ABIERTAS.includes(estado as EstadoOrden)
/** Se le pueden cargar visitas e insumos: abierta, o en informe mientras el supervisor la revisa. */
export const seTrabaja = (estado: string) => estaAbierta(estado) || estado === 'informe'
export const estaCerrada = (estado: string) => CERRADAS.includes(estado as EstadoOrden)
/** Hecha (se factura si es con cargo). */
export const estaHecha = (estado: string) => estado === 'cerrada_ok' || estado === 'cerrada_desvio'

/**
 * Estado según la planificación, como en el calendario de Persat: sin día es
 * pendiente, con día y sin técnico es proyectada, con los dos es asignada.
 */
export function estadoPlanificado(o: { programada: string | null; tecnicoId: string | null }): EstadoOrden {
  if (!o.programada) return 'pendiente'
  return o.tecnicoId ? 'asignada' : 'proyectada'
}

/**
 * Momento en que vence una orden asignada: la hora programada (o el fin del
 * día, si no tiene hora) más el plazo del tipo. Horario de Argentina (UTC−3).
 */
export function vencimiento(programada: string | null, hora: string | null, plazoHoras: number): Date | null {
  if (!programada) return null
  const inicio = new Date(`${programada}T${hora ?? '23:59'}:00-03:00`)
  return new Date(inicio.getTime() + plazoHoras * 3_600_000)
}

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

/** Minutos desde las 00:00 de "HH:MM". */
export const aMinutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5))
export const aHora = (minutos: number) =>
  `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
