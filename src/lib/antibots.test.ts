import { afterEach, describe, expect, it } from 'vitest'

import { CAMPO_TIEMPO, CAMPO_TRAMPA, controlarEnvio, correoDescartable, generarClave, verificarTurnstile } from './antibots'

const AHORA = 1_800_000_000_000
const formulario = (campos: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}
const cloudflare = (success: boolean) => {
  const pedidos: string[] = []
  const f = (async (_: string, init: RequestInit) => {
    pedidos.push(String(init.body))
    return new Response(JSON.stringify({ success }))
  }) as unknown as typeof fetch
  return { f, pedidos }
}

describe('Antibots', () => {
  afterEach(() => {
    delete process.env.TURNSTILE_SECRET
  })

  it('rechaza la trampa completada y los formularios enviados demasiado rápido', async () => {
    const ok = formulario({ [CAMPO_TIEMPO]: String(AHORA - 10_000) })
    expect(await controlarEnvio(ok, null, AHORA)).toBeNull()
    expect(await controlarEnvio(formulario({ [CAMPO_TIEMPO]: String(AHORA - 10_000), [CAMPO_TRAMPA]: 'x' }), null, AHORA)).toBe(
      'trampa',
    )
    expect(await controlarEnvio(formulario({ [CAMPO_TIEMPO]: String(AHORA - 1_000) }), null, AHORA)).toBe('tiempo')
    expect(await controlarEnvio(formulario({}), null, AHORA)).toBe('tiempo')
  })

  it('con clave secreta exige y verifica el token de Turnstile en el servidor', async () => {
    process.env.TURNSTILE_SECRET = 'secreto'
    const bien = cloudflare(true)
    const fd = formulario({ [CAMPO_TIEMPO]: String(AHORA - 10_000), 'cf-turnstile-response': 'tok' })
    expect(await controlarEnvio(fd, '1.2.3.4', AHORA, bien.f)).toBeNull()
    expect(bien.pedidos[0]).toContain('response=tok')
    expect(bien.pedidos[0]).toContain('remoteip=1.2.3.4')
    expect(await controlarEnvio(fd, null, AHORA, cloudflare(false).f)).toBe('turnstile')
    expect(await verificarTurnstile(null, null, bien.f)).toBe(false)
  })

  it('detecta correos descartables y genera claves fuertes', () => {
    expect(correoDescartable('alguien@mailinator.com')).toBe(true)
    expect(correoDescartable('alguien@sub.yopmail.com')).toBe(true)
    expect(correoDescartable('ventas@empresa.com.ar')).toBe(false)
    const c = generarClave()
    expect(c).toHaveLength(18)
    expect(c).toMatch(/[2-9]/)
    expect(c).toMatch(/[!#$%&*+\-=?@_]/)
    expect(generarClave()).not.toBe(c)
  })
})
