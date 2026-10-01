import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // PGlite arranca un Postgres por archivo: puede tardar unos segundos.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Cada worker carga un Postgres en WASM; con muchos en paralelo Windows
    // se queda sin memoria y mata procesos al azar.
    maxWorkers: 4,
  },
})
