import type { NextConfig } from 'next'

const dev = process.env.NODE_ENV === 'development'

/**
 * Política de contenido. Sin nonces (obligarían a render dinámico en todo el
 * sitio): React ya escapa todo y los únicos HTML inyectados son el JSON-LD
 * (escapado) y el QR de la factura (SVG generado). form-action admite https
 * porque conectar Mercado Libre, Tienda Nube, WooCommerce o pagar con
 * Mercado Pago redirige a esas plataformas.
 */
const csp = [
  "default-src 'self'",
  // Cloudflare Turnstile (desafío antibots de los formularios públicos).
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''} https://challenges.cloudflare.com`,
  'frame-src https://challenges.cloudflare.com',
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self'",
  `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  // En desarrollo, los subdominios de prueba van por http.
  `form-action 'self' https:${dev ? ' http:' : ''}`,
  "frame-ancestors 'none'",
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ')

const nextConfig: NextConfig = {
  // PGlite carga su WebAssembly con new URL(..., import.meta.url): empaquetado
  // por Next se rompe, así que se usa desde node_modules tal cual.
  serverExternalPackages: ['@electric-sql/pglite'],
  // Las acciones del servidor solo se aceptan desde el mismo origen (por
  // defecto en Next); no se agregan orígenes extra.
  poweredByHeader: false,
  // Solo en desarrollo: hosts extra para probar los subdominios de empresas
  // (por ejemplo DEV_ORIGENES=erp.prueba,*.erp.prueba).
  allowedDevOrigins: process.env.DEV_ORIGENES?.split(',').filter(Boolean),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          // Solo en producción: en desarrollo es http://localhost.
          ...(dev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // El técnico usa la ubicación y la cámara del celular; nada más.
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self), microphone=(), payment=(), usb=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
