import { mkdirSync } from 'node:fs'

import { PGlite } from '@electric-sql/pglite'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

export type BaseDeDatos = PgDatabase<PgQueryResultHKT, typeof schema>
export type Transaccion = Parameters<Parameters<BaseDeDatos['transaction']>[0]>[0]

/**
 * Con DATABASE_URL se conecta a Postgres (producción). Sin ella usa PGlite,
 * un Postgres embebido, guardado en DATA_DIR (por defecto .data/pglite): sirve
 * para desarrollar sin instalar nada. Las pruebas usan PGlite en memoria
 * (ver src/db/pruebas.ts).
 */
function crear(): BaseDeDatos {
  const url = process.env.DATABASE_URL
  if (url) return conectarPostgres(url, 10)
  const carpeta = process.env.DATA_DIR ?? '.data/pglite'
  mkdirSync(carpeta, { recursive: true })
  const cliente = new PGlite(carpeta)
  return drizzlePglite(cliente, { schema }) as unknown as BaseDeDatos
}

/**
 * Postgres real. Drizzle deja pasar tal cual los parámetros de fecha (para no
 * convertir los strings): un Date en un sql`...` llegaba crudo al driver y
 * fallaba (PGlite sí lo aceptaba). Acá se convierte a ISO, para toda consulta.
 */
export function conectarPostgres(url: string, max: number): BaseDeDatos {
  const cliente = postgres(url, { max, prepare: false, onnotice: () => {} })
  const base = drizzlePostgres(cliente, { schema }) as unknown as BaseDeDatos
  const aTexto = (v: unknown) => (v instanceof Date ? v.toISOString() : v)
  for (const tipo of ['1184', '1082', '1083', '1114', '1182', '1185', '1115', '1231']) {
    ;(cliente.options.serializers as Record<string, (v: unknown) => unknown>)[tipo] = aTexto
  }
  return base
}

// En desarrollo Next recarga los módulos: se reutiliza la misma conexión.
const global = globalThis as unknown as { __erpDb?: BaseDeDatos }

export function db(): BaseDeDatos {
  global.__erpDb ??= crear()
  return global.__erpDb
}

/** Solo para pruebas: reemplaza la conexión por una base en memoria. */
export function usarBase(base: BaseDeDatos) {
  global.__erpDb = base
}

/**
 * Filas de un db.execute(sql`...`): PGlite devuelve { rows } y postgres-js
 * un arreglo. Las consultas en SQL crudo pasan por acá para no depender del
 * driver.
 */
export function filas<T>(resultado: unknown): T[] {
  return (Array.isArray(resultado) ? resultado : (resultado as { rows: T[] }).rows) as T[]
}
