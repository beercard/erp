/** Eventos de los webhooks (los usa también la pantalla de configuración). */
export const EVENTOS = {
  'orden.creada': 'Se abrió una orden de servicio (también desde el portal, la API o un preventivo)',
  'orden.programada': 'Se programó o reprogramó una orden (día, hora o técnico)',
  'orden.informada': 'El técnico mandó el informe',
  'orden.cerrada': 'Se cerró una orden (OK, con desvío o no cumplida)',
  'orden.cancelada': 'Se canceló una orden',
  'encuesta.respondida': 'Un cliente respondió la encuesta de satisfacción',
  'lectura.registrada': 'Se cargó un contador desde el portal o la API',
} as const
export type Evento = keyof typeof EVENTOS
