import { eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { filas, type BaseDeDatos } from './conexion'
import { comoPlataforma, conEmpresa } from './empresa'
import { baseDePrueba } from './pruebas'
import { auditoria, empresas, terceros, vendedores } from './schema'

/** Tablas con empresa_id que son de plataforma y NO llevan RLS (ver plataforma.ts). */
const PLATAFORMA = new Set([
  'roles',
  'membresias',
  'sesiones',
  'invitaciones',
  'suscripciones',
  'eventos_suscripcion',
  'cuentas_canal',
])

/** Mensaje de Postgres detrás del error de Drizzle: la prueba verifica el MOTIVO del rechazo. */
async function motivo(operacion: Promise<unknown>): Promise<string> {
  try {
    await operacion
    return 'sin error'
  } catch (e) {
    const error = e as { message: string; cause?: { message: string } }
    return error.cause?.message ?? error.message
  }
}

let base: BaseDeDatos
let empresaA: string
let empresaB: string

async function nuevoTercero(empresaId: string, codigo: string, extra: Partial<typeof terceros.$inferInsert> = {}) {
  return conEmpresa(empresaId, async (tx) => {
    const [fila] = await tx
      .insert(terceros)
      .values({ codigo, razonSocial: `Cliente ${codigo}`, tipoDocumento: 99, condicionIva: 5, ...extra })
      .returning()
    return fila
  })
}

beforeAll(async () => {
  base = await baseDePrueba()
  // Las empresas las da de alta la plataforma (como dueño, sin RLS).
  const filas = await base
    .insert(empresas)
    .values([
      { razonSocial: 'Empresa A S.A.', cuit: '30111111118', condicionIva: 1 },
      { razonSocial: 'Empresa B S.R.L.', cuit: '30222222226', condicionIva: 1 },
    ])
    .returning({ id: empresas.id })
  empresaA = filas[0].id
  empresaB = filas[1].id
})

describe('aislamiento entre empresas', () => {
  it('toda tabla con empresa_id tiene RLS forzado y la política de aislamiento', async () => {
    const rows = filas<{ tabla: string; rls: boolean; forzado: boolean; politica: boolean }>(
      await base.execute(sql`
      select c.relname as tabla, c.relrowsecurity as rls, c.relforcerowsecurity as forzado,
        exists (select 1 from pg_policies p where p.tablename = c.relname and p.policyname = 'aislamiento_empresa') as politica
      from pg_class c
      join information_schema.columns col on col.table_name = c.relname and col.column_name = 'empresa_id'
      where c.relkind = 'r' and col.table_schema = 'public'
    `),
    )
    const sinAislar = rows.filter((r) => !PLATAFORMA.has(r.tabla) && !(r.rls && r.forzado && r.politica))
    expect(rows.length).toBeGreaterThan(10)
    expect(sinAislar.map((r) => r.tabla)).toEqual([])
  })

  it('cada empresa ve solo sus filas, aunque la consulta no filtre', async () => {
    await nuevoTercero(empresaA, 'A1')
    await nuevoTercero(empresaB, 'B1')
    const vistosPorA = await conEmpresa(empresaA, (tx) => tx.select().from(terceros))
    const vistosPorB = await conEmpresa(empresaB, (tx) => tx.select().from(terceros))
    expect(vistosPorA.map((t) => t.codigo)).toEqual(['A1'])
    expect(vistosPorB.map((t) => t.codigo)).toEqual(['B1'])
  })

  it('el alta toma la empresa de la transacción', async () => {
    const t = await nuevoTercero(empresaA, 'A2')
    expect(t.empresaId).toBe(empresaA)
  })

  it('no se puede escribir una fila de otra empresa', async () => {
    expect(await motivo(nuevoTercero(empresaA, 'X1', { empresaId: empresaB }))).toMatch(/row-level security/)
  })

  it('no se puede modificar ni borrar filas de otra empresa', async () => {
    const deB = await nuevoTercero(empresaB, 'B2')
    const modificadas = await conEmpresa(empresaA, (tx) =>
      tx.update(terceros).set({ razonSocial: 'Hackeado' }).where(eq(terceros.id, deB.id)).returning(),
    )
    const borradas = await conEmpresa(empresaA, (tx) => tx.delete(terceros).where(eq(terceros.id, deB.id)).returning())
    expect(modificadas).toEqual([])
    expect(borradas).toEqual([])
  })

  it('sin empresa fijada no se ve ningún dato de negocio', async () => {
    const vistos = await comoPlataforma((tx) => tx.select().from(terceros))
    expect(vistos).toEqual([])
  })

  it('una referencia a un registro de otra empresa la rechaza la base', async () => {
    const vendedorDeB = await conEmpresa(empresaB, async (tx) => {
      const [v] = await tx.insert(vendedores).values({ codigo: '01', nombre: 'Vendedor B' }).returning()
      return v
    })
    expect(await motivo(nuevoTercero(empresaA, 'A3', { vendedorId: vendedorDeB.id }))).toMatch(/terceros_vendedor_fk/)
  })
})

describe('auditoría', () => {
  it('se puede agregar pero no modificar ni borrar', async () => {
    const fila = await conEmpresa(empresaA, async (tx) => {
      const [a] = await tx.insert(auditoria).values({ accion: 'alta', entidad: 'prueba' }).returning()
      return a
    })
    await expect(
      conEmpresa(empresaA, (tx) => tx.update(auditoria).set({ accion: 'otra' }).where(eq(auditoria.id, fila.id))),
    ).rejects.toThrow()
    await expect(conEmpresa(empresaA, (tx) => tx.delete(auditoria).where(eq(auditoria.id, fila.id)))).rejects.toThrow()
    // Ni siquiera el dueño de las tablas puede: lo impide el trigger. (El
    // dueño también pasa por RLS forzado, así que fija la empresa para ver la fila.)
    await expect(
      base.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.empresa_id', ${empresaA}, true)`)
        return tx.delete(auditoria).where(eq(auditoria.id, fila.id)).returning()
      }),
    ).rejects.toThrow()
  })
})

describe('catálogos fiscales', () => {
  it('están cargados y la aplicación no los puede modificar', async () => {
    const rows = filas<{ n: number }>(await base.execute(sql`select count(*)::int as n from condiciones_iva`))
    expect(rows[0].n).toBe(11)
    expect(
      await motivo(
        comoPlataforma((tx) =>
          tx.execute(sql`insert into monedas (codigo, iso, nombre, simbolo) values ('XXX', 'XXX', 'x', 'x')`),
        ),
      ),
    ).toMatch(/permission denied/)
  })
})
