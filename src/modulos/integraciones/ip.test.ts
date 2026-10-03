import { describe, expect, it } from 'vitest'

import { ipReservada } from './webhooks'

describe('direcciones internas (SSRF)', () => {
  it('bloquea redes privadas, locales y sus formas IPv6', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.100.1.1',
      '0.0.0.0',
      '::1',
      '::',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::7f00:1',
      '64:ff9b::a00:1',
      'fd00::1',
      'fe80::1',
      'fec0::1',
      '[::1]',
      'no-es-ip',
    ]) {
      expect(ipReservada(ip), ip).toBe(true)
    }
  })
  it('deja pasar direcciones públicas', () => {
    for (const ip of ['8.8.8.8', '200.45.1.1', '2800:3f0:4002:80b::200e', '::ffff:8.8.8.8']) {
      expect(ipReservada(ip), ip).toBe(false)
    }
  })
})
