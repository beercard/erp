/**
 * Marca comercial del servicio. Todo el sitio, los correos y los metadatos
 * salen de acá: para cambiar el nombre del producto alcanza con tocar este
 * archivo. Sin datos de contacto inventados: el email y el WhatsApp salen de
 * variables del servidor (si no están, el sitio usa el formulario de contacto).
 */
export const MARCA = {
  producto: 'Vektra ERP',
  corto: 'Vektra',
  empresa: 'Vektra Digital Solutions S.A.S.',
  cuit: '30-71955290-7',
  lema: 'La gestión de tu pyme, en un solo lugar',
  pais: 'Argentina',
} as const

/** Dirección pública del sitio (para canónicas, sitemap y Open Graph). */
export const URL_SITIO = (process.env.SITIO_URL ?? process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

export const contacto = () => ({
  email: process.env.CONTACTO_EMAIL || null,
  /** Número con código de país, solo dígitos (5491100000000). */
  whatsapp: process.env.CONTACTO_WHATSAPP?.replace(/\D/g, '') || null,
})
