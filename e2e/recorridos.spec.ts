import { expect, type Page, test } from '@playwright/test'

/**
 * Recorridos clave, de punta a punta en el navegador, sobre una base nueva con
 * los datos de demostración y ARCA simulado (scripts/e2e-servidor.sh):
 * facturar, cobrar esa factura en efectivo y cerrar la caja.
 */

const EMAIL = process.env.SEMILLA_EMAIL ?? 'admin@demo.local'
const CLAVE = process.env.SEMILLA_CLAVE ?? 'Prueba-E2E-2026'
const numero = (texto: string) => Number(texto.replace(/[^\d,-]/g, '').replace(',', '.'))

async function ingresar(page: Page) {
  await page.goto('/ingresar')
  await page.fill('input[name=email]', EMAIL)
  await page.fill('input[name=clave]', CLAVE)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/ingresar'))
}

async function elegir(page: Page, combo: ReturnType<Page['getByRole']>, texto: string) {
  await combo.fill(texto)
  await page.locator('[role=option]:visible').first().click()
}

test.describe.configure({ mode: 'serial' })

test('facturar, cobrar en efectivo y cerrar la caja', async ({ page }) => {
  await ingresar(page)

  // La caja (cuenta de tesorería) para el efectivo.
  await page.goto('/tesoreria/cuentas/nueva')
  await page.fill('input[name=codigo]', 'CAJA')
  await page.fill('input[name=nombre]', 'Caja mostrador')
  await page.selectOption('select[name=tipo]', 'caja')
  await page.locator('input[name=medios][value=efectivo]').check()
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await page.waitForURL((u) => !u.pathname.endsWith('/nueva'))

  // Facturar: borrador y autorización.
  await page.goto('/facturas/nueva')
  await elegir(page, page.getByRole('combobox', { name: 'Buscar cliente' }), 'Estudio')
  await elegir(page, page.getByRole('combobox', { name: 'Agregar artículo' }), 'Visita')
  await page.getByRole('button', { name: 'Grabar borrador' }).click()
  await page.waitForURL(/\/facturas\/[0-9a-f-]{36}(\?|$)/)
  await page.getByRole('button', { name: /Autorizar en ARCA/ }).click()
  await expect(page.getByText(/CAE/).first()).toBeVisible()

  // Cobrar la factura en efectivo, aplicada entera.
  await page.goto('/cobranzas/nueva')
  await elegir(page, page.getByRole('combobox', { name: 'Buscar cliente' }), 'Estudio')
  const aplicar = page.getByLabel(/^Importe a aplicar a /).first()
  const saldo = aplicar.locator('xpath=ancestor::tr').locator('td').nth(2)
  const total = numero((await saldo.textContent()) ?? '0')
  expect(total).toBeGreaterThan(0)
  await page.getByLabel('Medio del valor 1').selectOption('efectivo')
  await page.getByLabel('Importe del valor 1').fill(String(total).replace('.', ','))
  await aplicar.fill(String(total).replace('.', ','))
  await page.getByRole('button', { name: 'Emitir recibo' }).click()
  await page.waitForURL(/\/cobranzas\/[0-9a-f-]{36}/)
  await expect(page.getByText(/Recibo/).first()).toBeVisible()

  // Cerrar la caja: el efectivo esperado es lo cobrado.
  await page.goto('/cobranzas/caja')
  await expect(page.getByText('Cobrado por medio de pago')).toBeVisible()
  await page.fill('input[name=contado]', String(total).replace('.', ','))
  await expect(page.getByText('Cuadra ✓')).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar caja' }).click()
  await page.waitForURL(/\/cobranzas\/caja\/[0-9a-f-]{36}/)
  await expect(page.getByText('Caja cerrada.')).toBeVisible()
  const pdf = await page.request.get(page.url().split('?')[0] + '/pdf')
  expect(pdf.headers()['content-type']).toBe('application/pdf')
})
