import type { MetadataRoute } from 'next'

/** Aplicación instalable para el técnico (abre en Mi agenda y funciona sin señal). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ERP · Servicio técnico',
    short_name: 'Técnico',
    description: 'Agenda y órdenes de servicio técnico, también sin señal.',
    start_url: '/tecnico',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#0f766e',
    lang: 'es-AR',
    icons: [{ src: '/icono-tecnico.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
