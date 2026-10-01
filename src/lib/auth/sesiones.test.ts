import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import type { BaseDeDatos } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { auditoria, empresas, membresias, roles, sesiones, usuarios } from '../../db/schema'
import { hashearClave } from './clave'
import { cerrarSesion, elegirEmpresa, iniciarSesion, leerSesion } from './sesiones'

let base: BaseDeDatos
let empresaA: string
let empresaB: string
let empresaC: string
const CLAVE = 'una-clave-segura-2026'

beforeAll(async () => {
  base = await baseDePrueba()
  const filas = await base
    .insert(empresas)
    .values([
      { razonSocial: 'Alfa S.A.', cuit: '30111111118', condicionIva: 1 },
      { razonSocial: 'Beta S.R.L.', cuit: '30222222226', condicionIva: 1 },
      { razonSocial: 'Gamma S.A.', cuit: '30333333334', condicionIva: 1 },
    ])
    .returning()
  ;[empresaA, empresaB, empresaC] = filas.map((f) => f.id)
  const [dueno] = await base.select().from(roles).where(eq(roles.nombre, 'Dueño'))
  const [ventas] = await base.select().from(roles).where(eq(roles.nombre, 'Ventas'))
  const hash = await hashearClave(CLAVE)
  const [ana, beto] = await base
    .insert(usuarios)
    .values([
      { email: 'ana@alfa.com', nombre: 'Ana', hashClave: hash },
      { email: 'beto@estudio.com', nombre: 'Beto', hashClave: hash },
    ])
    .returning()
  await base.insert(membresias).values([
    { usuarioId: ana.id, empresaId: empresaA, rolId: dueno.id },
    // Beto es el contador: trabaja en dos empresas.
    { usuarioId: beto.id, empresaId: empresaA, rolId: ventas.id },
    { usuarioId: beto.id, empresaId: empresaB, rolId: ventas.id },
  ])
})

describe('sesiones', () => {
  it('rechaza una clave incorrecta o un email que no existe con el mismo mensaje', async () => {
    const mal = await iniciarSesion('ana@alfa.com', 'otra-clave-1234')
    const noExiste = await iniciarSesion('nadie@alfa.com', CLAVE)
    expect(mal).toEqual({ ok: false, error: 'El email o la contraseña no son correctos.' })
    expect(noExiste).toEqual(mal)
  })

  it('con una sola empresa entra directo, con sus permisos, y lo audita', async () => {
    const r = await iniciarSesion('ANA@alfa.com ', CLAVE, { ip: '10.0.0.1' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const s = await leerSesion(r.token)
    expect(s?.empresa?.id).toBe(empresaA)
    expect(s?.permisos).toEqual(['*'])
    const ingresos = await conEmpresa(empresaA, (tx) => tx.select().from(auditoria).where(eq(auditoria.accion, 'ingreso')))
    expect(ingresos.length).toBeGreaterThan(0)
  })

  it('la base guarda solo el hash del token', async () => {
    const r = await iniciarSesion('ana@alfa.com', CLAVE)
    if (!r.ok) throw new Error('no entró')
    const guardadas = await base.select().from(sesiones)
    expect(guardadas.some((s) => s.hashToken === r.token)).toBe(false)
  })

  it('con varias empresas elige, y no puede elegir una ajena', async () => {
    const r = await iniciarSesion('beto@estudio.com', CLAVE)
    if (!r.ok) throw new Error('no entró')
    const antes = await leerSesion(r.token)
    expect(antes?.empresa).toBeNull()
    expect(antes?.empresas.map((e) => e.razonSocial)).toEqual(['Alfa S.A.', 'Beta S.R.L.'])
    expect(await elegirEmpresa(r.token, empresaC)).toBe(false)
    expect(await elegirEmpresa(r.token, empresaB)).toBe(true)
    const despues = await leerSesion(r.token)
    expect(despues?.empresa?.razonSocial).toBe('Beta S.R.L.')
    expect(despues?.rol).toBe('Ventas')
  })

  it('si le quitan el acceso, pierde la empresa en la próxima lectura', async () => {
    const r = await iniciarSesion('beto@estudio.com', CLAVE)
    if (!r.ok) throw new Error('no entró')
    await elegirEmpresa(r.token, empresaA)
    const [beto] = await base.select().from(usuarios).where(eq(usuarios.email, 'beto@estudio.com'))
    await base.update(membresias).set({ activa: false }).where(eq(membresias.usuarioId, beto.id))
    const s = await leerSesion(r.token)
    expect(s?.empresa).toBeNull()
    expect(s?.permisos).toEqual([])
  })

  it('cerrar sesión invalida el token', async () => {
    const r = await iniciarSesion('ana@alfa.com', CLAVE)
    if (!r.ok) throw new Error('no entró')
    await cerrarSesion(r.token)
    expect(await leerSesion(r.token)).toBeNull()
  })
})
