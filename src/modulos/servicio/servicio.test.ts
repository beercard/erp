import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  articulos,
  comprobantes,
  comprobantesItems,
  depositos,
  empresas,
  lecturas,
  ordenesServicio,
  puntosVenta,
  tecnicos,
  terceros,
} from '../../db/schema'
import { saldoDe } from '../comercial/stock'
import { eliminarBorrador } from '../facturacion/comprobantes'
import { guardarContrato, guardarEquipo } from '../contratos/contratos'
import {
  agregarItem,
  asignarOrden,
  cancelarOrden,
  coberturaSugerida,
  facturarOrden,
  guardarOrden,
  listarOrdenes,
  obtenerOrden,
  quitarItem,
  reabrirOrden,
  registrarVisita,
  resolverOrden,
  resumenOrdenes,
} from './servicio'

const U = '00000000-0000-4000-8000-000000000001'

describe('cobertura sugerida', () => {
  it('contrato, después garantía vigente, si no con cargo', () => {
    expect(coberturaSugerida({ contratoId: 'x', garantiaHasta: '2020-01-01' }, '2026-10-02')).toBe('contrato')
    expect(coberturaSugerida({ contratoId: null, garantiaHasta: '2026-10-02' }, '2026-10-02')).toBe('garantia')
    expect(coberturaSugerida({ contratoId: null, garantiaHasta: '2026-10-01' }, '2026-10-02')).toBe('cargo')
    expect(coberturaSugerida(null, '2026-10-02')).toBe('cargo')
  })
})

describe('órdenes de servicio técnico', () => {
  let empresa: string
  let cliente: string
  let otro: string
  let tecnico: string
  let central: string
  let toner: string
  let enContrato: string
  let vendido: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Copiadora S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    await en(async (tx) => {
      await tx.insert(puntosVenta).values({ numero: 5, nombre: 'ERP', tipo: 'electronico' })
      ;[cliente, otro] = (
        await tx
          .insert(terceros)
          .values([
            { codigo: 'C1', razonSocial: 'Estudio', tipoDocumento: 80, numeroDocumento: '30999176522', condicionIva: 1 },
            { codigo: 'C2', razonSocial: 'Otro', tipoDocumento: 99, condicionIva: 5 },
          ])
          .returning()
      ).map((t) => t.id)
      tecnico = (await tx.insert(tecnicos).values({ codigo: 'T1', nombre: 'Juan Técnico' }).returning())[0].id
      central = (await tx.insert(depositos).values({ codigo: '001', nombre: 'Central' }).returning())[0].id
      toner = (
        await tx.insert(articulos).values({ codigo: 'TN', nombre: 'Tóner', alicuotaIva: 5, llevaStock: true }).returning()
      )[0].id
    })
    const c = await en((tx) =>
      guardarContrato(tx, U, {
        terceroId: cliente,
        tipo: 'Servicio de fotocopiado',
        modalidad: 'excedente',
        facturacion: 'vencida',
        moneda: 'PES',
        precioExcedente: '10',
      }),
    )
    if (!c.ok) throw new Error(c.error)
    const a = await en((tx) => guardarEquipo(tx, U, { serie: 'ENC001', contratoId: c.id, contadorInicial: 1000 }))
    const b = await en((tx) =>
      guardarEquipo(tx, U, { serie: 'VEN001', terceroId: cliente, comercializacion: 'venta', domicilio: 'Mitre 100' }),
    )
    if (!a.ok || !b.ok) throw new Error('equipos')
    enContrato = a.id
    vendido = b.id
  })

  it('abre la orden con la cobertura del equipo y el domicilio de la instalación', async () => {
    const o = await en((tx) =>
      guardarOrden(tx, U, { fecha: '2026-10-01', terceroId: cliente, equipoId: enContrato, falla: 'Atasca papel' }),
    )
    if (!o.ok) throw new Error(o.error)
    expect(o.numero).toBe(1)
    const v = await en((tx) =>
      guardarOrden(tx, U, {
        fecha: '2026-10-01',
        terceroId: cliente,
        equipoId: vendido,
        falla: 'No enciende',
        tecnicoId: tecnico,
      }),
    )
    if (!v.ok) throw new Error(v.error)
    const [uno, dos] = await en((tx) => Promise.all([obtenerOrden(tx, o.id), obtenerOrden(tx, v.id)]))
    expect(uno).toMatchObject({ cobertura: 'contrato', estado: 'pendiente', contratoId: expect.any(String) })
    expect(dos).toMatchObject({ cobertura: 'cargo', estado: 'asignada', domicilio: 'Mitre 100', numero: 2 })

    // Un equipo de otro cliente no.
    expect(
      (await en((tx) => guardarOrden(tx, U, { fecha: '2026-10-01', terceroId: otro, equipoId: vendido, falla: 'Ruido' }))).ok,
    ).toBe(false)
  })

  it('asigna, carga visitas e insumos que descuentan stock y vuelven al quitarlos', async () => {
    const [o] = await en((tx) => listarOrdenes(tx, { q: 'Atasca' }))
    expect((await en((tx) => asignarOrden(tx, U, o.id, { tecnicoId: tecnico, programada: '2026-10-02' }))).ok).toBe(true)
    expect(
      (await en((tx) => registrarVisita(tx, U, o.id, { fecha: '2026-10-02', horas: '1,5', detalle: 'Cambio de rodillo' }))).ok,
    ).toBe(true)
    const r = await en((tx) => agregarItem(tx, U, o.id, { articuloId: toner, cantidad: '2', depositoId: central }))
    if (!r.ok) throw new Error(r.error)
    expect(r.avisos[0]).toContain('stock negativo')
    expect(await en((tx) => saldoDe(tx, toner, central))).toBe('-2.0000')
    // Sin depósito, un artículo con stock no se carga.
    expect((await en((tx) => agregarItem(tx, U, o.id, { articuloId: toner, cantidad: '1' }))).ok).toBe(false)

    expect((await en((tx) => quitarItem(tx, U, r.id))).ok).toBe(true)
    expect(Number(await en((tx) => saldoDe(tx, toner, central)))).toBe(0)

    const d = await en((tx) => obtenerOrden(tx, o.id))
    expect(d?.estado).toBe('asignada')
    expect(d?.visitas).toHaveLength(1)
    expect(d?.visitas[0]).toMatchObject({ tecnico: 'Juan Técnico', horas: '1.5000' })
    expect(d?.items).toHaveLength(0)
  })

  it('resuelve con el contador, que queda como lectura del equipo; se reabre y no se factura si la cubre el contrato', async () => {
    const [o] = await en((tx) => listarOrdenes(tx, { q: 'Atasca' }))
    expect((await en((tx) => resolverOrden(tx, U, o.id, { fecha: '2026-10-02', solucion: 'Listo', contador: '1.500' }))).ok).toBe(
      true,
    )
    const [l] = await en((tx) => tx.select().from(lecturas).where(eq(lecturas.equipoId, enContrato)))
    expect(l).toMatchObject({ contador: 1500, origen: 'tecnico', fecha: '2026-10-02' })

    // Resuelta: no se le cargan más cosas.
    expect((await en((tx) => registrarVisita(tx, U, o.id, { fecha: '2026-10-03', detalle: 'Otra' }))).ok).toBe(false)
    expect(await en((tx) => facturarOrden(tx, U, o.id, { puntoVenta: 5, fecha: '2026-10-03' }))).toMatchObject({
      error: expect.stringContaining('contrato'),
    })

    expect((await en((tx) => reabrirOrden(tx, U, o.id))).ok).toBe(true)
    expect((await en((tx) => obtenerOrden(tx, o.id)))?.estado).toBe('asignada')
  })

  it('con cargo: factura en borrador lo que tiene precio; si se borra el borrador se puede volver a facturar', async () => {
    const [o] = await en((tx) => listarOrdenes(tx, { q: 'No enciende' }))
    await en(async (tx) => {
      const i = await agregarItem(tx, U, o.id, {
        articuloId: toner,
        cantidad: '1',
        depositoId: central,
        precioUnitario: '50000',
      })
      if (!i.ok) throw new Error(i.error)
      await agregarItem(tx, U, o.id, { descripcion: 'Mano de obra técnica', cantidad: '2', precioUnitario: '15000' })
      await agregarItem(tx, U, o.id, { descripcion: 'Limpieza sin cargo', cantidad: '1' })
    })
    // Sin resolver no se factura.
    expect((await en((tx) => facturarOrden(tx, U, o.id, { puntoVenta: 5, fecha: '2026-10-03' }))).ok).toBe(false)
    expect((await en((tx) => resolverOrden(tx, U, o.id, { fecha: '2026-10-03', solucion: 'Fuente cambiada' }))).ok).toBe(true)
    expect((await en((tx) => resumenOrdenes(tx))).porFacturar).toBe(1)

    const f = await en((tx) => facturarOrden(tx, U, o.id, { puntoVenta: 5, fecha: '2026-10-03' }))
    if (!f.ok) throw new Error(f.error)
    const [c] = await en((tx) => tx.select().from(comprobantes).where(eq(comprobantes.id, f.comprobanteId)))
    expect(c).toMatchObject({ estado: 'borrador', concepto: 3, neto: '80000.00', servicioDesde: '2026-10-01' })
    const items = await en((tx) => tx.select().from(comprobantesItems).where(eq(comprobantesItems.comprobanteId, c.id)))
    expect(items).toHaveLength(2)
    expect((await en((tx) => facturarOrden(tx, U, o.id, { puntoVenta: 5, fecha: '2026-10-03' }))).ok).toBe(false)
    expect((await en((tx) => reabrirOrden(tx, U, o.id))).ok).toBe(false)

    // Borrar el borrador suelta la orden.
    expect((await en((tx) => eliminarBorrador(tx, U, c.id))).ok).toBe(true)
    const [suelta] = await en((tx) => tx.select().from(ordenesServicio).where(eq(ordenesServicio.id, o.id)))
    expect(suelta.comprobanteId).toBeNull()
    expect(suelta.empresaId).toBe(empresa)
    expect((await en((tx) => facturarOrden(tx, U, o.id, { puntoVenta: 5, fecha: '2026-10-04' }))).ok).toBe(true)
  })

  it('un artículo de tipo servicio se factura como servicio, no como producto', async () => {
    const visita = await en(
      async (tx) =>
        (
          await tx
            .insert(articulos)
            .values({ codigo: 'SV', nombre: 'Visita técnica', tipo: 'servicio', llevaStock: false })
            .returning()
        )[0].id,
    )
    const n = await en((tx) =>
      guardarOrden(tx, U, { fecha: '2026-10-05', terceroId: cliente, equipoId: vendido, falla: 'Revisión' }),
    )
    if (!n.ok) throw new Error(n.error)
    await en((tx) => agregarItem(tx, U, n.id, { articuloId: visita, cantidad: '1', precioUnitario: '45000' }))
    await en((tx) => resolverOrden(tx, U, n.id, { fecha: '2026-10-05', solucion: 'Revisado' }))
    const f = await en((tx) => facturarOrden(tx, U, n.id, { puntoVenta: 5, fecha: '2026-10-05' }))
    if (!f.ok) throw new Error(f.error)
    const [c] = await en((tx) => tx.select().from(comprobantes).where(eq(comprobantes.id, f.comprobanteId)))
    expect(c.concepto).toBe(2)
  })

  it('cancela solo sin insumos cargados y las órdenes no se borran', async () => {
    const n = await en((tx) =>
      guardarOrden(tx, U, { fecha: '2026-10-05', terceroId: otro, falla: 'Pide presupuesto', prioridad: 'urgente' }),
    )
    if (!n.ok) throw new Error(n.error)
    expect((await en((tx) => resumenOrdenes(tx))).urgentes).toBe(1)
    const [primera] = await en((tx) => listarOrdenes(tx))
    expect(primera.id).toBe(n.id)
    const i = await en((tx) => agregarItem(tx, U, n.id, { descripcion: 'Visita', cantidad: '1', precioUnitario: '1000' }))
    if (!i.ok) throw new Error(i.error)
    expect((await en((tx) => cancelarOrden(tx, U, n.id, 'El cliente desistió'))).ok).toBe(false)
    await en((tx) => quitarItem(tx, U, i.id))
    expect((await en((tx) => cancelarOrden(tx, U, n.id, 'El cliente desistió'))).ok).toBe(true)
    expect((await en((tx) => listarOrdenes(tx, { estado: 'cancelada' }))).map((x) => x.id)).toEqual([n.id])
    await expect(en((tx) => tx.delete(ordenesServicio).where(eq(ordenesServicio.id, n.id)))).rejects.toThrow()
  })
})
