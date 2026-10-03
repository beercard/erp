import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, equipos, ordenesServicio, tecnicos, terceros } from '../../db/schema'
import { facturarOrden, obtenerOrden, resumenOrdenes } from '../servicio/servicio'
import {
  claseDeTarea,
  colorDe,
  importarPersat,
  normalizarCodigo,
  normalizarNombre,
  plantillaDesdeEsquema,
  separarSerieModelo,
  seParecen,
  vincularCliente,
} from './persat'
import type { DatosPersat, EsquemaOtPersat, OrdenPersat } from './persatApi'

const U = '00000000-0000-4000-8000-000000000001'

const ESQUEMA: EsquemaOtPersat = {
  wo_group: 1,
  wo_shema_id: 12,
  version: 12,
  production: true,
  name: 'Servicio para Tecnicos',
  default_service_time: 60,
  instructions_description: {
    widgets: [
      { id: 'FWsec1', title: 'Datos', widget_type: 'NEW_SECTION' },
      {
        id: 'FWtarea',
        title: 'TIPO DE TAREA',
        widget_type: 'DROPDOWN_SELECTION',
        description: { options: ['MANTENIMIENTO PROPIOS', 'TOMA DE CONTADOR', 'DIAGNOSTICO'] },
      },
      { id: 'FWfecha', title: 'Fecha Asignacion', widget_type: 'DATE_FIELD' },
      { id: 'FWequipo', title: 'Equipo', widget_type: 'CLIENT_OBJECT_DROPDOWN', description: { obj_id: 1 } },
      { id: 'FWdetalle', title: 'Detalle', widget_type: 'TEXT_PARAGRAPH' },
    ],
  },
  results_description: {
    widgets: [
      {
        id: 'FWestado',
        title: 'Estado',
        widget_type: 'LABEL_FIELD',
        description: {
          options: [
            { color: 'GREEN', option_name: 'Realizado' },
            { color: 'ORANGE', option_name: 'Parcialmente Realizado' },
          ],
        },
      },
      { id: 'FWllega', title: 'Hora Llegada', widget_type: 'TIME_FIELD' },
      { id: 'FWmedidor', title: 'Detalle de Medidor', widget_type: 'NUMBER_FIELD' },
      {
        id: 'FWtoner',
        title: 'Cantidad de toner',
        widget_type: 'POWER_TABLE_FIELD',
        description: {
          cols: [
            { name: 'AMARILLO', type: 'NUMBER' },
            { name: 'NEGRO', type: 'NUMBER' },
          ],
        },
      },
      { id: 'FWfotos', title: 'Fotos', widget_type: 'MULTIPLE_IMAGES_FIELD' },
      {
        id: 'FWtrab',
        title: 'Trabajos Realizados',
        widget_type: 'MULTIPLE_SELECTION',
        description: { options: ['Mantenimiento', 'Reparación'] },
      },
      { id: 'FWpend', title: 'Tareas Pendientes', widget_type: 'TEXT_PARAGRAPH' },
      { id: 'FWfirma', title: 'Firma Digital del Cliente', widget_type: 'SIGNATURE_FIELD' },
      { id: 'FWraro', title: 'Algo raro', widget_type: 'WIDGET_NUEVO' },
    ],
  },
}

const orden = (id: number, uid: string, estado: string, extra: Partial<OrdenPersat['wo_data']> = {}): OrdenPersat => ({
  _id: id,
  state: estado,
  created: '2026-09-01T12:00:00.000Z',
  labels_ids: [1],
  client: { id, name: 'x', uid_client: uid },
  assignation_info: {
    date: '2026-09-02T03:00:00.000Z',
    starts_min: 600,
    responsibles: [
      { user_id: 7, user_name: 'Juan' },
      { user_id: 8, user_name: 'Ana' },
    ],
  },
  wo_data: {
    schema_id: 12,
    service_time: 45,
    instructions: {
      formvalues: {
        FWtarea: 'MANTENIMIENTO PROPIOS',
        FWfecha: '2026-09-02T00:00:00.000Z',
        FWequipo: { '1': 'L123456789         RICOH AFICIO MP4002', '2': '1000' },
        FWdetalle: 'Hace ruido al imprimir',
        FWviejo: 'De una versión anterior',
      },
    },
    results: {
      last_updated: '2026-09-02T15:30:00.000Z',
      formvalues: {
        FWestado: 'Parcialmente Realizado',
        FWllega: 615,
        FWmedidor: 125000,
        FWtoner: [['0', '2']],
        FWfotos: ['https://s3.ejemplo/foto1.jpg'],
        FWtrab: ['Mantenimiento'],
        FWpend: 'Cambiar el fusor',
        FWfirma: 'THERE_IS_IMAGE',
      },
      closing_info: { cause: 'REMITO 9567' },
    },
    ...extra,
  },
})

describe('reglas de la migración desde Persat', () => {
  it('nombres, códigos, series y colores', () => {
    expect(normalizarNombre('Estudio Pérez S.A.')).toBe('ESTUDIO PEREZ')
    expect(normalizarNombre('ESTUDIO PEREZ SRL')).toBe('ESTUDIO PEREZ')
    expect(normalizarCodigo('0012')).toBe('12')
    expect(normalizarCodigo('CLP - 1234')).toBe('CLP-1234')
    expect(seParecen('Clínica del Litoral S.A.', 'CLINICA LITORAL')).toBe(true)
    expect(seParecen('Panadería Sol', 'Ferretería Luna')).toBe(false)
    expect(separarSerieModelo('L123456789         RICOH AFICIO MP4002')).toEqual({
      serie: 'L123456789',
      modelo: 'RICOH AFICIO MP4002',
    })
    expect(separarSerieModelo('W123P456789 MP 301SPF')).toEqual({ serie: 'W123P456789', modelo: 'MP 301SPF' })
    expect(separarSerieModelo('RICOH 123456')).toEqual({ serie: '123456', modelo: 'RICOH' })
    expect(separarSerieModelo('   ')).toBeNull()
    expect(colorDe('GREEN_3')).toBe('#16a34a')
    expect(colorDe('MARRON')).toBe('#6b7280')
    expect(claseDeTarea('TOMA DE CONTADOR')).toBe('preventivo')
    expect(claseDeTarea('REEMPLAZO INSUMOS')).toBe('insumos')
    expect(claseDeTarea('ENTREGA DE EQUIPOS')).toBe('instalacion')
    expect(claseDeTarea('DIAGNOSTICO')).toBe('correctivo')
  })

  it('arma el tipo de orden con los mismos campos', () => {
    const p = plantillaDesdeEsquema(ESQUEMA)
    expect(p.instrucciones.map((c) => c.tipo)).toEqual(['seccion', 'seleccion', 'fecha', 'equipo', 'parrafo'])
    expect(p.devolucion.map((c) => c.tipo)).toEqual([
      'seleccion',
      'hora',
      'contador',
      'tabla',
      'fotos',
      'multiple',
      'parrafo',
      'firma',
    ])
    expect(p.devolucion[0].opciones).toEqual(['Realizado', 'Parcialmente Realizado'])
    expect(p.omitidos).toEqual(['Algo raro (WIDGET_NUEVO)'])
    expect(p.instrucciones[1].id).toBe('p_fwtarea')
  })
})

describe('importación de una cuenta de Persat', () => {
  let empresa: string
  let estudio: string
  let equipoErp: string
  let juan: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)
  const datos = (): DatosPersat => ({
    clientes: [
      { uid_client: '12', company_name: 'ESTUDIO PEREZ SA' }, // por código
      { uid_client: '99', company_name: 'Clínica del Litoral' }, // por nombre
      { uid_client: '50', company_name: 'Panadería Sol' }, // código de otro cliente con otro nombre
      { uid_client: 'XX1', company_name: 'Cliente Nuevo' }, // sin pareja
      { uid_client: '12 SUCURSAL CENTRO', company_name: 'Estudio Perez - Centro' }, // sucursal del 12
    ],
    tiposCliente: [],
    camposCliente: [],
    objetos: [
      {
        obj_id: 1,
        name: 'Equipos',
        fields: [
          { id: 1, name: 'Serie - Modelo', type: 'TEXT' },
          { id: 5, name: 'Ubicacion', type: 'TEXT' },
        ],
      },
    ],
    equipos: [
      { uid_client: '12', obj_id: 1, fields: { '1': 'L123456789         RICOH AFICIO MP4002', '5': 'Recepción' } },
      { uid_client: '99', obj_id: 1, fields: { '1': 'V999999999 RICOH MP2014', '5': 'Piso 2' } },
      { uid_client: 'XX1', obj_id: 1, fields: { '1': 'Z111 OTRO' } },
    ],
    tecnicos: [
      { user_id: 7, name: 'juan', real_name: 'Juan Gómez' },
      { user_id: 8, name: 'ana', real_name: 'Ana Ruiz' },
    ],
    etiquetas: [
      { id: 1, name: 'SERVICIO CONTRATO', color: 'GREEN_3' },
      { id: 4, name: 'URGENTE', color: 'RED' },
    ],
    esquemasOt: [ESQUEMA],
    ordenes: [orden(1001, '12', 'CERRADA_CON_DESVIO'), orden(1002, '99', 'INFORME'), orden(1003, 'XX1', 'CERRADA_OK')],
  })

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Copiadora S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    await en(async (tx) => {
      const ts = await tx
        .insert(terceros)
        .values([
          { codigo: '12', razonSocial: 'Estudio Pérez S.A.', tipoDocumento: 80, numeroDocumento: '30999176522', condicionIva: 1 },
          { codigo: '40', razonSocial: 'Clínica del Litoral S.A.', tipoDocumento: 99, condicionIva: 5 },
          { codigo: '50', razonSocial: 'Ferretería Luna', tipoDocumento: 99, condicionIva: 5 },
        ])
        .returning()
      estudio = ts[0].id
      equipoErp = (await tx.insert(equipos).values({ serie: 'L123456789', terceroId: estudio }).returning())[0].id
      juan = (await tx.insert(tecnicos).values({ codigo: 'T1', nombre: 'Juan Gómez' }).returning())[0].id
    })
  })

  it('empareja, crea lo que falta y migra las órdenes con sus respuestas', async () => {
    const bajadas: string[] = []
    const r = await en((tx) =>
      importarPersat(tx, U, datos(), {
        bajarFoto: async (url) => {
          bajadas.push(url)
          return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
        },
      }),
    )
    expect(r.clientes).toEqual({ porVinculo: 0, porCodigo: 2, porNombre: 1, creados: 0, sinPareja: 2 })
    expect(r.clientesSinPareja.map((c) => [c.uid, c.motivo.slice(0, 20)])).toEqual([
      ['50', 'el código coincide c'],
      ['XX1', 'no hay un cliente co'],
    ])
    expect(r.equipos).toEqual({ porVinculo: 0, porSerie: 1, creados: 1, sinCliente: 1 })
    expect(r.tecnicos).toEqual({ vinculados: 1, creados: 1 })
    expect(r.etiquetas).toEqual({ vinculadas: 0, creadas: 2 })
    expect(r.tipoOrden).toEqual({ creado: true, nuevaVersion: false })
    expect(r.ordenes).toEqual({ nuevas: 2, actualizadas: 0, sinCliente: 1, fotos: 2 })
    expect(r.avisos).toContain('Campo sin equivalente en el ERP: Algo raro (WIDGET_NUEVO).')
    expect(bajadas).toHaveLength(2)

    const [fila] = await en((tx) => tx.select().from(ordenesServicio).where(eq(ordenesServicio.terceroId, estudio)))
    const o = (await en((tx) => obtenerOrden(tx, fila.id)))!
    expect(o).toMatchObject({
      estado: 'cerrada_desvio',
      origen: 'persat',
      tipo: 'preventivo',
      cobertura: 'contrato',
      prioridad: 'normal',
      equipoId: equipoErp,
      tecnicoId: juan,
      programada: '2026-09-02',
      hora: '10:00',
      duracion: 45,
      contador: 125000,
      falla: 'Hace ruido al imprimir',
      solucion: 'Mantenimiento',
      cierreTecnico: 'desvio',
      fechaResolucion: '2026-09-02',
    })
    expect(o.notaCierre).toContain('REMITO 9567')
    expect(o.notaCierre).toContain('Pendiente: Cambiar el fusor')
    expect(o.notaCierre).toContain('firmó en Persat')
    expect(o.observaciones).toContain('Persat N° 1001')
    expect(o.observaciones).toContain('De una versión anterior')
    expect(o.acompanantes.map((t) => t.nombre)).toEqual(['Ana Ruiz'])
    expect(o.etiquetas.map((e) => e.nombre)).toEqual(['SERVICIO CONTRATO'])
    expect(o.resultados).toMatchObject({
      p_fwestado: 'Parcialmente Realizado',
      p_fwllega: '10:15',
      p_fwmedidor: { contador: 125000, creditos: 0 },
      p_fwtoner: [['0', '2']],
      p_fwtrab: ['Mantenimiento'],
    })
    expect((o.resultados as Record<string, string[]>).p_fwfotos).toHaveLength(1)
    expect(o.archivos).toHaveLength(1)
    expect(o.llegada?.toISOString()).toBe('2026-09-02T13:15:00.000Z')
  })

  it('correrla de nuevo actualiza sin duplicar, y respeta los vínculos hechos a mano', async () => {
    const d = datos()
    d.ordenes[1] = { ...orden(1002, '99', 'CERRADA_OK'), labels_ids: [] }
    const r = await en((tx) => importarPersat(tx, U, d, { bajarFoto: async () => Buffer.from([0xff, 0xd8, 0xff]) }))
    expect(r.clientes.porVinculo).toBe(3)
    expect(r.equipos.porVinculo).toBe(2)
    expect(r.ordenes).toMatchObject({ nuevas: 0, actualizadas: 2, fotos: 0 })
    expect(r.tipoOrden).toEqual({ creado: false, nuevaVersion: false })
    const todas = await en((tx) => tx.select().from(ordenesServicio))
    expect(todas).toHaveLength(2)
    expect(todas.find((x) => x.estado === 'cerrada_ok')).toBeTruthy()
    // Con cargo y cerrada en Persat: se facturó en el sistema anterior, no queda para facturar.
    const conCargo = todas.find((x) => x.estado === 'cerrada_ok')!
    expect(conCargo.cobertura).toBe('cargo')
    expect((await en((tx) => resumenOrdenes(tx))).porFacturar).toBe(0)
    expect(await en((tx) => facturarOrden(tx, U, conCargo.id, { puntoVenta: 1, fecha: '2026-10-01' }))).toMatchObject({
      ok: false,
      error: expect.stringContaining('Persat'),
    })
    // La foto ya bajada se conserva.
    expect(todas.every((x) => ((x.resultados as Record<string, string[]>)?.p_fwfotos ?? []).length === 1)).toBe(true)

    // El que no tenía pareja se vincula a mano y la próxima vez entra con sus órdenes.
    expect(await en((tx) => vincularCliente(tx, '50', estudio))).toEqual({ ok: true })
    const r2 = await en((tx) => importarPersat(tx, U, datos(), { crearClientes: true }))
    expect(r2.clientes).toMatchObject({ porVinculo: 4, creados: 1, sinPareja: 0 })
    expect(r2.ordenes.nuevas).toBe(1)
    const nuevo = await en((tx) => tx.select().from(terceros).where(eq(terceros.codigo, 'PS-XX1')))
    expect(nuevo[0]).toMatchObject({ razonSocial: 'Cliente Nuevo', tipoDocumento: 99 })
  })
})
