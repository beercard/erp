import { beforeAll, describe, expect, it, vi } from 'vitest'

import { baseDePrueba } from '../../db/pruebas'
import { erroresRecientes, estadoCron, huellaError, latido, registrarError } from './monitoreo'

describe('Monitoreo', () => {
  beforeAll(async () => {
    await baseDePrueba()
  })

  it('agrupa los errores repetidos (aunque cambien ids y números) y avisa como mucho cada 6 horas', async () => {
    const avisar = vi.fn(async () => undefined)
    const t0 = new Date('2026-10-03T12:00:00Z')
    const mensaje = (n: number) => `No existe el comprobante ${n} de la empresa 3f2b1c4d-1111-2222-3333-444455556666`
    expect(huellaError(mensaje(1), '/facturas/[id]')).toBe(huellaError(mensaje(99), '/facturas/[id]'))
    await registrarError({ mensaje: mensaje(1), ruta: '/facturas/[id]', tipo: 'render GET' }, t0, avisar)
    await registrarError({ mensaje: mensaje(2), ruta: '/facturas/[id]' }, new Date(t0.getTime() + 60_000), avisar)
    expect(avisar).toHaveBeenCalledTimes(1)
    await registrarError({ mensaje: mensaje(3), ruta: '/facturas/[id]' }, new Date(t0.getTime() + 7 * 3_600_000), avisar)
    expect(avisar).toHaveBeenCalledTimes(2)
    const [e] = await erroresRecientes()
    expect(e).toMatchObject({ cantidad: 3, ruta: '/facturas/[id]' })
  })

  it('latido de la tarea periódica: al día o atrasado', async () => {
    expect(await estadoCron()).toBeNull()
    const t = new Date('2026-10-03T12:00:00Z')
    await latido('cron', { empresas: 3, errores: 0 }, true, t)
    expect(await estadoCron(new Date(t.getTime() + 20 * 60_000))).toMatchObject({ ok: true, atrasado: false })
    expect(await estadoCron(new Date(t.getTime() + 50 * 60_000))).toMatchObject({ atrasado: true })
  })
})
