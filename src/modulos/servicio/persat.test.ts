import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  articulos,
  depositos,
  empresas,
  lecturas,
  ordenesServicio,
  ordenesServicioItems,
  plantillasOrden,
  tecnicos,
  terceros,
  tiposOrden,
} from '../../db/schema'
import { saldoDe } from '../comercial/stock'
import { guardarEquipo, registrarLectura } from '../contratos/contratos'
import { buscarHuecos, diaSemana, huecosLibres } from './agenda'
import { guardarArchivo } from './archivos'
import { MODELOS, validarDefinicion, validarValores, visible, type Campo } from './formularios'
import { generarPreventivos, guardarRegla, siguienteFecha } from './preventivo'
import {
  cerrarOrden,
  guardarOrden,
  informarOrden,
  marcarVencidas,
  obtenerOrden,
  programarOrden,
  reabrirOrden,
  registrarLlegada,
} from './servicio'
import { crearModelos, guardarTipo, obtenerTipo } from './tiposOrden'
import { estadoPlanificado, vencimiento } from './tipos'

const U = '00000000-0000-4000-8000-000000000001'
/** PNG de 1×1 (una firma de mentira). */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

describe('formularios', () => {
  const campos: Campo[] = [
    { id: 'funciona', tipo: 'si_no', etiqueta: '¿Funciona?', requerido: true },
    { id: 'motivo', tipo: 'parrafo', etiqueta: 'Motivo', requerido: true, si: { campo: 'funciona', valor: 'No' } },
    { id: 'n', tipo: 'numero', etiqueta: 'Cantidad' },
    {
      id: 'tabla',
      tipo: 'tabla',
      etiqueta: 'Piezas',
      columnas: [
        { id: 'p', etiqueta: 'Pieza', tipo: 'texto' },
        { id: 'v', etiqueta: 'Vida', tipo: 'numero' },
      ],
    },
  ]

  it('los modelos de ejemplo son válidos', () => {
    for (const m of MODELOS) {
      expect(validarDefinicion(m.instrucciones, 'instrucciones')).toBeNull()
      expect(validarDefinicion(m.devolucion, 'devolucion')).toBeNull()
    }
  })

  it('rechaza definiciones rotas', () => {
    expect(validarDefinicion([{ id: 'a', tipo: 'seleccion', etiqueta: 'A', opciones: ['x'] }], 'devolucion')).toContain(
      'dos opciones',
    )
    expect(validarDefinicion([{ id: 'f', tipo: 'firma', etiqueta: 'Firma' }], 'instrucciones')).toContain('devolución')
    expect(
      validarDefinicion([{ id: 'b', tipo: 'texto', etiqueta: 'B', si: { campo: 'nada', valor: 'Sí' } }], 'devolucion'),
    ).toContain('campo anterior')
    expect(
      validarDefinicion(
        [
          { id: 'a', tipo: 'texto', etiqueta: 'A' },
          { id: 'a', tipo: 'texto', etiqueta: 'B' },
        ],
        'devolucion',
      ),
    ).toContain('mismo identificador')
  })

  it('lógica condicional: lo oculto no se pide y se descarta', () => {
    expect(visible(campos[1], campos, { funciona: 'Sí' })).toBe(false)
    expect(validarValores(campos, { funciona: 'No' })).toMatchObject({ ok: false, error: expect.stringContaining('Motivo') })
    const r = validarValores(campos, {
      funciona: 'Sí',
      motivo: 'queda afuera',
      n: '1.234,5',
      tabla: [
        ['Fusor', '80'],
        ['', ''],
      ],
    })
    expect(r).toEqual({ ok: true, valores: { funciona: 'Sí', n: '1234.5', tabla: [['Fusor', '80']] } })
  })
})

describe('agenda y preventivo (cálculos)', () => {
  it('huecos libres entre visitas', () => {
    const jornada = { desde: 480, hasta: 1020 }
    expect(huecosLibres(jornada, [{ inicio: 540, fin: 600 }], 60)).toEqual([
      { inicio: 480, fin: 540 },
      { inicio: 600, fin: 1020 },
    ])
    expect(huecosLibres(jornada, [{ inicio: 500, fin: 1000 }], 60)).toEqual([])
    expect(huecosLibres(jornada, [], 60, 900)).toEqual([{ inicio: 900, fin: 1020 }])
  })

  it('días, estados planificados y vencimiento', () => {
    expect(diaSemana('2026-10-05')).toBe(1)
    expect(diaSemana('2026-10-04')).toBe(7)
    expect(estadoPlanificado({ programada: null, tecnicoId: 'x' })).toBe('pendiente')
    expect(estadoPlanificado({ programada: '2026-10-05', tecnicoId: null })).toBe('proyectada')
    expect(vencimiento('2026-10-05', '09:00', 48)?.toISOString()).toBe('2026-10-07T12:00:00.000Z')
  })

  it('siguiente fecha de un preventivo', () => {
    expect(siguienteFecha('2026-01-31', 'mensual', 1, null)).toBe('2026-01-31')
    expect(siguienteFecha('2026-01-31', 'mensual', 1, '2026-01-31')).toBe('2026-02-28')
    expect(siguienteFecha('2026-01-31', 'mensual', 6, '2026-01-31')).toBe('2026-07-31')
    expect(siguienteFecha('2026-10-05', 'semanal', 2, '2026-10-05')).toBe('2026-10-19')
    expect(siguienteFecha('2026-10-05', 'semanal', 2, '2026-10-20')).toBe('2026-11-02')
  })
})

describe('órdenes como en Persat', () => {
  let empresa: string
  let cliente: string
  let tecnico: string
  let camioneta: string
  let toner: string
  let equipo: string
  let correctivo: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Copiadora S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    await en(async (tx) => {
      cliente = (
        await tx
          .insert(terceros)
          .values({ codigo: 'C1', razonSocial: 'Estudio', tipoDocumento: 80, numeroDocumento: '30999176522', condicionIva: 1 })
          .returning()
      )[0].id
      camioneta = (await tx.insert(depositos).values({ codigo: 'M1', nombre: 'Camioneta 1' }).returning())[0].id
      tecnico = (
        await tx
          .insert(tecnicos)
          .values({
            codigo: 'T1',
            nombre: 'Juan',
            depositoId: camioneta,
            jornadaDesde: '08:00',
            jornadaHasta: '12:00',
            dias: '12345',
          })
          .returning()
      )[0].id
      toner = (await tx.insert(articulos).values({ codigo: 'TN', nombre: 'Tóner', llevaStock: true }).returning())[0].id
      expect(await crearModelos(tx, U)).toHaveLength(MODELOS.length)
      expect(await crearModelos(tx, U)).toHaveLength(0)
      correctivo = (await tx.select().from(tiposOrden).where(eq(tiposOrden.codigo, 'CORR')))[0].id
    })
    const r = await en((tx) =>
      guardarEquipo(tx, U, { serie: 'MPC1', terceroId: cliente, comercializacion: 'venta', contadorInicial: 1000 }),
    )
    if (!r.ok) throw new Error(r.error)
    equipo = r.id
  })

  it('abre con las instrucciones del tipo, programa, vence y se reprograma', async () => {
    // Faltan las instrucciones obligatorias.
    expect(
      await en((tx) =>
        guardarOrden(tx, U, {
          fecha: '2026-10-05',
          terceroId: cliente,
          equipoId: equipo,
          tipoOrdenId: correctivo,
          falla: 'Falla',
        }),
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('Falla que reporta') })
    const o = await en((tx) =>
      guardarOrden(tx, U, {
        fecha: '2026-10-05',
        terceroId: cliente,
        equipoId: equipo,
        tipoOrdenId: correctivo,
        falla: 'Atasca',
        instrucciones: { falla_reportada: 'Atasca en bandeja 2', codigo_error: 'J-102' },
      }),
    )
    if (!o.ok) throw new Error(o.error)
    let d = await en((tx) => obtenerOrden(tx, o.id))
    expect(d).toMatchObject({
      estado: 'pendiente',
      tipo: 'correctivo',
      duracion: 60,
      instrucciones: { equipo, codigo_error: 'J-102' },
    })

    expect(await en((tx) => programarOrden(tx, U, o.id, { programada: '2026-10-06', hora: '09:00' }))).toMatchObject({
      estado: 'proyectada',
    })
    expect(
      await en((tx) => programarOrden(tx, U, o.id, { programada: '2026-10-06', hora: '09:00', tecnicoId: tecnico })),
    ).toMatchObject({
      estado: 'asignada',
    })
    d = await en((tx) => obtenerOrden(tx, o.id))
    expect(d?.vence?.toISOString()).toBe('2026-10-08T12:00:00.000Z')

    expect(await en((tx) => marcarVencidas(tx, new Date('2026-10-08T11:00:00Z')))).toBe(0)
    expect(await en((tx) => marcarVencidas(tx, new Date('2026-10-08T13:00:00Z')))).toBe(1)
    expect((await en((tx) => obtenerOrden(tx, o.id)))?.estado).toBe('vencida')
    expect(
      await en((tx) => programarOrden(tx, U, o.id, { programada: '2026-10-09', hora: '10:00', tecnicoId: tecnico })),
    ).toMatchObject({
      estado: 'asignada',
    })
  })

  it('el asistente busca huecos en la jornada del técnico sin pisar sus visitas', async () => {
    // El 9/10 (viernes) tiene una visita de 10:00 a 11:00; jornada de 8 a 12.
    const huecos = await en((tx) =>
      buscarHuecos(tx, { duracion: 60, desde: '2026-10-09', dias: 3 }, new Date('2026-10-01T12:00:00Z')),
    )
    expect(huecos.map((h) => `${h.fecha} ${h.hora}`)).toEqual(['2026-10-09 08:00'])
    const largos = await en((tx) =>
      buscarHuecos(tx, { duracion: 180, desde: '2026-10-09', dias: 4 }, new Date('2026-10-01T12:00:00Z')),
    )
    // Viernes no alcanza; sábado y domingo no trabaja; lunes sí.
    expect(largos.map((h) => h.fecha)).toEqual(['2026-10-12'])
  })

  it('el técnico llega, sube la firma e informa: materiales de su camioneta, lectura y visita', async () => {
    const [o] = await en((tx) => tx.select().from(ordenesServicio).limit(1))
    expect((await en((tx) => registrarLlegada(tx, U, o.id, { lat: -34.6, lng: -58.38 }))).ok).toBe(true)
    const firma = await en((tx) => guardarArchivo(tx, U, o.id, 'firma', PNG))
    if (!firma.ok) throw new Error(firma.error)
    expect((await en((tx) => guardarArchivo(tx, U, o.id, 'foto', Buffer.from('no es una imagen')))).ok).toBe(false)

    const base = {
      fecha: '2026-10-09',
      solucion: 'Cambio de rodillo',
      cierre: 'ok',
      resultados: {
        causa: 'Otra',
        trabajo: 'Rodillo nuevo',
        funcionando: 'Sí',
        materiales: [{ articuloId: toner, descripcion: 'Tóner', cantidad: '1' }],
        contador: { contador: '1.500', creditos: '20' },
        firma: { archivoId: firma.id, aclaracion: 'Ana Pérez' },
      },
    }
    // La condición: si la causa es "Otra", hay que decir cuál.
    expect(await en((tx) => informarOrden(tx, U, o.id, base))).toMatchObject({ error: expect.stringContaining('¿Cuál?') })
    const r = await en((tx) =>
      informarOrden(tx, U, o.id, { ...base, resultados: { ...base.resultados, causa_otra: 'Rodillo gastado' } }),
    )
    if (!r.ok) throw new Error(r.error)

    const d = await en((tx) => obtenerOrden(tx, o.id))
    expect(d).toMatchObject({ estado: 'informe', cierreTecnico: 'ok', contador: 1500, solucion: 'Cambio de rodillo' })
    expect(d?.visitas).toHaveLength(1)
    expect(d?.llegadaLat).toBe('-34.600000')
    expect(await en((tx) => saldoDe(tx, toner, camioneta))).toBe('-1.0000')
    const [item] = await en((tx) => tx.select().from(ordenesServicioItems).where(eq(ordenesServicioItems.ordenId, o.id)))
    expect(item).toMatchObject({ depositoId: camioneta, cantidad: '1.0000' })
    const [l] = await en((tx) => tx.select().from(lecturas).where(eq(lecturas.equipoId, equipo)))
    expect(l).toMatchObject({ contador: 1500, creditos: 20, origen: 'tecnico' })

    // No se informa dos veces; el supervisor cierra con desvío (pide nota).
    expect((await en((tx) => informarOrden(tx, U, o.id, base))).ok).toBe(false)
    expect(await en((tx) => cerrarOrden(tx, U, o.id, { fecha: '2026-10-09', cierre: 'desvio' }))).toMatchObject({
      error: expect.stringContaining('desvío'),
    })
    expect(
      (await en((tx) => cerrarOrden(tx, U, o.id, { fecha: '2026-10-09', cierre: 'desvio', nota: 'Falta cambiar la bandeja' })))
        .ok,
    ).toBe(true)
    expect((await en((tx) => obtenerOrden(tx, o.id)))?.estado).toBe('cerrada_desvio')
    expect((await en((tx) => reabrirOrden(tx, U, o.id))).ok).toBe(true)
    expect((await en((tx) => obtenerOrden(tx, o.id)))?.estado).toBe('asignada')
  })

  it('cambiar el formulario crea una versión nueva; las órdenes viejas siguen con la suya; las versiones no se tocan', async () => {
    const antes = await en((tx) => obtenerTipo(tx, correctivo))
    const devolucion = [...antes!.plantilla!.devolucion, { id: 'extra', tipo: 'texto', etiqueta: 'Extra' }]
    const r = await en((tx) =>
      guardarTipo(tx, U, { ...antes, instrucciones: antes!.plantilla!.instrucciones, devolucion }, correctivo),
    )
    expect(r).toMatchObject({ ok: true, version: 2 })
    // Guardar lo mismo no crea otra.
    expect(
      await en((tx) => guardarTipo(tx, U, { ...antes, instrucciones: antes!.plantilla!.instrucciones, devolucion }, correctivo)),
    ).toMatchObject({
      version: 2,
    })
    const [vieja] = await en((tx) => tx.select().from(ordenesServicio).limit(1))
    expect(vieja.plantillaId).toBe(antes!.plantilla!.id)
    await expect(
      en((tx) => tx.update(plantillasOrden).set({ version: 9 }).where(eq(plantillasOrden.tipoId, correctivo))),
    ).rejects.toThrow()
  })

  it('preventivo mensual y por copias, sin duplicar', async () => {
    const prev = (await en((tx) => tx.select().from(tiposOrden).where(eq(tiposOrden.codigo, 'PREV'))))[0].id
    const m = await en((tx) =>
      guardarRegla(tx, U, {
        terceroId: cliente,
        equipoId: equipo,
        tipoOrdenId: prev,
        frecuencia: 'mensual',
        cada: 1,
        desde: '2026-10-15',
        hora: '09:00',
        tecnicoId: tecnico,
      }),
    )
    if (!m.ok) throw new Error(m.error)
    const c = await en((tx) =>
      guardarRegla(tx, U, {
        terceroId: cliente,
        equipoId: equipo,
        tipoOrdenId: prev,
        frecuencia: 'copias',
        cada: 5000,
        desde: '2026-10-01',
      }),
    )
    if (!c.ok) throw new Error(c.error)

    // Hasta el 14/11: la del 15/10 y nada más; las copias todavía no llegan (base 1500).
    expect(await en((tx) => generarPreventivos(tx, U, 30, '2026-10-15'))).toEqual({ creadas: 1, errores: [] })
    expect(await en((tx) => generarPreventivos(tx, U, 30, '2026-10-15'))).toEqual({ creadas: 0, errores: [] })
    expect(await en((tx) => generarPreventivos(tx, U, 31, '2026-10-15'))).toEqual({ creadas: 1, errores: [] })

    await en((tx) => registrarLectura(tx, U, { equipoId: equipo, fecha: '2026-10-20', contador: 6600 }))
    expect(await en((tx) => generarPreventivos(tx, U, 0, '2026-10-20'))).toEqual({ creadas: 1, errores: [] })
    // Ya hay una abierta de esa regla: no se abre otra aunque siga sumando.
    await en((tx) => registrarLectura(tx, U, { equipoId: equipo, fecha: '2026-10-25', contador: 12000 }))
    expect(await en((tx) => generarPreventivos(tx, U, 0, '2026-10-25'))).toEqual({ creadas: 0, errores: [] })

    const generadas = await en((tx) => tx.select().from(ordenesServicio).where(eq(ordenesServicio.tipo, 'preventivo')))
    expect(generadas.map((g) => g.estado).sort()).toEqual(['asignada', 'asignada', 'pendiente'])
  })
})
