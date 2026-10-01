import { sql } from 'drizzle-orm'
import { numeric, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Empresa dueña de la fila. Toma por defecto la empresa fijada en la
 * transacción (`app.empresa_id`, ver src/db/empresa.ts): un alta nunca puede
 * quedar en otra empresa, y sin empresa fijada el NOT NULL la rechaza.
 * La política de RLS de cada tabla usa la misma expresión.
 */
export const empresaActual = sql`nullif(current_setting('app.empresa_id', true), '')::uuid`

export const empresaId = () =>
  uuid('empresa_id').notNull().default(empresaActual)

export const id = () => uuid('id').primaryKey().defaultRandom()

export const marcasDeTiempo = () => ({
  creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  actualizado: timestamp('actualizado', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

/** Importes: dos decimales. Siempre string en el código (ver src/lib/dinero.ts). */
export const importe = (nombre: string) => numeric(nombre, { precision: 18, scale: 2 })
/** Precios y cantidades: cuatro decimales. */
export const precio = (nombre: string) => numeric(nombre, { precision: 18, scale: 4 })
export const cantidad = (nombre: string) => numeric(nombre, { precision: 18, scale: 4 })
/** Cotizaciones de moneda: seis decimales. */
export const cotizacion = (nombre: string) => numeric(nombre, { precision: 18, scale: 6 })
