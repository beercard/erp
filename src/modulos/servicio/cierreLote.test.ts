import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, ordenesServicio, terceros } from '../../db/schema'
import { cerrarEnLote, recerrarOrden, resumenOrdenes } from './servicio'

const U = '00000000-0000-4000-8000-000000000001'

describe('cierre en lote de los informes', () => {
  let empresa: string
  const ids: Record<string, string> = {}
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Copiadora S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    await en(async (tx) => {
      const [c] = await tx
        .insert(terceros)
        .values({ codigo: 'C1', razonSocial: 'Estudio', tipoDocumento: 99, condicionIva: 5 })
        .returning()
      const base = { fecha: '2026-09-01', terceroId: c.id, falla: 'No imprime', informada: new Date('2026-09-03T15:00:00Z') }
      const filas = [
        { clave: 'ok', estado: 'informe', solucion: 'Limpieza y cambio de rodillo', cierreTecnico: 'ok' },
        { clave: 'desvio', estado: 'informe', solucion: 'Falta el fusor, se pidió', cierreTecnico: 'desvio' },
        { clave: 'sinPropuesta', estado: 'informe', solucion: 'Se tomó el contador', cierreTecnico: null },
        { clave: 'asignada', estado: 'asignada', solucion: null, cierreTecnico: null, informada: null },
      ]
      for (const [i, f] of filas.entries()) {
        const { clave, ...resto } = f
        const [o] = await tx
          .insert(ordenesServicio)
          .values({ ...base, ...resto, numero: i + 1 })
          .returning()
        ids[clave] = o.id
      }
    })
  })

  it('cierra cada una como la propuso el técnico, con la fecha de su informe', async () => {
    const r = await en((tx) => cerrarEnLote(tx, U, [ids.ok, ids.desvio, ids.sinPropuesta, ids.asignada], { modo: 'propuesto' }))
    expect(r.cerradas).toHaveLength(3)
    expect(r.omitidas).toEqual([{ id: ids.asignada, numero: 4, motivo: 'no está en informe' }])
    const todas = await en((tx) => tx.select().from(ordenesServicio))
    const de = (clave: string) => todas.find((o) => o.id === ids[clave])!
    expect(de('ok')).toMatchObject({ estado: 'cerrada_ok', fechaResolucion: '2026-09-03', cerradaPor: U })
    expect(de('desvio')).toMatchObject({
      estado: 'cerrada_desvio',
      notaCierre: 'Según el informe del técnico: Falta el fusor, se pidió',
    })
    expect(de('sinPropuesta').estado).toBe('cerrada_ok')
    expect(de('asignada').estado).toBe('asignada')
    expect((await en((tx) => resumenOrdenes(tx))).paraRevisar).toBe(0)
  })

  it('"todas OK" ignora la propuesta; lo ya cerrado no se toca', async () => {
    await en((tx) =>
      tx
        .update(ordenesServicio)
        .set({ estado: 'informe', fechaResolucion: null, cerrada: null })
        .where(eq(ordenesServicio.id, ids.desvio)),
    )
    const r = await en((tx) => cerrarEnLote(tx, U, [ids.desvio, ids.ok], { modo: 'ok' }))
    expect(r.cerradas).toEqual([ids.desvio])
    expect(r.omitidas).toEqual([{ id: ids.ok, numero: 1, motivo: 'no está en informe' }])
    const [o] = await en((tx) => tx.select().from(ordenesServicio).where(eq(ordenesServicio.id, ids.desvio)))
    expect(o.estado).toBe('cerrada_ok')
  })

  it('cambia el tipo de cierre sin reabrir; una facturada no pasa a no cumplida', async () => {
    expect(await en((tx) => recerrarOrden(tx, U, ids.ok, { cierre: 'desvio' }))).toMatchObject({
      ok: false,
      error: expect.stringContaining('desvío'),
    })
    expect(await en((tx) => recerrarOrden(tx, U, ids.ok, { cierre: 'desvio', nota: 'Quedó un pedido de repuesto' }))).toEqual({
      ok: true,
    })
    const [o] = await en((tx) => tx.select().from(ordenesServicio).where(eq(ordenesServicio.id, ids.ok)))
    expect(o).toMatchObject({
      estado: 'cerrada_desvio',
      notaCierre: 'Quedó un pedido de repuesto',
      fechaResolucion: '2026-09-03',
    })
    expect(await en((tx) => recerrarOrden(tx, U, ids.asignada, { cierre: 'ok' }))).toMatchObject({ ok: false })
  })
})
