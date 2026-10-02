import { describe, expect, it } from 'vitest'

import { problemasDeConfiguracion } from './arranque'

const completa = {
  DATABASE_URL: 'postgres://u:c@servidor:5432/erp',
  APP_URL: 'https://erp.ejemplo.com.ar',
  ERP_CLAVE_MAESTRA: 'x'.repeat(48),
  CRON_SECRET: 'y'.repeat(24),
  SMTP_URL: 'smtps://u:c@correo:465',
  CORREO_REMITENTE: 'ERP <avisos@ejemplo.com.ar>',
}

describe('configuración de producción', () => {
  it('completa no tiene problemas', () => {
    expect(problemasDeConfiguracion(completa)).toEqual({ faltan: [], avisos: [] })
  })
  it('dice qué falta o está mal', () => {
    const { faltan } = problemasDeConfiguracion({ APP_URL: 'http://erp.ejemplo.com.ar', ERP_CLAVE_MAESTRA: 'corta' })
    expect(faltan).toHaveLength(4)
    expect(faltan.join(' ')).toMatch(/DATABASE_URL.*https.*ERP_CLAVE_MAESTRA.*CRON_SECRET/)
  })
  it('sin correo avisa pero arranca', () => {
    const { faltan, avisos } = problemasDeConfiguracion({ ...completa, SMTP_URL: '' })
    expect(faltan).toEqual([])
    expect(avisos[0]).toMatch(/SMTP_URL/)
  })
})
