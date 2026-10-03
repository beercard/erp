import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import type { BaseDeDatos } from '../../db/conexion'
import { baseDePrueba } from '../../db/pruebas'
import { empresas, membresias, roles, suscripciones, usuarios } from '../../db/schema'
import { hashearClave } from '../../lib/auth/clave'
import { iniciarSesion, leerSesion } from '../../lib/auth/sesiones'
import { aceptarInvitacion, cambiarAcceso, cambiarRol, guardarRol, invitar, leerInvitacion, miembros } from './usuarios'

let base: BaseDeDatos
let empresaA: string
let empresaB: string
let dueno: string
let rolDueno: string
let rolVentas: string
let membresiaDueno: string

beforeAll(async () => {
  base = await baseDePrueba()
  const [a, b] = await base
    .insert(empresas)
    .values([
      { razonSocial: 'Alfa S.A.', cuit: '30111111118', condicionIva: 1 },
      { razonSocial: 'Beta S.A.', cuit: '30222222226', condicionIva: 1 },
    ])
    .returning()
  empresaA = a.id
  empresaB = b.id
  await base.insert(suscripciones).values([
    { empresaId: empresaA, plan: 'empresa', estado: 'activa' },
    { empresaId: empresaB, plan: 'pyme', estado: 'activa' },
  ])
  rolDueno = (await base.select().from(roles).where(eq(roles.nombre, 'Dueño')))[0].id
  rolVentas = (await base.select().from(roles).where(eq(roles.nombre, 'Ventas')))[0].id
  const [u] = await base
    .insert(usuarios)
    .values({ email: 'duena@alfa.com', nombre: 'Dueña', hashClave: await hashearClave('clave-duena-2026') })
    .returning()
  dueno = u.id
  const [m] = await base.insert(membresias).values({ usuarioId: dueno, empresaId: empresaA, rolId: rolDueno }).returning()
  membresiaDueno = m.id
})

describe('invitaciones', () => {
  it('no invita por encima de los usuarios del plan', async () => {
    const [g] = await base.insert(empresas).values({ razonSocial: 'Gamma', cuit: '30333333334', condicionIva: 1 }).returning()
    await base.insert(suscripciones).values({ empresaId: g.id, plan: 'gratis', estado: 'activa' })
    const [u] = await base
      .insert(usuarios)
      .values({ email: 'solo@gamma.com', nombre: 'Solo', hashClave: await hashearClave('clave-solo-2026') })
      .returning()
    await base.insert(membresias).values({ usuarioId: u.id, empresaId: g.id, rolId: rolDueno })
    const r = await invitar(g.id, u.id, { email: 'otro@gamma.com', rolId: rolVentas })
    expect(r).toMatchObject({ ok: false })
    expect(!r.ok && r.error).toContain('plan Gratis')
  })

  it('una persona nueva acepta, crea su cuenta y entra a la empresa con el rol elegido', async () => {
    const inv = await invitar(empresaA, dueno, { email: 'Vendedor@Alfa.com', rolId: rolVentas })
    if (!inv.ok) throw new Error(inv.error)
    const datos = await leerInvitacion(inv.token)
    expect(datos).toMatchObject({ email: 'vendedor@alfa.com', empresa: 'Alfa S.A.', rol: 'Ventas', usuarioExistente: null })

    expect(await aceptarInvitacion(inv.token, { nombre: 'Vendedor', clave: 'corta', repetir: 'corta' })).toMatchObject({
      ok: false,
    })
    const ok = await aceptarInvitacion(inv.token, { nombre: 'Vendedor', clave: 'clave-vendedor-1', repetir: 'clave-vendedor-1' })
    expect(ok.ok).toBe(true)
    // El enlace sirve una sola vez.
    expect(
      await aceptarInvitacion(inv.token, { nombre: 'Otro', clave: 'clave-vendedor-1', repetir: 'clave-vendedor-1' }),
    ).toMatchObject({ ok: false })

    const sesion = await iniciarSesion('vendedor@alfa.com', 'clave-vendedor-1')
    if (!sesion.ok) throw new Error('no entra')
    expect((await leerSesion(sesion.token))?.rol).toBe('Ventas')
  })

  it('a una cuenta existente le pide su clave para sumarle la empresa', async () => {
    // Para invitar a la empresa B, la dueña tiene que estar en ella.
    await base.insert(membresias).values({ usuarioId: dueno, empresaId: empresaB, rolId: rolDueno })
    const inv = await invitar(empresaB, dueno, { email: 'vendedor@alfa.com', rolId: rolVentas })
    if (!inv.ok) throw new Error(inv.error)
    expect((await leerInvitacion(inv.token))?.usuarioExistente?.nombre).toBe('Vendedor')
    expect(await aceptarInvitacion(inv.token, { clave: 'adivinando-123' })).toEqual({
      ok: false,
      error: 'La contraseña no es correcta.',
    })
    expect((await aceptarInvitacion(inv.token, { clave: 'clave-vendedor-1' })).ok).toBe(true)
  })

  it('no invita dos veces a quien ya está ni con un rol de otra empresa', async () => {
    expect(await invitar(empresaA, dueno, { email: 'duena@alfa.com', rolId: rolVentas })).toMatchObject({ ok: false })
    const propioDeB = await guardarRol(empresaB, dueno, { nombre: 'Solo B', descripcion: '', permisos: ['ventas.ver'] })
    if (!propioDeB.ok) throw new Error(propioDeB.error)
    expect(await invitar(empresaA, dueno, { email: 'x@alfa.com', rolId: propioDeB.id })).toEqual({
      ok: false,
      error: 'Ese rol no existe en esta empresa.',
    })
  })
})

describe('roles y acceso', () => {
  it('nunca deja a la empresa sin dueño ni permite quitarse el acceso a uno mismo', async () => {
    expect(await cambiarRol(empresaA, dueno, membresiaDueno, rolVentas)).toMatchObject({ ok: false })
    expect(await cambiarAcceso(empresaA, dueno, membresiaDueno, false)).toEqual({
      ok: false,
      error: 'No podés quitarte el acceso a vos mismo.',
    })
  })

  it('los roles propios solo aceptan permisos que existen y los de sistema no se tocan', async () => {
    expect(await guardarRol(empresaA, dueno, { nombre: 'Raro', descripcion: '', permisos: ['inventado.todo'] })).toMatchObject({
      ok: false,
    })
    expect(
      await guardarRol(empresaA, dueno, { nombre: 'Dueño', descripcion: '', permisos: ['ventas.ver'] }, rolDueno),
    ).toMatchObject({ ok: false })
    const r = await guardarRol(empresaA, dueno, {
      nombre: 'Cobranzas',
      descripcion: 'Solo cobra',
      permisos: ['ventas.ver', 'ventas.cobrar'],
    })
    expect(r.ok).toBe(true)
    const { roles: disponibles } = await miembros(empresaA)
    expect(disponibles.map((x) => x.nombre)).toContain('Cobranzas')
    expect(disponibles.map((x) => x.nombre)).not.toContain('Solo B')
  })
})

describe('nadie reparte permisos que no tiene', () => {
  it('quien administra usuarios sin ser dueño no se hace dueño ni toca a un dueño', async () => {
    // Un rol que solo administra usuarios.
    const rrhh = await guardarRol(empresaA, dueno, { nombre: 'RRHH', descripcion: '', permisos: ['empresa.usuarios'] })
    if (!rrhh.ok) throw new Error(rrhh.error)
    const [u] = await base
      .insert(usuarios)
      .values({ email: 'rrhh@alfa.com', nombre: 'RRHH', hashClave: await hashearClave('clave-rrhh-2026') })
      .returning()
    const [m] = await base.insert(membresias).values({ usuarioId: u.id, empresaId: empresaA, rolId: rrhh.id }).returning()
    // No puede darse más permisos, ni invitar como dueño, ni armar un rol con más de lo que tiene.
    expect(await cambiarRol(empresaA, u.id, m.id, rolDueno)).toMatchObject({ ok: false })
    expect(await invitar(empresaA, u.id, { email: 'otro@alfa.com', rolId: rolDueno })).toMatchObject({ ok: false })
    expect(await invitar(empresaA, u.id, { email: 'otro@alfa.com', rolId: rolVentas })).toMatchObject({ ok: false })
    expect(await guardarRol(empresaA, u.id, { nombre: 'Todo', descripcion: '', permisos: ['ventas.facturar'] })).toMatchObject({
      ok: false,
    })
    // Ni bajarle el rol o quitarle el acceso a la dueña.
    expect(await cambiarRol(empresaA, u.id, membresiaDueno, rrhh.id)).toMatchObject({ ok: false })
    expect(await cambiarAcceso(empresaA, u.id, membresiaDueno, false)).toMatchObject({ ok: false })
    // Sí puede invitar con un rol que no le da más de lo que tiene.
    expect((await invitar(empresaA, u.id, { email: 'rrhh2@alfa.com', rolId: rrhh.id })).ok).toBe(true)
  })
})
