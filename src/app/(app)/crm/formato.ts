import { formatearMonto } from '@/lib/dinero'

/** Pesos sin centavos cuando son cero, para los totales del CRM. */
export const pesosServidor = (v: string | number) => formatearMonto(v, '$').replace(/,00$/, '')

export const TIPOS = {
  llamada: 'Llamada',
  reunion: 'Reunión',
  email: 'Email',
  whatsapp: 'WhatsApp',
  tarea: 'Tarea',
} as const
