import { sql } from 'drizzle-orm'
import { check, date, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { empresaId } from './comunes'

/**
 * Cierre de períodos por módulo: nada con fecha hasta "cerrado hasta" se
 * puede cargar, modificar ni anular en ese módulo (como el cierre de módulos
 * de los ERP de escritorio). Se reabre corriendo la fecha para atrás.
 */
export const bloqueosModulo = pgTable(
  'bloqueos_modulo',
  {
    empresaId: empresaId(),
    /** ventas | compras | tesoreria | stock */
    modulo: text('modulo').notNull(),
    cerradoHasta: date('cerrado_hasta').notNull(),
    usuarioId: uuid('usuario_id'),
    actualizado: timestamp('actualizado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.empresaId, t.modulo] }),
    check('bloqueos_modulo_modulo', sql`${t.modulo} in ('ventas', 'compras', 'tesoreria', 'stock')`),
  ],
)
