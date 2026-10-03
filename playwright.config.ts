import { defineConfig } from '@playwright/test'

/**
 * Pruebas en navegador de los recorridos clave (facturar, cobrar, cerrar la
 * caja). Levantan su propio servidor con una base nueva y ARCA simulado:
 *
 *   npx playwright test
 *
 * PW_CHROMIUM: ruta a un Chromium ya instalado (si no, el de Playwright).
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${process.env.E2E_PUERTO ?? 3200}`,
    viewport: { width: 1440, height: 900 },
    navigationTimeout: 120_000,
    actionTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: 'bash scripts/e2e-servidor.sh',
    url: `http://localhost:${process.env.E2E_PUERTO ?? 3200}/ingresar`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
