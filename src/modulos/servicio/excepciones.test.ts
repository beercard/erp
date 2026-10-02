import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, tecnicos } from '../../db/schema'
import { buscarHuecos, calendario } from './agenda'
import { borrarExcepcion, guardarExcepcion } from './excepciones'
import { jornadaDelDia, type Excepcion } from './jornadaDia'

const U = '00000000-0000-4000-8000-000000000001'
const T = { id: 't1', dias: '12345', jornadaDesde: '08:00', jornadaHasta: '12:00' }
const ex = (e: Partial<Excepcion>): Excepcion => ({
  tecnicoId: null,
  desde: '2026-10-12',
  hasta: '2026-10-12',
  tipo: 'ausencia',
  jornadaDesde: null,
  jornadaHasta: null,
  motivo: 'Feriado',
  ...e,
})

describe('jornada del día', () => {
  it('semanal, feriado, licencia y horario especial', () => {
    // 12/10/2026 es lunes; 17/10, sábado.
    expect(jornadaDelDia(T, '2026-10-12', [])).toMatchObject({ trabaja: true, desde: '08:00', especial: false })
    expect(jornadaDelDia(T, '2026-10-17', [])).toMatchObject({ trabaja: false, motivo: null })
    expect(jornadaDelDia(T, '2026-10-12', [ex({})])).toMatchObject({ trabaja: false, motivo: 'Feriado' })
    // El horario especial del técnico manda sobre el feriado general, y hace trabajar un sábado.
    const guardia = ex({ tecnicoId: 't1', tipo: 'horario', jornadaDesde: '09:00', jornadaHasta: '11:00', motivo: 'Guardia' })
    expect(jornadaDelDia(T, '2026-10-12', [ex({}), guardia])).toMatchObject({ trabaja: true, desde: '09:00', hasta: '11:00' })
    expect(jornadaDelDia(T, '2026-10-17', [{ ...guardia, desde: '2026-10-17', hasta: '2026-10-17' }]).trabaja).toBe(true)
    // Licencia de varios días; la de otro técnico no cuenta.
    const vacaciones = ex({ tecnicoId: 't1', desde: '2026-10-13', hasta: '2026-10-16', motivo: 'Vacaciones' })
    expect(jornadaDelDia(T, '2026-10-14', [vacaciones]).trabaja).toBe(false)
    expect(jornadaDelDia(T, '2026-10-14', [{ ...vacaciones, tecnicoId: 'otro' }]).trabaja).toBe(true)
  })
})

describe('licencias y feriados en el asistente', () => {
  let empresa: string
  let juan: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)
  const ahora = new Date('2026-10-01T12:00:00Z')

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Copiadora S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    juan = (
      await en((tx) =>
        tx.insert(tecnicos).values({ codigo: 'T1', nombre: 'Juan', jornadaDesde: '08:00', jornadaHasta: '12:00' }).returning(),
      )
    )[0].id
  })

  it('no ofrece huecos en licencias ni feriados, y usa el horario especial', async () => {
    const dias = async () =>
      (await en((tx) => buscarHuecos(tx, { duracion: 60, desde: '2026-10-12', dias: 5 }, ahora)))
        .map((h) => `${h.fecha} ${h.hora}`)
        .sort()
    expect(await dias()).toEqual([
      '2026-10-12 08:00',
      '2026-10-13 08:00',
      '2026-10-14 08:00',
      '2026-10-15 08:00',
      '2026-10-16 08:00',
    ])

    expect(await en((tx) => guardarExcepcion(tx, U, { desde: '2026-10-12', tipo: 'ausencia', motivo: 'Feriado' }))).toMatchObject(
      {
        ok: false,
      },
    )
    const feriado = await en((tx) =>
      guardarExcepcion(tx, U, { desde: '2026-10-12', hasta: '2026-10-12', tipo: 'ausencia', motivo: 'Feriado' }),
    )
    const vacaciones = await en((tx) =>
      guardarExcepcion(tx, U, {
        tecnicoId: juan,
        desde: '2026-10-13',
        hasta: '2026-10-14',
        tipo: 'ausencia',
        motivo: 'Vacaciones',
      }),
    )
    const especial = await en((tx) =>
      guardarExcepcion(tx, U, {
        tecnicoId: juan,
        desde: '2026-10-15',
        hasta: '2026-10-15',
        tipo: 'horario',
        jornadaDesde: '10:00',
        jornadaHasta: '11:30',
        motivo: 'Médico a la mañana',
      }),
    )
    expect([feriado.ok, vacaciones.ok, especial.ok]).toEqual([true, true, true])
    expect(
      await en((tx) =>
        guardarExcepcion(tx, U, {
          desde: '2026-10-15',
          hasta: '2026-10-15',
          tipo: 'horario',
          jornadaDesde: '11:00',
          jornadaHasta: '10:00',
          motivo: 'Mal',
        }),
      ),
    ).toMatchObject({ ok: false })

    expect(await dias()).toEqual(['2026-10-15 10:00', '2026-10-16 08:00'])
    expect((await en((tx) => calendario(tx, '2026-10-12', '2026-10-18'))).excepciones).toHaveLength(3)

    if (feriado.ok) await en((tx) => borrarExcepcion(tx, U, feriado.id))
    expect((await dias())[0]).toBe('2026-10-12 08:00')
  })
})
