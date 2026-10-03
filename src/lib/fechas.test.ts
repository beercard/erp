import { describe, expect, it } from 'vitest'
import { fechaCorta, hoyArgentina, sumarDias } from './fechas'

describe('hoyArgentina', () => {
  it('después de las 21 h argentinas, aunque UTC ya sea el día siguiente, sigue siendo el mismo día', () => {
    // 02:30 UTC del 2 = 23:30 del 1 en Argentina (UTC-3).
    expect(hoyArgentina(new Date('2026-10-02T02:30:00Z'))).toBe('2026-10-01')
  })

  it('a las 00:00 argentinas (03:00 UTC) cambia el día', () => {
    expect(hoyArgentina(new Date('2026-10-02T03:00:00Z'))).toBe('2026-10-02')
  })

  it('un segundo antes de la medianoche argentina todavía es el día anterior', () => {
    expect(hoyArgentina(new Date('2026-10-02T02:59:59Z'))).toBe('2026-10-01')
  })

  it('el último minuto del año en UTC sigue siendo 31/12 en Argentina', () => {
    expect(hoyArgentina(new Date('2026-12-31T23:59:00Z'))).toBe('2026-12-31')
  })

  it('el primer instante del año en UTC todavía es 31/12 en Argentina hasta las 03:00 UTC', () => {
    expect(hoyArgentina(new Date('2027-01-01T02:59:59Z'))).toBe('2026-12-31')
    expect(hoyArgentina(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01-01')
  })

  it('al mediodía UTC coincide con el día de UTC', () => {
    expect(hoyArgentina(new Date('2026-10-01T12:00:00Z'))).toBe('2026-10-01')
  })

  it('devuelve siempre el formato AAAA-MM-DD con ceros', () => {
    expect(hoyArgentina(new Date('2026-03-05T15:00:00Z'))).toBe('2026-03-05')
  })

  it('sin argumento devuelve una fecha ISO válida', () => {
    expect(hoyArgentina()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('fechaCorta', () => {
  it('pasa de ISO a día/mes/año', () => {
    expect(fechaCorta('2026-10-01')).toBe('01/10/2026')
  })

  it('ignora la parte horaria de un ISO completo', () => {
    expect(fechaCorta('2026-12-31T23:59:00Z')).toBe('31/12/2026')
  })
})

describe('sumarDias', () => {
  it('cruza el fin de mes', () => {
    expect(sumarDias('2026-01-31', 1)).toBe('2026-02-01')
    expect(sumarDias('2026-09-30', 1)).toBe('2026-10-01')
  })

  it('cruza el fin de año', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(sumarDias('2026-12-15', 30)).toBe('2027-01-14')
  })

  it('respeta el 29 de febrero de un año bisiesto y no existe en uno común', () => {
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29')
    expect(sumarDias('2027-02-28', 1)).toBe('2027-03-01')
  })

  it('con días negativos retrocede, incluso cruzando de año', () => {
    expect(sumarDias('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('con cero días devuelve la misma fecha', () => {
    expect(sumarDias('2026-10-01', 0)).toBe('2026-10-01')
  })
})
