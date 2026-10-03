import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  archivosServicio,
  correos,
  empresas,
  equipos,
  lecturas,
  ordenesServicio,
  suscripciones,
  terceros,
  tiposOrden,
} from '../../db/schema'
import { guardarEquipo } from '../contratos/contratos'
import { guardarConfiguracion, obtenerConfiguracion } from '../servicio/configuracion'
import { guardarOrden } from '../servicio/servicio'
import { crearModelos } from '../servicio/tiposOrden'
import {
  aceptarInvitacion,
  archivoDelCliente,
  cargarContadores,
  habilitarUsuarioPortal,
  ingresarAlPortal,
  invitarAlPortal,
  leerInvitacion,
  leerSesionPortal,
  ordenDelCliente,
  ordenesDelCliente,
  pedirServicio,
  type SesionPortal,
} from './portal'

const U = '00000000-0000-4000-8000-000000000001'
const CUIT = '30715974823'
const CLAVE = 'portal-cliente-2026'

describe('Portal de clientes', () => {
  let empresa: string
  let clienteA: string
  let clienteB: string
  let equipoA: string
  let equipoB: string
  let ordenB: string
  let sesion: SesionPortal
  const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)
  const config = async (cambios: Record<string, unknown>) => {
    const c = await en((tx) => obtenerConfiguracion(tx))
    const r = await en((tx) =>
      guardarConfiguracion(tx, U, { ...c, emailCoordinacion: c.emailCoordinacion ?? '', firma: c.firma ?? '', ...cambios }),
    )
    if (!r.ok) throw new Error(r.error)
  }

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Copiadora S.A.', cuit: CUIT, condicionIva: 1 }).returning()
    empresa = e.id
    await db.insert(suscripciones).values({ empresaId: empresa, plan: 'empresa', estado: 'activa', aplicaciones: ['contratos'] })
    await en(async (tx) => {
      await tx.insert(terceros).values([
        { codigo: 'A', razonSocial: 'Estudio A', tipoDocumento: 99, condicionIva: 5 },
        { codigo: 'B', razonSocial: 'Clínica B', tipoDocumento: 99, condicionIva: 5 },
      ])
      await crearModelos(tx, U)
    })
    const ts = await en((tx) => tx.select().from(terceros))
    clienteA = ts.find((t) => t.codigo === 'A')!.id
    clienteB = ts.find((t) => t.codigo === 'B')!.id
    const a = await en((tx) => guardarEquipo(tx, U, { serie: 'EQA', terceroId: clienteA, comercializacion: 'venta' }))
    const b = await en((tx) => guardarEquipo(tx, U, { serie: 'EQB', terceroId: clienteB, comercializacion: 'venta' }))
    if (!a.ok || !b.ok) throw new Error('equipos')
    equipoA = a.id
    equipoB = b.id
    const o = await en((tx) =>
      guardarOrden(tx, U, { fecha: '2026-10-01', terceroId: clienteB, equipoId: equipoB, falla: 'Atasca papel' }),
    )
    if (!o.ok) throw new Error(o.error)
    ordenB = o.id
    await config({ portal: true, emailCoordinacion: 'coordinacion@copiadora.test' })
  })

  it('invita, el cliente elige su contraseña y queda adentro', async () => {
    const r = await en((tx) =>
      invitarAlPortal(tx, U, empresa, 'https://erp.test', { terceroId: clienteA, email: 'Ana@Estudio.test', nombre: 'Ana' }),
    )
    if (!r.ok) throw new Error(r.error)
    const token = r.enlace.split('/portal/invitacion/')[1]
    const [mail] = await en((tx) => tx.select().from(correos).where(eq(correos.para, 'ana@estudio.test')))
    expect(mail.texto).toContain(r.enlace)
    expect(await leerInvitacion(token)).toMatchObject({ email: 'ana@estudio.test', cliente: 'Estudio A', nueva: true })

    // El mismo email no puede ser de otro cliente.
    const otro = await en((tx) =>
      invitarAlPortal(tx, U, empresa, 'https://erp.test', { terceroId: clienteB, email: 'ana@estudio.test', nombre: '' }),
    )
    expect(otro.ok).toBe(false)

    expect(await aceptarInvitacion(token, 'corta')).toMatchObject({ ok: false })
    const ok = await aceptarInvitacion(token, CLAVE)
    if (!ok.ok) throw new Error(ok.error)
    expect(await aceptarInvitacion(token, CLAVE)).toMatchObject({ ok: false }) // el enlace se usa una vez
    sesion = (await leerSesionPortal(ok.token))!
    expect(sesion).toMatchObject({ cliente: { id: clienteA, razonSocial: 'Estudio A' }, usuario: { email: 'ana@estudio.test' } })
  })

  it('ingresa con email y contraseña; el portal deshabilitado no deja', async () => {
    expect(await ingresarAlPortal(CUIT, 'ana@estudio.test', 'otra-clave-123')).toMatchObject({ ok: false })
    expect(await ingresarAlPortal(CUIT, 'nadie@estudio.test', CLAVE)).toMatchObject({ ok: false })
    expect(await ingresarAlPortal('20111111112', 'ana@estudio.test', CLAVE)).toMatchObject({ ok: false })
    const r = await ingresarAlPortal('30-71597482-3', ' ANA@estudio.test ', CLAVE)
    if (!r.ok) throw new Error(r.error)
    await config({ portal: false })
    expect(await leerSesionPortal(r.token)).toBeNull()
    expect(await ingresarAlPortal(CUIT, 'ana@estudio.test', CLAVE)).toMatchObject({ ok: false })
    await config({ portal: true })
    expect(await leerSesionPortal(r.token)).not.toBeNull()
  })

  it('cada cliente ve solo lo suyo', async () => {
    expect(await en((tx) => ordenDelCliente(tx, sesion, ordenB))).toBeNull()
    expect(await en((tx) => ordenesDelCliente(tx, clienteA))).toEqual([])
    const [f] = await en((tx) =>
      tx
        .insert(archivosServicio)
        .values({ ordenId: ordenB, clase: 'foto', tipoMime: 'image/png', tamano: 1, datos: Buffer.from([1]) })
        .returning(),
    )
    expect(await en((tx) => archivoDelCliente(tx, clienteA, f.id))).toBeNull()
    expect(await en((tx) => archivoDelCliente(tx, clienteB, f.id))).not.toBeNull()
    expect(await en((tx) => pedirServicio(tx, sesion, { equipoId: equipoB, falla: 'Quiero ver' }))).toMatchObject({ ok: false })
    const c = await en((tx) => cargarContadores(tx, sesion, [{ equipoId: equipoB, contador: '999' }]))
    expect(c).toMatchObject({ ok: true, cargadas: 0, errores: [{ error: 'Ese equipo no es tuyo.' }] })
  })

  it('pide servicio (tipos del portal) y carga contadores', async () => {
    // Sin tipos marcados para el portal, se pide sin tipo.
    await en((tx) => tx.update(tiposOrden).set({ portal: false }))
    const r = await en((tx) => pedirServicio(tx, sesion, { equipoId: equipoA, falla: 'No enciende', telefono: '11 5555-0000' }))
    if (!r.ok) throw new Error(r.error)
    const [o] = await en((tx) => tx.select().from(ordenesServicio).where(eq(ordenesServicio.id, r.id)))
    expect(o).toMatchObject({
      origen: 'portal',
      terceroId: clienteA,
      equipoId: equipoA,
      estado: 'pendiente',
      contacto: 'Ana',
      email: 'ana@estudio.test',
    })
    const avisos = await en((tx) => tx.select().from(correos).where(eq(correos.para, 'coordinacion@copiadora.test')))
    expect(avisos[0].asunto).toContain('Estudio A')
    expect(await en((tx) => ordenDelCliente(tx, sesion, r.id))).toMatchObject({ numero: o.numero })

    // Con tipos del portal, tiene que elegir uno de esos.
    const [tipo] = await en((tx) => tx.update(tiposOrden).set({ portal: true }).where(eq(tiposOrden.codigo, 'CORR')).returning())
    expect(await en((tx) => pedirServicio(tx, sesion, { falla: 'Otra cosa' }))).toMatchObject({ ok: false })
    const [otro] = await en((tx) => tx.select().from(tiposOrden).where(eq(tiposOrden.portal, false)).limit(1))
    expect(await en((tx) => pedirServicio(tx, sesion, { falla: 'Otra cosa', tipoOrdenId: otro.id }))).toMatchObject({ ok: false })
    const conTipo = await en((tx) =>
      pedirServicio(tx, sesion, {
        falla: 'Atasca',
        tipoOrdenId: tipo.id,
        equipoId: equipoA,
        instrucciones: { falla_reportada: 'Atasca en la bandeja 2' },
      }),
    )
    expect(conTipo).toMatchObject({ ok: true })

    const c = await en((tx) => cargarContadores(tx, sesion, [{ equipoId: equipoA, contador: '12.345' }]))
    expect(c).toMatchObject({ ok: true, cargadas: 1, errores: [] })
    const [l] = await en((tx) => tx.select().from(lecturas).where(eq(lecturas.equipoId, equipoA)))
    expect(l).toMatchObject({ contador: 12345, origen: 'portal' })
  })

  it('dar de baja al usuario corta la sesión', async () => {
    const r = await ingresarAlPortal(CUIT, 'ana@estudio.test', CLAVE)
    if (!r.ok) throw new Error(r.error)
    await en((tx) => habilitarUsuarioPortal(tx, U, sesion.usuario.id, false))
    expect(await leerSesionPortal(r.token)).toBeNull()
    expect(await ingresarAlPortal(CUIT, 'ana@estudio.test', CLAVE)).toMatchObject({ ok: false })
    expect(await en((tx) => tx.select().from(equipos))).toHaveLength(2)
  })
})
