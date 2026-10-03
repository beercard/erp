import { sql } from 'drizzle-orm'
import { check, date, pgTable, smallint, text, uniqueIndex } from 'drizzle-orm/pg-core'

import { empresaId, id, marcasDeTiempo } from './comunes'

/**
 * Resumen para el dueño: ventas, cobranzas, deuda vencida, saldos de caja y
 * banco, y alertas, por correo y WhatsApp, cada día o una vez por semana.
 */
export const resumenDueno = pgTable(
  'resumen_dueno',
  {
    id: id(),
    empresaId: empresaId(),
    /** no | diario | semanal */
    frecuencia: text('frecuencia').notNull().default('no'),
    /** Para el semanal: 1 = lunes … 7 = domingo. */
    diaSemana: smallint('dia_semana').notNull().default(1),
    correos: text('correos')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    telefonos: text('telefonos')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Último día en que salió (una vez por día como mucho). */
    ultimoEnvio: date('ultimo_envio'),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId),
    check('resumen_dueno_frecuencia', sql`${t.frecuencia} in ('no', 'diario', 'semanal')`),
    check('resumen_dueno_dia', sql`${t.diaSemana} between 1 and 7`),
  ],
)
