import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, tecnicos, terceros } from '../../db/schema'
import { buscarHuecos, calendario } from './agenda'
import { guardarEtiqueta, listarEtiquetas, ponerEtiquetas } from './etiquetas'
import { agendaDelTecnico, datosEvento, guardarOrden, listarOrdenes, obtenerOrden, programarOrden } from './servicio'

const U = '00000000-0000-4000-8000-000000000001'

describe('etiquetas y acompañantes de las órdenes', () => {
  let empresa: string
  let juan: string
  let ana: string
  let pedro: string
  let orden: string
  let otra: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Copiadora S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    const cliente = await en(async (tx) => {
      ;[juan, ana, pedro] = (
        await tx
          .insert(tecnicos)
          .values([
            { codigo: 'T1', nombre: 'Juan', jornadaDesde: '08:00', jornadaHasta: '12:00' },
            { codigo: 'T2', nombre: 'Ana', jornadaDesde: '08:00', jornadaHasta: '12:00' },
            { codigo: 'T3', nombre: 'Pedro', activo: false },
          ])
          .returning()
      ).map((t) => t.id)
      return (
        await tx.insert(terceros).values({ codigo: 'C1', razonSocial: 'Estudio', tipoDocumento: 99, condicionIva: 5 }).returning()
      )[0].id
    })
    for (const falla of ['No imprime', 'Instalación']) {
      const o = await en((tx) => guardarOrden(tx, U, { fecha: '2026-10-05', terceroId: cliente, falla }))
      if (!o.ok) throw new Error(o.error)
      if (falla === 'No imprime') orden = o.id
      else otra = o.id
    }
  })

  it('etiquetas: se crean, se ponen y se filtra por ellas', async () => {
    const vip = await en((tx) => guardarEtiqueta(tx, U, { nombre: 'Cliente VIP', color: '#7c3aed' }))
    const repuesto = await en((tx) => guardarEtiqueta(tx, U, { nombre: 'Espera repuesto', color: '#d97706' }))
    if (!vip.ok || !repuesto.ok) throw new Error('no se crearon')
    expect(await en((tx) => guardarEtiqueta(tx, U, { nombre: 'Cliente VIP', color: '#000000' }))).toMatchObject({ ok: false })
    expect(await en((tx) => guardarEtiqueta(tx, U, { nombre: 'Mal', color: 'rojo' }))).toMatchObject({ ok: false })

    expect(await en((tx) => ponerEtiquetas(tx, U, orden, [vip.id, repuesto.id, vip.id]))).toEqual({ ok: true })
    expect((await en((tx) => obtenerOrden(tx, orden)))!.etiquetas.map((e) => e.nombre)).toEqual([
      'Cliente VIP',
      'Espera repuesto',
    ])
    expect((await en((tx) => listarOrdenes(tx, { etiquetaId: repuesto.id }))).map((o) => o.id)).toEqual([orden])

    // Se reemplazan, no se suman.
    await en((tx) => ponerEtiquetas(tx, U, orden, [vip.id]))
    expect(await en((tx) => listarOrdenes(tx, { etiquetaId: repuesto.id }))).toEqual([])
    expect((await en((tx) => datosEvento(tx, orden))) as { etiquetas: string[] }).toMatchObject({ etiquetas: ['Cliente VIP'] })

    // Una inactiva no se ofrece, pero sigue en las órdenes que la tienen.
    await en((tx) => guardarEtiqueta(tx, U, { nombre: 'Cliente VIP', color: '#7c3aed', activa: false }, vip.id))
    expect((await en((tx) => listarEtiquetas(tx))).map((e) => e.nombre)).toEqual(['Espera repuesto'])
    expect((await en((tx) => obtenerOrden(tx, orden)))!.etiquetas).toHaveLength(1)
  })

  it('acompañantes: van en la orden, en su agenda y les ocupa el horario', async () => {
    // Pedro está inactivo; el responsable no se repite como acompañante.
    expect(
      await en((tx) =>
        programarOrden(tx, U, orden, {
          programada: '2026-10-09',
          hora: '08:00',
          duracion: 180,
          tecnicoId: juan,
          acompanantes: [pedro],
        }),
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('no está activo') })
    expect(
      await en((tx) =>
        programarOrden(tx, U, orden, {
          programada: '2026-10-09',
          hora: '08:00',
          duracion: 180,
          tecnicoId: juan,
          acompanantes: [ana, juan],
        }),
      ),
    ).toMatchObject({ ok: true, estado: 'asignada' })
    expect((await en((tx) => obtenerOrden(tx, orden)))!.acompanantes.map((t) => t.nombre)).toEqual(['Ana'])
    expect((await en((tx) => datosEvento(tx, orden))) as { acompanantes: string[] }).toMatchObject({ acompanantes: ['Ana'] })

    // Reprogramar sin mandar acompañantes los conserva.
    await en((tx) => programarOrden(tx, U, orden, { programada: '2026-10-09', hora: '08:30', duracion: 180, tecnicoId: juan }))
    expect((await en((tx) => obtenerOrden(tx, orden)))!.acompanantes).toHaveLength(1)

    const agendaAna = await en((tx) => agendaDelTecnico(tx, ana))
    expect(agendaAna.map((o) => [o.id, o.acompanante])).toEqual([[orden, true]])
    expect((await en((tx) => agendaDelTecnico(tx, juan))).map((o) => o.acompanante)).toEqual([false])

    // Ana tiene ocupada la mañana del viernes: no hay hueco de 1 hora ese día ni para ella ni para Juan.
    const huecos = await en((tx) =>
      buscarHuecos(tx, { duracion: 60, desde: '2026-10-09', dias: 1, excluirOrdenId: otra }, new Date('2026-10-01T12:00:00Z')),
    )
    expect(huecos).toEqual([])

    const cal = await en((tx) => calendario(tx, '2026-10-09', '2026-10-09'))
    expect(cal.programadas.find((o) => o.id === orden)).toMatchObject({ acompanantes: [{ nombre: 'Ana' }] })
  })

  it('sin responsable no hay acompañantes', async () => {
    expect(
      await en((tx) => programarOrden(tx, U, otra, { programada: '2026-10-12', hora: '09:00', acompanantes: [ana] })),
    ).toMatchObject({ ok: false, error: expect.stringContaining('responsable') })
    // Desasignar la orden saca a los acompañantes.
    await en((tx) => programarOrden(tx, U, orden, { programada: '2026-10-09', hora: '08:30' }))
    expect((await en((tx) => obtenerOrden(tx, orden)))!.acompanantes).toEqual([])
    expect(await en((tx) => agendaDelTecnico(tx, ana))).toEqual([])
  })
})
