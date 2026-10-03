import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import type { BaseDeDatos } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import {
  auditoria,
  auditoriaPlataforma,
  empresas,
  erroresServidor,
  eventosSuscripcion,
  membresias,
  roles,
  sesiones,
  suscripciones,
  usuarios,
} from '../../db/schema'
import { hashearClave } from '../../lib/auth/clave'
import { abrirSoporte, cerrarSoporte, elegirEmpresa, iniciarSesion, leerSesion, ROL_SOPORTE } from '../../lib/auth/sesiones'
import {
  agregarNota,
  archivarError,
  buscarEmpresas,
  cambiarActivoUsuario,
  cambiarBajaEmpresa,
  cambiarSuspension,
  cerrarSesionesDe,
  estadoOperacion,
  extenderPrueba,
  fichaEmpresa,
  importeDePago,
  listarAuditoria,
  listarUsuarios,
  metricas,
  ultimosMeses,
} from './consola'

const CLAVE = 'clave-prueba-2026'
let base: BaseDeDatos
let alfa: string
let beta: string
let gama: string
let admin: { id: string }
let duena: string

beforeAll(async () => {
  base = await baseDePrueba()
  const hash = await hashearClave(CLAVE)
  const [a, d] = await base
    .insert(usuarios)
    .values([
      { email: 'admin@plataforma.com', nombre: 'Admin', hashClave: hash, adminPlataforma: true },
      { email: 'duena@alfa.com', nombre: 'Dueña', hashClave: hash },
    ])
    .returning()
  admin = { id: a.id }
  duena = d.id
  const filas = await base
    .insert(empresas)
    .values([
      { razonSocial: 'Alfa S.A.', cuit: '30111111118', condicionIva: 1, creado: new Date('2026-07-10T15:00:00Z') },
      { razonSocial: 'Beta S.R.L.', cuit: '30222222226', condicionIva: 1, creado: new Date('2026-09-20T15:00:00Z') },
      { razonSocial: 'Gama S.A.', cuit: '30333333334', condicionIva: 1, creado: new Date('2026-08-01T15:00:00Z') },
    ])
    .returning()
  ;[alfa, beta, gama] = filas.map((f) => f.id)
  await base.insert(suscripciones).values([
    { empresaId: alfa, plan: 'pyme', estado: 'activa', pagadoHasta: '2026-11-10' },
    { empresaId: beta, plan: 'pyme', estado: 'prueba', pruebaHasta: '2026-10-08' },
    { empresaId: gama, plan: 'inicial', estado: 'impaga', pagadoHasta: '2026-09-01' },
  ])
  const [dueno] = await base.select().from(roles).where(eq(roles.nombre, 'Dueño'))
  await base.insert(membresias).values({ usuarioId: duena, empresaId: alfa, rolId: dueno.id })
  await base.insert(eventosSuscripcion).values([
    {
      empresaId: alfa,
      tipo: 'pago',
      detalle: { importe: '121.000,50', medio: 'transferencia' },
      creado: new Date('2026-09-10T15:00:00Z'),
    },
    {
      empresaId: alfa,
      tipo: 'pago',
      detalle: { importe: '1000.5', medio: 'Mercado Pago' },
      creado: new Date('2026-10-02T15:00:00Z'),
    },
  ])
})

describe('métricas', () => {
  it('lee los importes como se cargan a mano o llegan de Mercado Pago', () => {
    expect(importeDePago('121.000,50')).toBe(121000.5)
    expect(importeDePago('1000.5')).toBe(1000.5)
    expect(importeDePago('121.000')).toBe(121000)
    expect(importeDePago(250)).toBe(250)
    expect(importeDePago('')).toBe(0)
  })

  it('arma los últimos 12 meses terminando en el actual', () => {
    const m = ultimosMeses('2026-10-03')
    expect(m).toHaveLength(12)
    expect([m[0], m[11]]).toEqual(['2025-11', '2026-10'])
  })

  it('suma lo cobrado y las altas por mes, el ingreso recurrente y la conversión', async () => {
    const m = await metricas('2026-10-03')
    expect(m.cobrado.find((c) => c.mes === '2026-09')?.valor).toBe(121000.5)
    expect(m.cobrado.find((c) => c.mes === '2026-10')?.valor).toBe(1000.5)
    expect(m.altas.find((c) => c.mes === '2026-09')?.valor).toBe(1)
    expect(m.pagas).toBe(1)
    expect(m.mrr).toBeGreaterThan(0)
    // Alfa y Gama ya terminaron los 30 días de prueba; solo Alfa paga.
    expect([m.maduras, m.conversion]).toEqual([2, 0.5])
    expect(m.porVencer.map((f) => f.razonSocial)).toEqual(['Beta S.R.L.'])
  })
})

describe('empresas', () => {
  it('busca por nombre o CUIT y filtra por estado', async () => {
    expect((await buscarEmpresas({ q: 'beta' })).filas.map((f) => f.razonSocial)).toEqual(['Beta S.R.L.'])
    expect((await buscarEmpresas({ q: '30-33333' })).filas.map((f) => f.razonSocial)).toEqual(['Gama S.A.'])
    expect((await buscarEmpresas({ estado: 'prueba' })).filas).toHaveLength(1)
    expect((await buscarEmpresas({ orden: 'nombre' })).filas.map((f) => f.razonSocial)).toEqual([
      'Alfa S.A.',
      'Beta S.R.L.',
      'Gama S.A.',
    ])
  })

  it('suspende y reactiva según el pago, y lo deja auditado', async () => {
    expect(await cambiarSuspension(admin, alfa, true, '2026-10-03')).toEqual({ ok: true })
    expect((await base.select().from(suscripciones).where(eq(suscripciones.empresaId, alfa)))[0].estado).toBe('suspendida')
    expect(await cambiarSuspension(admin, alfa, true, '2026-10-03')).toMatchObject({ ok: false })
    expect(await cambiarSuspension(admin, alfa, false, '2026-10-03')).toEqual({ ok: true })
    // El pago llega hasta el 10/11: vuelve a activa.
    expect((await base.select().from(suscripciones).where(eq(suscripciones.empresaId, alfa)))[0].estado).toBe('activa')
    const acciones = (await listarAuditoria({ empresaId: alfa })).map((a) => a.accion)
    expect(acciones).toEqual(expect.arrayContaining(['suscripcion.suspender', 'suscripcion.reactivar']))
  })

  it('extiende la prueba desde su fin, pero no a una suscripción paga', async () => {
    expect(await extenderPrueba(admin, beta, 15, '2026-10-03')).toEqual({ ok: true })
    const [s] = await base.select().from(suscripciones).where(eq(suscripciones.empresaId, beta))
    expect([s.estado, s.pruebaHasta]).toEqual(['prueba', '2026-10-23'])
    expect(await extenderPrueba(admin, alfa, 15, '2026-10-03')).toMatchObject({ ok: false })
    expect(await extenderPrueba(admin, beta, 500, '2026-10-03')).toMatchObject({ ok: false })
  })

  it('guarda notas internas y arma la ficha con miembros y notas', async () => {
    expect(await agregarNota(admin, alfa, ' ')).toMatchObject({ ok: false })
    expect(await agregarNota(admin, alfa, 'Llamó por la factura de septiembre.')).toEqual({ ok: true })
    const f = await fichaEmpresa(alfa)
    expect(f?.miembros.map((m) => [m.email, m.rol])).toEqual([['duena@alfa.com', 'Dueño']])
    expect(f?.notas[0].detalle).toEqual({ texto: 'Llamó por la factura de septiembre.' })
    expect(await fichaEmpresa('00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})

describe('usuarios', () => {
  it('lista con sus empresas y filtra', async () => {
    const todos = (await listarUsuarios()).filas
    expect(todos.find((u) => u.email === 'duena@alfa.com')?.empresas.map((e) => e.razonSocial)).toEqual(['Alfa S.A.'])
    const admins = await listarUsuarios({ tipo: 'admin' })
    expect(admins.filas.map((u) => u.email)).toEqual(['admin@plataforma.com'])
    expect(admins.total).toBe(todos.length)
    expect((await listarUsuarios({ q: 'DUEÑA' })).filas.map((u) => u.email)).toEqual(['duena@alfa.com'])
  })

  it('no deja que uno se desactive a sí mismo', async () => {
    expect(await cambiarActivoUsuario(admin, admin.id, false)).toMatchObject({ ok: false })
  })

  it('desactivar cierra las sesiones y la persona ya no entra', async () => {
    const s = await iniciarSesion('duena@alfa.com', CLAVE)
    if (!s.ok) throw new Error(s.error)
    expect(await cambiarActivoUsuario(admin, duena, false)).toEqual({ ok: true })
    expect(await leerSesion(s.token)).toBeNull()
    expect(await iniciarSesion('duena@alfa.com', CLAVE)).toMatchObject({ ok: false })
    expect(await cambiarActivoUsuario(admin, duena, true)).toEqual({ ok: true })
    const otra = await iniciarSesion('duena@alfa.com', CLAVE)
    expect(otra.ok).toBe(true)
    expect(await cerrarSesionesDe(admin, duena)).toMatchObject({ ok: true, cerradas: 1 })
  })
})

describe('acceso de soporte', () => {
  it('entra a una empresa ajena solo para consultar, queda auditado y vence', async () => {
    const s = await iniciarSesion('admin@plataforma.com', CLAVE)
    if (!s.ok) throw new Error(s.error)
    const ahora = new Date()
    const r = await abrirSoporte(s.token, alfa, { ip: '10.0.0.1' }, ahora)
    expect(r.ok).toBe(true)
    const sesion = await leerSesion(s.token)
    expect(sesion?.empresa?.id).toBe(alfa)
    expect(sesion?.rol).toBe(ROL_SOPORTE)
    expect(sesion?.soporte).not.toBeNull()
    expect(sesion?.permisos.length).toBeGreaterThan(0)
    expect(sesion?.permisos.every((p) => p.endsWith('.ver'))).toBe(true)
    expect(sesion?.suscripcion?.soloLectura).toBe(true)
    // La empresa ve en su auditoría que entró soporte.
    const registro = await conEmpresa(alfa, (tx) => tx.select().from(auditoria).where(eq(auditoria.entidad, 'soporte')))
    expect(registro).toHaveLength(1)

    await cerrarSoporte(s.token)
    expect((await leerSesion(s.token))?.empresa).toBeNull()

    // Vencido: la sesión sigue, sin empresa.
    await abrirSoporte(s.token, alfa)
    await base.update(sesiones).set({ soporteHasta: new Date(Date.now() - 1000) })
    expect((await leerSesion(s.token))?.empresa).toBeNull()
  })

  it('no se abre sin administrar la plataforma, y se cae si se pierde el permiso', async () => {
    const d = await iniciarSesion('duena@alfa.com', CLAVE)
    if (!d.ok) throw new Error(d.error)
    expect(await abrirSoporte(d.token, beta)).toMatchObject({ ok: false })

    const s = await iniciarSesion('admin@plataforma.com', CLAVE)
    if (!s.ok) throw new Error(s.error)
    await abrirSoporte(s.token, beta)
    await base.update(usuarios).set({ adminPlataforma: false }).where(eq(usuarios.id, admin.id))
    expect((await leerSesion(s.token))?.empresa).toBeNull()
    await base.update(usuarios).set({ adminPlataforma: true }).where(eq(usuarios.id, admin.id))
  })

  it('elegir una empresa propia termina el soporte', async () => {
    const d = await iniciarSesion('duena@alfa.com', CLAVE)
    if (!d.ok) throw new Error(d.error)
    await base.update(usuarios).set({ adminPlataforma: true }).where(eq(usuarios.id, duena))
    await abrirSoporte(d.token, beta)
    expect((await leerSesion(d.token))?.soporte).not.toBeNull()
    expect(await elegirEmpresa(d.token, alfa)).toBe(true)
    const sesion = await leerSesion(d.token)
    expect([sesion?.empresa?.id, sesion?.rol, sesion?.soporte]).toEqual([alfa, 'Dueño', null])
    await base.update(usuarios).set({ adminPlataforma: false }).where(eq(usuarios.id, duena))
  })

  it('dar de baja una empresa deja sin empresa a quien estaba adentro', async () => {
    const d = await iniciarSesion('duena@alfa.com', CLAVE)
    if (!d.ok) throw new Error(d.error)
    expect((await leerSesion(d.token))?.empresa?.id).toBe(alfa)
    expect(await cambiarBajaEmpresa(admin, alfa, false)).toEqual({ ok: true })
    expect((await leerSesion(d.token))?.empresa).toBeNull()
    expect((await buscarEmpresas({ estado: 'baja' })).filas.map((f) => f.razonSocial)).toEqual(['Alfa S.A.'])
    expect(await cambiarBajaEmpresa(admin, alfa, true)).toEqual({ ok: true })
  })
})

describe('operación', () => {
  it('reúne el estado del servicio y archiva errores', async () => {
    await base.insert(erroresServidor).values({ huella: 'abc', mensaje: 'Falla de prueba', ruta: '/x' })
    const o = await estadoOperacion()
    expect(o.errores.map((e) => e.huella)).toEqual(['abc'])
    expect(o.tamanoBase).toBeGreaterThan(0)
    expect(o.copia).toBeNull()
    expect(await archivarError(admin, 'abc')).toEqual({ ok: true })
    expect(await archivarError(admin, 'abc')).toMatchObject({ ok: false })
    const ultimas = await base.select().from(auditoriaPlataforma)
    expect(ultimas.some((a) => a.accion === 'error.archivar')).toBe(true)
  })
})
