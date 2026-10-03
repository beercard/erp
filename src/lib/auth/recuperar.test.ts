import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { baseDePrueba } from '../../db/pruebas'
import { sesiones, usuarios } from '../../db/schema'
import type { BaseDeDatos } from '../../db/conexion'
import { hashearClave } from './clave'
import { leerRecuperacion, pedirRecuperacion, usarRecuperacion } from './recuperar'
import { iniciarSesion } from './sesiones'

describe('olvidé mi contraseña', () => {
  let base: BaseDeDatos
  let usuarioId: string

  beforeAll(async () => {
    base = await baseDePrueba()
    ;[{ id: usuarioId }] = await base
      .insert(usuarios)
      .values({ email: 'Ana@Pyme.com', nombre: 'Ana Gómez', hashClave: await hashearClave('clave-vieja-2026') })
      .returning()
  })

  it('un email sin cuenta no genera nada (y la respuesta es la misma)', async () => {
    expect(await pedirRecuperacion('nadie@pyme.com', 'https://erp')).toBeUndefined()
  })

  it('el enlace cambia la clave, cierra las sesiones y sirve una sola vez', async () => {
    const vieja = await iniciarSesion('ana@pyme.com', 'clave-vieja-2026')
    expect(vieja.ok).toBe(true)
    const token = await pedirRecuperacion('ANA@pyme.com ', 'https://erp')
    if (!token) throw new Error('sin token')
    expect(await leerRecuperacion(token)).toEqual({ email: 'Ana@Pyme.com' })
    expect(await usarRecuperacion(token, 'corta', 'corta')).toMatchObject({ ok: false })
    expect(await usarRecuperacion(token, 'clave-nueva-2026', 'otra-cosa-2026')).toMatchObject({ ok: false })
    expect(await usarRecuperacion(token, 'clave-nueva-2026', 'clave-nueva-2026')).toMatchObject({ ok: true })
    expect(await base.select().from(sesiones).where(eq(sesiones.usuarioId, usuarioId))).toHaveLength(0)
    expect((await iniciarSesion('ana@pyme.com', 'clave-vieja-2026')).ok).toBe(false)
    expect((await iniciarSesion('ana@pyme.com', 'clave-nueva-2026')).ok).toBe(true)
    expect(await usarRecuperacion(token, 'clave-otra-2026', 'clave-otra-2026')).toMatchObject({ ok: false })
  })

  it('vence a la hora', async () => {
    const token = await pedirRecuperacion('ana@pyme.com', 'https://erp', new Date('2026-10-03T10:00:00Z'))
    expect(await leerRecuperacion(token!, new Date('2026-10-03T11:01:00Z'))).toBeNull()
  })
})
