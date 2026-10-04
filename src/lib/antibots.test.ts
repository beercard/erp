import { afterEach, describe, expect, it } from 'vitest'

import { CAMPO_TIEMPO, CAMPO_TRAMPA, correoDescartable, generarClave, mensajeBot } from './antibots'
import { controlarEnvio, leerSello, sellarApertura, verificarTurnstile } from './antibotsServidor'

process.env.ERP_CLAVE_MAESTRA ??= 'clave-maestra-solo-para-pruebas-000000000000'

const AHORA = 1_800_000_000_000
const formulario = (campos: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}
const cloudflare = (success: boolean, errores: string[] = []) => {
  const pedidos: string[] = []
  const f = (async (_: string, init: RequestInit) => {
    pedidos.push(String(init.body))
    return new Response(JSON.stringify({ success, 'error-codes': errores }))
  }) as unknown as typeof fetch
  return { f, pedidos }
}

describe('Antibots', () => {
  afterEach(() => {
    delete process.env.TURNSTILE_SECRET
  })

  it('rechaza la trampa completada, lo enviado demasiado rápido y la hora sin firma del servidor', async () => {
    const abierto = sellarApertura(AHORA - 10_000)
    expect(await controlarEnvio(formulario({ [CAMPO_TIEMPO]: abierto }), null, AHORA)).toBeNull()
    expect(await controlarEnvio(formulario({ [CAMPO_TIEMPO]: abierto, [CAMPO_TRAMPA]: 'x' }), null, AHORA)).toBe('trampa')
    expect(await controlarEnvio(formulario({ [CAMPO_TIEMPO]: sellarApertura(AHORA - 1_000) }), null, AHORA)).toBe('rapido')
    expect(await controlarEnvio(formulario({ [CAMPO_TIEMPO]: sellarApertura(AHORA - 25 * 3600_000) }), null, AHORA)).toBe(
      'vencido',
    )
    // La hora del navegador (sin firma) o un sello alterado no sirven: no dependen del reloj de la persona.
    expect(await controlarEnvio(formulario({ [CAMPO_TIEMPO]: String(AHORA - 10_000) }), null, AHORA)).toBe('vencido')
    expect(leerSello(abierto.replace(/^\d+/, String(AHORA - 60_000)))).toBeNull()
    expect(await controlarEnvio(formulario({}), null, AHORA)).toBe('vencido')
    expect(mensajeBot('rapido')).toContain('Esperá unos segundos')
  })

  it('con clave secreta exige y verifica el token de Turnstile en el servidor', async () => {
    process.env.TURNSTILE_SECRET = 'secreto'
    const bien = cloudflare(true)
    const fd = formulario({ [CAMPO_TIEMPO]: sellarApertura(AHORA - 10_000), 'cf-turnstile-response': 'tok' })
    expect(await controlarEnvio(fd, '1.2.3.4', AHORA, bien.f)).toBeNull()
    expect(bien.pedidos[0]).toContain('response=tok')
    expect(bien.pedidos[0]).toContain('remoteip=1.2.3.4')
    expect(await controlarEnvio(fd, null, AHORA, cloudflare(false).f)).toBe('turnstile')
    expect(await verificarTurnstile(null, null, bien.f)).toBe(false)
    // Un secreto mal cargado en el servidor no puede frenar a todos.
    expect(await verificarTurnstile('tok', null, cloudflare(false, ['invalid-input-secret']).f)).toBe(true)
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
