import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { empresaId, id } from './comunes'

/**
 * Bandeja de salida de correos de cada empresa. Todo email se guarda acá
 * primero (en la misma transacción que la operación que lo genera) y después
 * se manda por SMTP, si el servidor lo tiene configurado. Así queda registro
 * de qué se le avisó a cada cliente, y lo que falla se reintenta.
 */
export const correos = pgTable(
  'correos',
  {
    id: id(),
    empresaId: empresaId(),
    para: text('para').notNull(),
    asunto: text('asunto').notNull(),
    texto: text('texto').notNull(),
    /** Qué lo generó (orden_servicio, recordatorio…) y su id, para mostrarlo en la ficha. */
    entidad: text('entidad'),
    entidadId: uuid('entidad_id'),
    /** pendiente | enviado | error */
    estado: text('estado').notNull().default('pendiente'),
    intentos: integer('intentos').notNull().default(0),
    error: text('error'),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
    enviado: timestamp('enviado', { withTimezone: true }),
  },
  (t) => [
    index().on(t.empresaId, t.estado),
    index().on(t.empresaId, t.entidad, t.entidadId),
    check('correos_estado', sql`${t.estado} in ('pendiente', 'enviado', 'error')`),
  ],
)
