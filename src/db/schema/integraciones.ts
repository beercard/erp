import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { empresaId, id, marcasDeTiempo } from './comunes'

/**
 * Integraciones (función "API e integraciones" del plan): claves para la API
 * REST y webhooks que avisan a otros sistemas cuando pasa algo.
 */

/**
 * Clave de la API. Se muestra una sola vez al crearla; acá queda su hash
 * (SHA-256: es un secreto aleatorio largo, no una contraseña) y un prefijo
 * para reconocerla en la lista.
 */
export const apiClaves = pgTable(
  'api_claves',
  {
    id: id(),
    empresaId: empresaId(),
    nombre: text('nombre').notNull(),
    prefijo: text('prefijo').notNull(),
    hash: text('hash').notNull(),
    /** lectura | total */
    acceso: text('acceso').notNull().default('lectura'),
    ultimoUso: timestamp('ultimo_uso', { withTimezone: true }),
    revocada: timestamp('revocada', { withTimezone: true }),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('api_claves_hash').on(t.hash), check('api_claves_acceso', sql`${t.acceso} in ('lectura', 'total')`)],
)

export const webhooks = pgTable(
  'webhooks',
  {
    id: id(),
    empresaId: empresaId(),
    url: text('url').notNull(),
    /** Eventos a los que se suscribe (ver src/modulos/integraciones/webhooks.ts). */
    eventos: text('eventos').array().notNull(),
    /** Con este secreto se firma cada envío (HMAC-SHA256), para que el receptor sepa que viene del ERP. */
    secreto: text('secreto').notNull(),
    activo: boolean('activo').notNull().default(true),
    descripcion: text('descripcion'),
    ...marcasDeTiempo(),
  },
  (t) => [
    index().on(t.empresaId),
    unique('webhooks_empresa_id').on(t.empresaId, t.id),
    check('webhooks_url', sql`${t.url} ~ '^https?://'`),
  ],
)

/** Cola de envíos: se arma en la misma transacción que el evento y se manda después, con reintentos. */
export const webhookEntregas = pgTable(
  'webhook_entregas',
  {
    id: id(),
    empresaId: empresaId(),
    webhookId: uuid('webhook_id').notNull(),
    evento: text('evento').notNull(),
    datos: jsonb('datos').notNull(),
    /** pendiente | entregado | fallido (agotó los reintentos) */
    estado: text('estado').notNull().default('pendiente'),
    intentos: integer('intentos').notNull().default(0),
    respuesta: text('respuesta'),
    proximoIntento: timestamp('proximo_intento', { withTimezone: true }).notNull().defaultNow(),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
    entregado: timestamp('entregado', { withTimezone: true }),
  },
  (t) => [
    index().on(t.empresaId, t.estado, t.proximoIntento),
    index().on(t.webhookId),
    check('webhook_entregas_estado', sql`${t.estado} in ('pendiente', 'entregado', 'fallido')`),
    foreignKey({
      name: 'webhook_entregas_webhook_fk',
      columns: [t.empresaId, t.webhookId],
      foreignColumns: [webhooks.empresaId, webhooks.id],
    }).onDelete('cascade'),
  ],
)
