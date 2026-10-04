/** Eventos de los webhooks (los usa también la pantalla de configuración). */
export const EVENTOS = {
  'orden.creada': 'Se abrió una orden de servicio (también desde el portal, la API o un preventivo)',
  'orden.programada': 'Se programó o reprogramó una orden (día, hora o técnico)',
  'orden.informada': 'El técnico mandó el informe',
  'orden.cerrada': 'Se cerró una orden (OK, con desvío o no cumplida)',
  'orden.cancelada': 'Se canceló una orden',
  'encuesta.respondida': 'Un cliente respondió la encuesta de satisfacción',
  'lectura.registrada': 'Se cargó un contador desde el portal o la API',
  'formulario.enviado': 'Llegó un formulario suelto a la bandeja de entrada',
  'comprobante.autorizado': 'ARCA autorizó una factura o nota (con su CAE)',
  'comprobante.saldado': 'Una factura o nota de débito quedó sin deuda (por cobranza o nota de crédito)',
  'cobranza.registrada': 'Se emitió un recibo de cobranza (también por un cobro online)',
  'cobranza.anulada': 'Se anuló un recibo de cobranza: la deuda que cancelaba vuelve',
} as const
export type Evento = keyof typeof EVENTOS
