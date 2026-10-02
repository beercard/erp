import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  archivosServicio,
  empresas,
  enviosFormulario,
  tecnicos,
  terceros,
  usuariosPortal,
  webhookEntregas,
} from '../../db/schema'
import { guardarEquipo } from '../contratos/contratos'
import { guardarWebhook } from '../integraciones/webhooks'
import { escribirXlsx, leerXlsx } from '../../lib/xlsx'
import { guardarArchivoEnvio } from './archivos'
import { reporteFormulario } from './reportes'
import {
  bandeja,
  borradorDe,
  borrarEstado,
  cambiarEstadoEnLote,
  cambiarEstadoEnvio,
  historialDeEnvio,
  crearModelosSueltos,
  empezarEnvio,
  enviarFormulario,
  enviosDelCliente,
  guardarBorrador,
  guardarEstado,
  guardarFormulario,
  listarFormularios,
  obtenerEnvio,
  pendientesBandeja,
  type Autor,
} from './sueltos'

const U = '00000000-0000-4000-8000-000000000001'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

describe('formularios sueltos y bandeja', () => {
  let empresa: string
  let clienteA: string
  let clienteB: string
  let equipoB: string
  let tecnico: string
  let portal: Autor
  const oficina: Autor = { quien: 'oficina', usuarioId: U }
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)
  const formulario = async (codigo: string) => (await en((tx) => listarFormularios(tx))).find((f) => f.codigo === codigo)!

  beforeAll(async () => {
    process.env.WEBHOOKS_PERMITIR_LOCAL = '1'
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Formas S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
    empresa = e.id
    await en(async (tx) => {
      await tx.insert(terceros).values([
        { codigo: 'A', razonSocial: 'Estudio A', tipoDocumento: 99, condicionIva: 5 },
        { codigo: 'B', razonSocial: 'Clínica B', tipoDocumento: 99, condicionIva: 5 },
      ])
      await tx.insert(tecnicos).values({ codigo: 'T1', nombre: 'Martín' })
    })
    const ts = await en((tx) => tx.select().from(terceros))
    clienteA = ts.find((t) => t.codigo === 'A')!.id
    clienteB = ts.find((t) => t.codigo === 'B')!.id
    ;[{ id: tecnico }] = await en((tx) => tx.select().from(tecnicos))
    const eq1 = await en((tx) => guardarEquipo(tx, U, { serie: 'EQB', terceroId: clienteB, comercializacion: 'venta' }))
    if (!eq1.ok) throw new Error(eq1.error)
    equipoB = eq1.id
    const [u] = await en((tx) => tx.insert(usuariosPortal).values({ terceroId: clienteA, email: 'a@a.test' }).returning())
    portal = { quien: 'portal', usuarioPortalId: u.id, terceroId: clienteA }
    expect(await en((tx) => crearModelosSueltos(tx, U))).toBe(3)
    expect(await en((tx) => crearModelosSueltos(tx, U))).toBe(0)
  })

  it('valida la definición', async () => {
    const r = await en((tx) =>
      guardarFormulario(tx, U, {
        codigo: 'X',
        nombre: 'Con stock',
        campos: [{ id: 'm', tipo: 'materiales', etiqueta: 'Materiales' }],
      }),
    )
    expect(r).toMatchObject({ ok: false })
    const sinCliente = await en((tx) =>
      guardarFormulario(tx, U, {
        codigo: 'Y',
        nombre: 'Equipo',
        pideCliente: false,
        campos: [{ id: 'e', tipo: 'equipo', etiqueta: 'Equipo' }],
      }),
    )
    expect(sinCliente).toMatchObject({ ok: false })
    // Cambiar los campos sube la versión; cambiar el nombre, no.
    const f = await formulario('RELEV')
    const mismo = await en((tx) => guardarFormulario(tx, U, { ...f, nombre: 'Relevamiento' }, f.id))
    expect(mismo).toMatchObject({ ok: true, version: 1 })
    const otro = await en((tx) => guardarFormulario(tx, U, { ...f, campos: f.campos.slice(0, 2) }, f.id))
    expect(otro).toMatchObject({ ok: true, version: 2 })
    expect((await en((tx) => listarFormularios(tx, 'portal'))).map((x) => x.codigo)).toEqual(['PRESUP'])
  })

  it('el técnico manda un checklist con foto y entra a la bandeja como "Nuevo"', async () => {
    const autor: Autor = { quien: 'tecnico', usuarioId: U, tecnicoId: tecnico }
    const w = await en((tx) => guardarWebhook(tx, U, { url: 'http://127.0.0.1:9/x', eventos: ['formulario.enviado'] }))
    expect(w.ok).toBe(true)
    const f = await formulario('VEHIC')
    const b = await en((tx) => empezarEnvio(tx, f.id, autor))
    if (!b.ok) throw new Error(b.error)
    const foto = await en((tx) => guardarArchivoEnvio(tx, U, b.id, 'foto', PNG))
    const sobra = await en((tx) => guardarArchivoEnvio(tx, U, b.id, 'foto', PNG))
    if (!foto.ok || !sobra.ok) throw new Error('foto')
    await en((tx) => guardarBorrador(tx, b.id, autor, { km: '1000' }))
    expect((await en((tx) => borradorDe(tx, b.id, autor)))!.valores).toEqual({ km: '1000' })
    // Otro no ve el borrador.
    expect(await en((tx) => borradorDe(tx, b.id, oficina))).toBeNull()

    // Falta lo condicional.
    const falta = await en((tx) =>
      enviarFormulario(tx, b.id, autor, { valores: { km: '1000', combustible: 'Lleno', problema: 'Sí' } }),
    )
    expect(falta).toMatchObject({ ok: false, error: expect.stringContaining('¿Cuál?') })
    const r = await en((tx) =>
      enviarFormulario(tx, b.id, autor, {
        valores: { km: '1000', combustible: 'Lleno', problema: 'Sí', cual: 'Luz de freno', fotos: [foto.id] },
      }),
    )
    expect(r).toMatchObject({ ok: true, numero: 1 })
    // La foto que sacó no queda; ya no se puede subir más.
    const fotos = await en((tx) => tx.select().from(archivosServicio).where(eq(archivosServicio.envioId, b.id)))
    expect(fotos.map((x) => x.id)).toEqual([foto.id])
    expect(await en((tx) => guardarArchivoEnvio(tx, U, b.id, 'foto', PNG))).toMatchObject({ ok: false })
    expect(await en((tx) => enviarFormulario(tx, b.id, autor, {}))).toMatchObject({ ok: false })

    const e = (await en((tx) => obtenerEnvio(tx, b.id)))!
    expect(e).toMatchObject({ numero: 1, origen: 'tecnico', tecnico: 'Martín', estado: { nombre: 'Nuevo' } })
    const [w1] = await en((tx) => tx.select().from(webhookEntregas))
    expect(w1).toMatchObject({ evento: 'formulario.enviado', datos: { numero: 1, formulario: { codigo: 'VEHIC' } } })
  })

  it('el cliente pide un presupuesto desde el portal, solo con sus equipos', async () => {
    const f = await formulario('PRESUP')
    const b = await en((tx) => empezarEnvio(tx, f.id, portal))
    if (!b.ok) throw new Error(b.error)
    // Un equipo de otro cliente no vale.
    const ajeno = await en((tx) =>
      enviarFormulario(tx, b.id, portal, { terceroId: clienteB, valores: { que: 'Insumos', equipo: equipoB, detalle: 'Tóner' } }),
    )
    expect(ajeno).toMatchObject({ ok: false, error: expect.stringContaining('no es de ese cliente') })
    const r = await en((tx) =>
      enviarFormulario(tx, b.id, portal, { terceroId: clienteB, valores: { que: 'Un equipo nuevo', detalle: 'Una color A3' } }),
    )
    expect(r).toMatchObject({ ok: true, numero: 2 })
    const [e] = await en((tx) => tx.select().from(enviosFormulario).where(eq(enviosFormulario.id, b.id)))
    expect(e.terceroId).toBe(clienteA) // el del portal, no el que mandó
    expect(await en((tx) => enviosDelCliente(tx, clienteA))).toHaveLength(1)
    expect(await en((tx) => enviosDelCliente(tx, clienteB))).toHaveLength(0)
    // El portal no puede usar los formularios del técnico.
    const vehiculo = await formulario('VEHIC')
    expect(await en((tx) => empezarEnvio(tx, vehiculo.id, portal))).toMatchObject({ ok: false })
  })

  it('la oficina mueve los envíos por los estados de la bandeja', async () => {
    expect(await en((tx) => pendientesBandeja(tx))).toBe(2)
    const { estados, envios } = await en((tx) => bandeja(tx))
    expect(envios.map((e) => e.numero)).toEqual([2, 1])
    const resuelto = estados.find((e) => e.nombre === 'Resuelto')!
    expect(
      await en((tx) => cambiarEstadoEnvio(tx, U, envios[0].id, { estadoId: resuelto.id, nota: 'Le mandamos la cotización' })),
    ).toEqual({ ok: true })
    expect(await en((tx) => pendientesBandeja(tx))).toBe(1)
    expect((await en((tx) => bandeja(tx, { estado: resuelto.id }))).envios).toHaveLength(1)
    expect((await en((tx) => bandeja(tx, { estado: 'todos', q: 'estudio' }))).envios).toHaveLength(1)
    // Un estado en uso no se borra; uno nuevo inicial reemplaza al anterior.
    expect(await en((tx) => borrarEstado(tx, U, resuelto.id))).toMatchObject({ ok: false })
    const n = await en((tx) => guardarEstado(tx, U, { nombre: 'Recibido', color: '#0ea5e9', orden: 0, inicial: true }))
    expect(n.ok).toBe(true)
    const despues = (await en((tx) => bandeja(tx))).estados
    expect(despues.filter((e) => e.inicial).map((e) => e.nombre)).toEqual(['Recibido'])

    // Historial: quién y cuándo, desde que llegó.
    const h = await en((tx) => historialDeEnvio(tx, envios[0].id))
    expect(h.map((x) => [x.estado, x.autor, x.nota])).toEqual([
      [expect.any(String), 'Recibido del portal', null],
      ['Resuelto', 'Oficina', 'Le mandamos la cotización'],
    ])

    // Cambio en lote: los que ya estaban en ese estado no suman historial.
    const r = await en((tx) =>
      cambiarEstadoEnLote(
        tx,
        U,
        envios.map((e) => e.id),
        resuelto.id,
        'Ana',
      ),
    )
    expect(r).toEqual({ ok: true, cambiados: 1, iguales: 1 })
    expect(await en((tx) => pendientesBandeja(tx))).toBe(0)
    expect((await en((tx) => historialDeEnvio(tx, envios[1].id))).at(-1)).toMatchObject({ estado: 'Resuelto', autor: 'Ana' })
    expect(await en((tx) => historialDeEnvio(tx, envios[0].id))).toHaveLength(2)
    expect(await en((tx) => cambiarEstadoEnLote(tx, U, [], resuelto.id))).toMatchObject({ ok: false })
  })

  it('reporte en Excel del formulario, una columna por campo', async () => {
    const f = await formulario('VEHIC')
    const hoja = (await en((tx) => reporteFormulario(tx, f.id, '2020-01-01', '2099-12-31')))!
    const leida = await leerXlsx(escribirXlsx([hoja]))
    expect(leida[0]).toEqual(expect.arrayContaining(['N°', 'Kilómetros', 'Combustible', '¿Cuál?', 'Fotos']))
    const fila = leida[1]
    const col = (t: string) => fila[leida[0].indexOf(t)]
    expect(col('N°')).toBe('1')
    expect(col('Kilómetros')).toBe('1000')
    expect(col('¿Cuál?')).toBe('Luz de freno')
    expect(col('Fotos')).toBe('1 foto')
    expect(col('De')).toBe('Técnico')
  })
})
