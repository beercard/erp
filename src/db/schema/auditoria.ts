import { bigserial, index, inet, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { empresaId } from './comunes'

/**
 * Registro de todo lo que se hace, por empresa. Solo de agregado: el rol de
 * la aplicación no tiene UPDATE ni DELETE y un trigger lo impide igual
 * (migración de seguridad). Se escribe desde src/lib/auditoria.ts.
 */
export const auditoria = pgTable(
  'auditoria',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    empresaId: empresaId(),
    usuarioId: uuid('usuario_id'),
    fecha: timestamp('fecha', { withTimezone: true }).notNull().defaultNow(),
    /** alta, modificacion, baja, emision, anulacion, ingreso… */
    accion: text('accion').notNull(),
    entidad: text('entidad').notNull(),
    entidadId: text('entidad_id'),
    antes: jsonb('antes'),
    despues: jsonb('despues'),
    ip: inet('ip'),
  },
  (t) => [index().on(t.empresaId, t.entidad, t.entidadId), index().on(t.empresaId, t.fecha)],
)
