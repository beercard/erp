import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { correos, crmActividades, crmOportunidades, empresas, membresias, roles, usuarios } from '../../db/schema'
import { guardarOportunidad, obtenerOportunidad, tablero } from './crm'
import {
  activarFormulario,
  actualizarCampo,
  aplicarPlantilla,
  asignarVarias,
  enviarEmail,
  guardarAjustes,
  guardarPlantilla,
  listarPlantillas,
  moverVarias,
  recibirConsulta,
  registrarLlamada,
  resumenDiario,
} from './extras'
import { asegurarEtapas } from './crm'

describe('CRM: plantillas, llamadas, edición en línea, formulario web y resumen', () => {
  let empresa: string
  let ana: string
  let beto: string
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa({ empresa: { id: empresa }, usuario: { id: ana } }, f)
  const ok = <T extends { ok: boolean }>(r: T) => {
    if (!r.ok) throw new Error(JSON.stringify(r))
    return r as Extract<T, { ok: true }>
  }
  let op: string

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Ventas S.A.', cuit: '30715974823', condicionIva: 1 }).returning()
    empresa = e.id
    ;[ana, beto] = (
      await db
        .insert(usuarios)
        .values([
          { email: 'ana@ventas.com', nombre: 'Ana Gómez', hashClave: 'x' },
          { email: 'beto@ventas.com', nombre: 'Beto Ruiz', hashClave: 'x' },
        ])
        .returning()
    ).map((u) => u.id)
    const [rol] = await db.select().from(roles).where(eq(roles.nombre, 'Ventas'))
    await db.insert(membresias).values([
      { usuarioId: ana, empresaId: empresa, rolId: rol.id },
      { usuarioId: beto, empresaId: empresa, rolId: rol.id },
    ])
    op = ok(
      await en((tx) =>
        guardarOportunidad(tx, ana, {
          titulo: 'Fotocopiadoras',
          empresaProspecto: 'Estudio Pérez',
          contacto: 'Laura Pérez',
          email: 'laura@perez.com',
        }),
      ),
    ).id
  })

  it('plantillas: trae las de fábrica, valida y completa variables', async () => {
    const todas = await en((tx) => listarPlantillas(tx))
    expect(todas.length).toBeGreaterThanOrEqual(3)
    expect((await en((tx) => guardarPlantilla(tx, { nombre: 'X', canal: 'email', texto: 'Hola {contacto}' }))).ok).toBe(false)
    ok(await en((tx) => guardarPlantilla(tx, { nombre: 'Hola', canal: 'whatsapp', texto: 'Hola {contacto}' })))
    expect(aplicarPlantilla('Hola {contacto}, soy {vendedor} {otra}', { contacto: 'Laura', vendedor: 'Ana' })).toBe(
      'Hola Laura, soy Ana {otra}',
    )
    expect(aplicarPlantilla('Soy de {empresa}. Saludos... ', { empresa: 'Norte S.A.' })).toBe('Soy de Norte S.A. Saludos... ')
  })

  it('registrar una llamada la deja hecha y en el historial', async () => {
    expect((await en((tx) => registrarLlamada(tx, ana, op, { desenlace: 'x' }))).ok).toBe(false)
    ok(await en((tx) => registrarLlamada(tx, ana, op, { desenlace: 'no_atendio', nota: 'Volver a llamar el lunes' })))
    const o = await en((tx) => obtenerOportunidad(tx, op))
    expect(o!.actividades[0]).toMatchObject({ tipo: 'llamada', hecha: true, resultado: 'No atendió — Volver a llamar el lunes' })
    expect(o!.historial[0]).toMatchObject({ tipo: 'llamada', texto: 'Llamada (no atendió): Volver a llamar el lunes' })
    // La tarjeta del embudo cuenta notas y mensajes (no los cambios).
    const columnas = await en((tx) => tablero(tx))
    expect(columnas.flatMap((c) => c.oportunidades).find((x) => x.id === op)).toMatchObject({ notas: 1, pendientes: 0 })
  })

  it('el email sale por la bandeja de correos y queda en el historial', async () => {
    expect((await en((tx) => enviarEmail(tx, ana, op, { para: 'mal', asunto: 'Hola', texto: 'Hola' }))).ok).toBe(false)
    ok(
      await en((tx) =>
        enviarEmail(tx, ana, op, { para: 'laura@perez.com', asunto: 'Propuesta', texto: 'Te envío la propuesta.' }),
      ),
    )
    const c = await en((tx) => tx.select().from(correos).where(eq(correos.entidadId, op)))
    expect(c).toHaveLength(1)
  })

  it('edición en línea: valida igual que el formulario', async () => {
    ok(await en((tx) => actualizarCampo(tx, ana, op, 'ingresoEsperado', '2.500.000')))
    expect((await en((tx) => actualizarCampo(tx, ana, op, 'email', 'no-es-email'))).ok).toBe(false)
    expect((await en((tx) => actualizarCampo(tx, ana, op, 'estado', 'ganada'))).ok).toBe(false)
    expect(await en((tx) => obtenerOportunidad(tx, op))).toMatchObject({
      ingresoEsperado: '2500000.00',
      email: 'laura@perez.com',
    })
  })

  it('acciones masivas: mover y asignar varias', async () => {
    const otra = ok(await en((tx) => guardarOportunidad(tx, ana, { titulo: 'Toner', contacto: 'Juan' }))).id
    const etapas = await en((tx) => asegurarEtapas(tx))
    expect(await en((tx) => moverVarias(tx, ana, [op, otra], etapas[1].id))).toEqual({ ok: true, movidas: 2 })
    expect(await en((tx) => asignarVarias(tx, ana, [op, otra], beto))).toEqual({ ok: true, asignadas: 2 })
    const filas = await en((tx) => tx.select().from(crmOportunidades))
    expect(filas.every((f) => f.responsableId === beto && f.etapaId === etapas[1].id)).toBe(true)
  })

  it('formulario web: crea la oportunidad, la reparte en rueda y agenda responder hoy', async () => {
    expect((await recibirConsulta('no-existe', { nombre: 'X', email: 'x@x.com' })).ok).toBe(false)
    const token = await activarFormulario(empresa)
    expect(await activarFormulario(empresa)).toBe(token)
    expect(await recibirConsulta(token, { nombre: 'Pedro' })).toEqual({
      ok: false,
      error: 'Dejanos un email o un teléfono para responderte.',
    })
    ok(await en((tx) => guardarAjustes(tx, { asignacion: 'rotativa', vendedores: [ana, beto] })))
    const r1 = ok(
      await recibirConsulta(token, {
        nombre: 'Pedro Díaz',
        empresa: 'Kiosco Sur',
        telefono: '1155551234',
        mensaje: 'Precio de una impresora',
      }),
    )
    const r2 = ok(await recibirConsulta(token, { nombre: 'Marta', email: 'marta@x.com' }))
    const [o1, o2] = await en(async (tx) => [await obtenerOportunidad(tx, r1.id), await obtenerOportunidad(tx, r2.id)])
    expect(o1).toMatchObject({ responsableId: ana, origen: 'Formulario web', etiquetas: ['web'], contacto: 'Pedro Díaz' })
    expect(o2!.responsableId).toBe(beto)
    expect(o1!.actividades[0]).toMatchObject({ tipo: 'llamada', resumen: 'Responder la consulta del sitio', responsableId: ana })
    const nueva = await activarFormulario(empresa, true)
    expect(nueva).not.toBe(token)
    expect((await recibirConsulta(token, { nombre: 'X', email: 'x@x.com' })).ok).toBe(false)
  })

  it('resumen diario: un email por persona con lo vencido y de hoy, una vez por día', async () => {
    await en((tx) =>
      tx.update(crmActividades).set({ vence: '2026-01-01' }).where(eq(crmActividades.resumen, 'Responder la consulta del sitio')),
    )
    const r = await en((tx) => resumenDiario(tx, empresa, '2026-10-03'))
    expect(r.enviados).toBe(2)
    expect((await en((tx) => resumenDiario(tx, empresa, '2026-10-03'))).enviados).toBe(0)
    const c = await en((tx) => tx.select().from(correos).where(eq(correos.entidad, 'crm_resumen')))
    expect(c.map((x) => x.para).sort()).toEqual(['ana@ventas.com', 'beto@ventas.com'])
    expect(c[0].texto).toContain('[vencida]')
  })
})
