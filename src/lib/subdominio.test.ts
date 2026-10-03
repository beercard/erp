import { afterEach, describe, expect, it } from 'vitest'

import { codigoDelHost, esDominioBase, sugerirCodigo, urlDeEmpresa, validarCodigo } from './subdominio'

const BASE = 'erp.vektra.digital'

describe('Subdominios por empresa', () => {
  afterEach(() => {
    delete process.env.DOMINIO_EMPRESAS
  })

  it('saca el código del host solo si es un subdominio directo del dominio base', () => {
    expect(codigoDelHost('komsa.erp.vektra.digital', BASE)).toBe('komsa')
    expect(codigoDelHost('KOMSA.erp.vektra.digital:443', BASE)).toBe('komsa')
    expect(codigoDelHost('erp.vektra.digital', BASE)).toBeNull()
    expect(codigoDelHost('a.b.erp.vektra.digital', BASE)).toBeNull()
    expect(codigoDelHost('komsa.erp.vektra.digital.otro.com', BASE)).toBeNull()
    expect(codigoDelHost('xn--a.erp.vektra.digital', BASE)).toBeNull()
    expect(codigoDelHost('komsa.erp.vektra.digital', null)).toBeNull()
    expect(esDominioBase('erp.vektra.digital', BASE)).toBe(true)
    expect(esDominioBase('komsa.erp.vektra.digital', BASE)).toBe(false)
  })

  it('valida y propone códigos', () => {
    expect(validarCodigo(' Komsa ')).toEqual({ ok: true, codigo: 'komsa' })
    expect(validarCodigo('-komsa')).toMatchObject({ ok: false })
    expect(validarCodigo('kom sa')).toMatchObject({ ok: false })
    expect(validarCodigo('www')).toMatchObject({ ok: false, error: expect.stringContaining('reservado') })
    expect(sugerirCodigo('Estudio García S.R.L.')).toBe('estudio-garcia')
    expect(sugerirCodigo('KOMSA S.A.')).toBe('komsa')
    expect(sugerirCodigo('Komsa')).toBe('komsa')
    expect(sugerirCodigo('Ñandú & Cía')).toBe('nandu-cia')
    expect(sugerirCodigo('Admin')).toBe('admin-empresa')
    expect(sugerirCodigo('***')).toBe('empresa')
  })

  it('arma la dirección de la empresa con el protocolo de APP_URL', () => {
    process.env.APP_URL = 'https://erp.vektra.digital'
    expect(urlDeEmpresa('komsa', '/ingresar', BASE)).toBe('https://komsa.erp.vektra.digital/ingresar')
    expect(urlDeEmpresa('komsa', '/', null)).toBe('https://erp.vektra.digital/')
  })
})
