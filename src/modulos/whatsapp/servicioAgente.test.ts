import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, equipos, ordenesServicio, tecnicos, terceros } from '../../db/schema'
import { abrirReclamo, reservarTurno, textoTurnos, turnosLibres } from './servicioAgente'

describe('Servicio técnico desde el agente de WhatsApp', () => {
  let empresa: string
  let cliente: string
  let otro: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)
  // La orden se abre con la fecha de hoy: los turnos, desde ahora.
  const ahora = new Date()

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Técnica S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    await en(async (tx) => {
      const ts = await tx
        .insert(terceros)
        .values([
          { codigo: 'C1', razonSocial: 'Estudio Sur', tipoDocumento: 80, numeroDocumento: '30711222339', condicionIva: 1 },
          { codigo: 'C2', razonSocial: 'Otro Cliente', tipoDocumento: 99, numeroDocumento: '0', condicionIva: 5 },
        ])
        .returning()
      ;[{ id: cliente }, { id: otro }] = ts
      await tx.insert(equipos).values([
        { terceroId: cliente, serie: 'ABC12345', estado: 'instalado' },
        { terceroId: cliente, serie: 'XYZ99999', estado: 'instalado' },
      ])
      await tx.insert(tecnicos).values({ codigo: 'T1', nombre: 'Juan', jornadaDesde: '08:00', jornadaHasta: '12:00' })
    })
  })

  it('abre la orden con origen WhatsApp y reconoce el equipo por la serie', async () => {
    expect(await abrirReclamo(empresa, cliente, { falla: 'no' })).toMatchObject({ ok: false })
    const r = await abrirReclamo(empresa, cliente, { falla: 'La impresora atasca papel', equipo: 'abc12345' })
    expect(r).toMatchObject({ ok: true, numero: 1, equipo: 'ABC12345' })
    if (!r.ok) return
    const [o] = await en((tx) => tx.select().from(ordenesServicio).where(eq(ordenesServicio.id, r.id)))
    expect(o).toMatchObject({ origen: 'whatsapp', terceroId: cliente, estado: 'pendiente' })
    // Serie desconocida: la orden se abre igual, con lo que dijo el cliente.
    const s = await abrirReclamo(empresa, cliente, { falla: 'Hace ruido al copiar', equipo: 'Q-1' })
    expect(s).toMatchObject({ ok: true, equipo: null })
  })

  it('ofrece turnos libres y reserva uno para la orden del cliente', async () => {
    const lista = await turnosLibres(empresa, ahora)
    expect(lista.length).toBeGreaterThan(0)
    expect(textoTurnos(lista.slice(0, 1))).toMatch(/^- \w+ \d\d\/\d\d\/2026 a las \d\d:\d\d$/)
    const t = lista[0]
    // Con dos órdenes abiertas hay que decir cuál.
    expect(await reservarTurno(empresa, cliente, { fecha: t.fecha, hora: t.hora }, ahora)).toMatchObject({ ok: false })
    // Otro cliente no puede agendar órdenes ajenas.
    expect(await reservarTurno(empresa, otro, { orden: 1, fecha: t.fecha, hora: t.hora }, ahora)).toMatchObject({ ok: false })
    const r = await reservarTurno(empresa, cliente, { orden: 1, fecha: t.fecha, hora: t.hora }, ahora)
    expect(r).toMatchObject({ ok: true, numero: 1, fecha: t.fecha, hora: t.hora })
    const [o] = await en((tx) => tx.select().from(ordenesServicio).where(eq(ordenesServicio.numero, 1)))
    expect(o).toMatchObject({ programada: t.fecha, estado: 'asignada' })
    // El mismo turno ya no está libre para la otra orden.
    expect(await reservarTurno(empresa, cliente, { orden: 2, fecha: t.fecha, hora: t.hora }, ahora)).toMatchObject({
      ok: false,
      error: expect.stringContaining('ya no está libre'),
    })
  })
})
