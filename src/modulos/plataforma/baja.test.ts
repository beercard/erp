import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { comoPlataforma } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, suscripciones, usuarios } from '../../db/schema'
import { situacion } from '../../lib/planes'
import { anularBaja, pedirBaja } from './baja'
import { registrarPago, suscripcionDe } from './suscripciones'

describe('botón de baja', () => {
  let empresa: string
  let usuario: { id: string; email: string }
  beforeAll(async () => {
    const db = await baseDePrueba()
    ;[{ id: empresa }] = await db
      .insert(empresas)
      .values({ razonSocial: 'Taller S.R.L.', cuit: '30712345671', condicionIva: 1 })
      .returning()
    await db.insert(suscripciones).values({
      empresaId: empresa,
      plan: 'pyme',
      estado: 'activa',
      pagadoHasta: '2026-10-20',
      mpSuscripcion: 'pre-9',
      mpEstado: 'authorized',
    })
    const [u] = await db.insert(usuarios).values({ email: 'duena@taller.com', nombre: 'Dueña', hashClave: 'x' }).returning()
    usuario = { id: u.id, email: u.email }
  })

  it('cancela el débito, sigue hasta el fin del período pagado, se puede deshacer y un pago nuevo la anula', async () => {
    process.env.MP_ACCESS_TOKEN = 'prueba'
    const llamadas: { url: string; metodo?: string; cuerpo?: string }[] = []
    const f = (async (url: string, init?: RequestInit) => {
      llamadas.push({ url, metodo: init?.method, cuerpo: String(init?.body) })
      return new Response('{"id":"pre-9","status":"cancelled"}', { status: 200 })
    }) as typeof fetch
    try {
      const r = await pedirBaja(empresa, usuario, 'Cerramos el local', '2026-10-03', f)
      expect(r).toEqual({ ok: true, desde: '2026-10-21' })
      expect(llamadas[0]).toMatchObject({ url: 'https://api.mercadopago.com/preapproval/pre-9', metodo: 'PUT' })
      expect(JSON.parse(llamadas[0].cuerpo!)).toEqual({ status: 'cancelled' })

      const s = await suscripcionDe(empresa)
      expect(s).toMatchObject({ bajaDesde: '2026-10-21', mpEstado: 'cancelled' })
      expect(situacion(s, '2026-10-20').soloLectura).toBe(false)
      expect(situacion(s, '2026-10-20').aviso?.texto).toContain('Pediste la baja')
      expect(situacion(s, '2026-10-21').soloLectura).toBe(true)

      expect((await pedirBaja(empresa, usuario, '', '2026-10-04', f)).ok).toBe(false)
      expect(await anularBaja(empresa, usuario.id, '2026-10-05')).toEqual({ ok: true })
      expect((await suscripcionDe(empresa)).bajaDesde).toBeNull()

      // Otra baja, y un pago la deja sin efecto.
      await comoPlataforma((tx) =>
        tx.update(suscripciones).set({ bajaDesde: '2026-10-21' }).where(eq(suscripciones.empresaId, empresa)),
      )
      await registrarPago(null, empresa, { importe: '100', medio: 'Transferencia' }, '2026-10-06')
      expect((await suscripcionDe(empresa)).bajaDesde).toBeNull()
    } finally {
      delete process.env.MP_ACCESS_TOKEN
    }
  })
})
