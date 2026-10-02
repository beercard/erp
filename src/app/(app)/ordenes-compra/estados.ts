export const ESTADO_ORDEN = {
  pendiente: { texto: 'Pendiente', tono: 'aviso' },
  parcial: { texto: 'Recibida en parte', tono: 'info' },
  recibida: { texto: 'Recibida', tono: 'ok' },
  cancelada: { texto: 'Cancelada', tono: 'neutro' },
} as const
