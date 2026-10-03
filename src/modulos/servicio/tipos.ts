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

/**
 * Una orden cerrada en Persat (migrada y cerrada sin que nadie la cierre en el
 * ERP) ya se facturó en el sistema anterior: no se vuelve a facturar.
 */
export const cerradaEnPersat = (o: { origen: string; cerradaPor: string | null }) => o.origen === 'persat' && !o.cerradaPor

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

// ------------------------------------------------------------------ SLA

export type EstadoSla = 'en_termino' | 'por_vencer' | 'vencido' | 'cumplido' | 'incumplido'

export const TEXTO_SLA: Record<EstadoSla, string> = {
  en_termino: 'En término',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  cumplido: 'Cumplido',
  incumplido: 'Fuera de término',
}

/**
 * Situación de un plazo: si ya pasó el hito (llegó, resolvió), si se cumplió;
 * si no, cuánto falta. Por vencer: queda menos de la quinta parte del plazo.
 */
export function situacionPlazo(desde: Date, limite: Date | null, hito: Date | null, ahora = new Date()): EstadoSla | null {
  if (!limite) return null
  if (hito) return hito <= limite ? 'cumplido' : 'incumplido'
  if (ahora > limite) return 'vencido'
  const total = limite.getTime() - desde.getTime()
  return limite.getTime() - ahora.getTime() <= total / 5 ? 'por_vencer' : 'en_termino'
}

/** Respuesta: hasta que el técnico llega. Resolución: hasta que informa (o se cierra). */
export function situacionSla(
  o: {
    creado: Date
    estado: string
    slaRespuesta: Date | null
    slaResolucion: Date | null
    llegada: Date | null
    informada: Date | null
    cerrada: Date | null
  },
  ahora = new Date(),
) {
  if (o.estado === 'cancelada') return { respuesta: null, resolucion: null }
  const resuelta = o.informada ?? o.cerrada
  return {
    // Si se resolvió sin marcar llegada (por teléfono, por ejemplo), la respuesta es la resolución.
    respuesta: situacionPlazo(o.creado, o.slaRespuesta, o.llegada ?? resuelta, ahora),
    resolucion: situacionPlazo(o.creado, o.slaResolucion, resuelta, ahora),
  }
}

/** Límites del SLA de una orden nueva: por prioridad, salvo que el contrato fije los suyos. */
export function limitesSla(
  creado: Date,
  prioridad: string,
  config: { respuestaNormal: number; respuestaUrgente: number; resolucionNormal: number; resolucionUrgente: number },
  contrato?: { slaRespuestaHoras: number | null; slaResolucionHoras: number | null } | null,
) {
  const urgente = prioridad === 'urgente'
  const respuesta = contrato?.slaRespuestaHoras ?? (urgente ? config.respuestaUrgente : config.respuestaNormal)
  const resolucion = contrato?.slaResolucionHoras ?? (urgente ? config.resolucionUrgente : config.resolucionNormal)
  return {
    slaRespuesta: new Date(creado.getTime() + respuesta * 3_600_000),
    slaResolucion: new Date(creado.getTime() + resolucion * 3_600_000),
  }
}
