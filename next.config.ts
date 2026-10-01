import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // PGlite carga su WebAssembly con new URL(..., import.meta.url): empaquetado
  // por Next se rompe, así que se usa desde node_modules tal cual.
  serverExternalPackages: ['@electric-sql/pglite'],
  // Las acciones del servidor solo se aceptan desde el mismo origen (por
  // defecto en Next); no se agregan orígenes extra.
  poweredByHeader: false,
}

export default nextConfig
