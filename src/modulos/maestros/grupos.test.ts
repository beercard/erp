import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { contratos, empresas, equipos, ordenesServicio, terceros, usuarios } from '../../db/schema'
import { asignarGruposUsuario, borrarGrupo, guardarGrupo, listarGrupos } from './grupos'
import { guardarTercero, listarTerceros } from './terceros'

const ADMIN = '00000000-0000-4000-8000-000000000001'

describe('grupos de clientes', () => {
  let empresa: string
  let vendedor: string
  const ids: Record<string, string> = {}
  const comoAdmin = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)
  const comoVendedor = <T>(f: Parameters<typeof conEmpresa<T>>[1]) =>
    conEmpresa({ empresa: { id: empresa }, usuario: { id: vendedor } }, f)

  beforeAll(async () => {
    const db = await baseDePrueba()
    const [e] = await db
      .insert(empresas)
      .values({ razonSocial: 'Copiadora S.A.', cuit: '30715974823', condicionIva: 1 })
      .returning()
    empresa = e.id
    vendedor = (
      await db.insert(usuarios).values({ email: 'norte@copiadora.com', nombre: 'Norte', hashClave: 'x' }).returning()
    )[0].id
    await comoAdmin(async (tx) => {
      for (const g of ['Norte', 'Sur']) {
        const r = await guardarGrupo(tx, ADMIN, g)
        if (!r.ok) throw new Error(r.error)
        ids[g] = r.id
      }
      const cliente = (codigo: string, grupo: string | null, extra = {}) =>
        tx
          .insert(terceros)
          .values({ codigo, razonSocial: codigo, tipoDocumento: 99, condicionIva: 5, grupoClienteId: grupo, ...extra })
          .returning()
          .then((r) => r[0].id)
      ids.norte = await cliente('C-NORTE', ids.Norte)
      ids.sur = await cliente('C-SUR', ids.Sur)
      ids.sinGrupo = await cliente('C-SIN', null)
      ids.proveedor = await cliente('P-TONER', null, { esCliente: false, esProveedor: true })
      for (const c of ['norte', 'sur']) {
        await tx
          .insert(ordenesServicio)
          .values({ fecha: '2026-10-01', terceroId: ids[c], falla: 'No imprime', numero: c === 'norte' ? 1 : 2 })
        await tx.insert(equipos).values({ serie: `S-${c}`, terceroId: ids[c] })
        await tx.insert(contratos).values({ numero: c === 'norte' ? 1 : 2, terceroId: ids[c], tipo: 'Fotocopiado' })
      }
      await tx.insert(equipos).values({ serie: 'S-deposito' })
    })
  })

  it('sin grupos asignados el usuario ve todo', async () => {
    expect(await comoVendedor((tx) => tx.select().from(ordenesServicio))).toHaveLength(2)
    expect(await comoVendedor((tx) => listarTerceros(tx))).toHaveLength(4)
  })

  it('con grupos ve solo esos clientes y lo suyo; los proveedores, siempre', async () => {
    expect(await comoAdmin((tx) => asignarGruposUsuario(tx, ADMIN, vendedor, [ids.Norte]))).toEqual({ ok: true })
    const visibles = await comoVendedor((tx) => tx.select({ codigo: terceros.codigo }).from(terceros))
    expect(visibles.map((t) => t.codigo).sort()).toEqual(['C-NORTE', 'P-TONER'])
    const ordenes = await comoVendedor((tx) => tx.select().from(ordenesServicio))
    expect(ordenes.map((o) => o.terceroId)).toEqual([ids.norte])
    const series = await comoVendedor((tx) => tx.select({ serie: equipos.serie }).from(equipos))
    expect(series.map((s) => s.serie).sort()).toEqual(['S-deposito', 'S-norte'])
    expect(await comoVendedor((tx) => tx.select().from(contratos))).toHaveLength(1)
    // Sin usuario (procesos automáticos) y el administrador sin grupos: todo.
    expect(await comoAdmin((tx) => tx.select().from(ordenesServicio))).toHaveLength(2)
  })

  it('no puede cargar órdenes ni mover clientes fuera de sus grupos', async () => {
    await expect(
      comoVendedor((tx) => tx.insert(ordenesServicio).values({ fecha: '2026-10-02', terceroId: ids.sur, falla: 'x', numero: 3 })),
    ).rejects.toThrow()
    await expect(
      comoVendedor((tx) => tx.update(terceros).set({ grupoClienteId: ids.Sur }).where(eqId(ids.norte))),
    ).rejects.toThrow()
  })

  it('un cliente nuevo que carga queda en su grupo', async () => {
    const r = await comoVendedor((tx) =>
      guardarTercero(tx, vendedor, {
        razonSocial: 'Nuevo del norte',
        esCliente: true,
        esProveedor: false,
        tipoDocumento: '99',
        condicionIva: '5',
      }),
    )
    expect(r.ok).toBe(true)
    const [t] = await comoAdmin((tx) =>
      tx
        .select()
        .from(terceros)
        .where(eqId(r.ok ? r.id : '')),
    )
    expect(t.grupoClienteId).toBe(ids.Norte)
  })

  it('al borrar un grupo sus clientes quedan sin grupo', async () => {
    expect((await comoAdmin((tx) => listarGrupos(tx))).find((g) => g.id === ids.Sur)).toMatchObject({ clientes: 1, usuarios: [] })
    expect(await comoAdmin((tx) => borrarGrupo(tx, ADMIN, ids.Sur))).toEqual({ ok: true })
    const [t] = await comoAdmin((tx) => tx.select().from(terceros).where(eqId(ids.sur)))
    expect(t.grupoClienteId).toBeNull()
    // El vendedor (restringido) no puede borrar grupos.
    expect(await comoVendedor((tx) => borrarGrupo(tx, vendedor, ids.Norte))).toMatchObject({ ok: false })
  })
})

const eqId = (id: string) => eq(terceros.id, id)
