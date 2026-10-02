import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, ordenesServicio, posicionesTecnicos, tecnicos, terceros } from '../../db/schema'
import { avisarVisita } from './avisos'
import { enlaceSeguimiento, leerTokenSeguimiento, seguimientoPublico, tokenSeguimiento } from './seguimiento'
import { guardarOrden, programarOrden, registrarLlegada } from './servicio'

const U = '00000000-0000-4000-8000-000000000001'

describe('enlace público de seguimiento', () => {
  let empresa: string
  let orden: string
  let tecnico: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)
  // 6 de octubre de 2026, 10 de la mañana en Buenos Aires.
  const ahora = new Date('2026-10-06T13:00:00Z')

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Copiadora S.A.', nombreFantasia: 'Copiadora', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    const cliente = await en(async (tx) => {
      tecnico = (await tx.insert(tecnicos).values({ codigo: 'T1', nombre: 'Juan Pérez' }).returning())[0].id
      return (
        await tx
          .insert(terceros)
          .values({ codigo: 'C1', razonSocial: 'Estudio', tipoDocumento: 99, condicionIva: 5, email: 'e@ejemplo.com' })
          .returning()
      )[0].id
    })
    const o = await en((tx) => guardarOrden(tx, U, { fecha: '2026-10-05', terceroId: cliente, falla: 'No imprime' }))
    if (!o.ok) throw new Error(o.error)
    orden = o.id
    // El cliente en Plaza de Mayo.
    await en((tx) =>
      tx.update(ordenesServicio).set({ lat: '-34.608100', lng: '-58.370300' }).where(eq(ordenesServicio.id, orden)),
    )
  })

  it('el enlace es siempre el mismo y no se puede adulterar', () => {
    const t = tokenSeguimiento(empresa, orden)
    expect(tokenSeguimiento(empresa, orden)).toBe(t)
    expect(leerTokenSeguimiento(t)).toEqual({ empresaId: empresa, ordenId: orden })
    expect(enlaceSeguimiento('https://erp.ejemplo.com/', empresa, orden)).toBe(`https://erp.ejemplo.com/seguimiento/${t}`)
    // Otra orden con la firma de esta, o la firma tocada: no vale.
    const otra = '11111111-1111-4111-8111-111111111111'
    expect(leerTokenSeguimiento(`${empresa}.${otra}.${t.split('.')[2]}`)).toBeNull()
    expect(leerTokenSeguimiento(`${t.slice(0, -1)}${t.endsWith('A') ? 'B' : 'A'}`)).toBeNull()
    expect(leerTokenSeguimiento('cualquier-cosa')).toBeNull()
  })

  it('muestra los pasos, y el día de la visita a qué distancia está el técnico', async () => {
    const token = tokenSeguimiento(empresa, orden)
    let s = await seguimientoPublico(token, ahora)
    expect(s).toMatchObject({ empresa: 'Copiadora', estado: 'Recibida', enCamino: null })
    expect(s!.pasos.filter((p) => p.hecho).map((p) => p.texto)).toEqual(['Pedido recibido'])

    await en((tx) => programarOrden(tx, U, orden, { programada: '2026-10-06', hora: '11:00', tecnicoId: tecnico }))
    s = await seguimientoPublico(token, ahora)
    expect(s!.pasos[1]).toMatchObject({ hecho: true, cuando: '06/10/2026 11:00 · Juan' })
    expect(s!.enCamino).toBeNull()

    // Posición de hace 3 minutos en Retiro, a unos 3 km: en camino.
    await en((tx) =>
      tx.insert(posicionesTecnicos).values({
        tecnicoId: tecnico,
        lat: '-34.591300',
        lng: '-58.374500',
        momento: new Date(ahora.getTime() - 3 * 60_000),
      }),
    )
    s = await seguimientoPublico(token, ahora)
    expect(s!.enCamino).toMatchObject({ km: expect.any(Number), minutos: expect.any(Number) })
    expect(s!.enCamino!.km).toBeGreaterThan(2)
    expect(s!.enCamino!.km).toBeLessThan(3.5)
    // No se publica dónde está el técnico.
    expect(JSON.stringify(s)).not.toContain('-34.5913')

    // Una posición vieja no cuenta; y una vez que llegó, tampoco.
    expect((await seguimientoPublico(token, new Date(ahora.getTime() + 20 * 60_000)))!.enCamino).toBeNull()
    await en((tx) => registrarLlegada(tx, U, orden, {}))
    s = await seguimientoPublico(token, ahora)
    expect(s!.enCamino).toBeNull()
    expect(s!.pasos[2].hecho).toBe(true)
  })

  it('el aviso de la visita lleva el enlace', async () => {
    const a = await en((tx) => avisarVisita(tx, U, orden, 'https://erp.ejemplo.com'))
    expect('texto' in a && a.texto).toContain(`https://erp.ejemplo.com/seguimiento/${tokenSeguimiento(empresa, orden)}`)
  })
})
