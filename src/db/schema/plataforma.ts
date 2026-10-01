import { sql } from 'drizzle-orm'
import { boolean, date, index, inet, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { condicionesIva, monedas, provincias } from './catalogos'
import { id, marcasDeTiempo } from './comunes'

/**
 * Tablas de la plataforma: empresas (los clientes del SaaS), usuarios,
 * sesiones, roles y membresías. No llevan RLS porque se consultan antes de
 * saber en qué empresa se trabaja; solo las toca src/lib/auth.
 */

export const empresas = pgTable('empresas', {
  id: id(),
  razonSocial: text('razon_social').notNull(),
  nombreFantasia: text('nombre_fantasia'),
  cuit: text('cuit').notNull().unique(),
  condicionIva: smallint('condicion_iva')
    .notNull()
    .references(() => condicionesIva.codigo),
  /** Número de inscripción en Ingresos Brutos y régimen (local, convenio, exento). */
  iibbNumero: text('iibb_numero'),
  iibbRegimen: text('iibb_regimen'),
  inicioActividades: date('inicio_actividades'),
  domicilioFiscal: text('domicilio_fiscal'),
  localidad: text('localidad'),
  codigoPostal: text('codigo_postal'),
  provincia: text('provincia').references(() => provincias.codigo),
  monedaFuncional: text('moneda_funcional')
    .notNull()
    .default('PES')
    .references(() => monedas.codigo),
  /** Módulos opcionales activos, por ejemplo "contratos". */
  modulos: text('modulos')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  activa: boolean('activa').notNull().default(true),
  ...marcasDeTiempo(),
})

export const usuarios = pgTable(
  'usuarios',
  {
    id: id(),
    email: text('email').notNull(),
    nombre: text('nombre').notNull(),
    /** scrypt: "scrypt$N$r$p$sal$hash" (ver src/lib/auth/clave.ts). */
    hashClave: text('hash_clave').notNull(),
    activo: boolean('activo').notNull().default(true),
    ultimoIngreso: timestamp('ultimo_ingreso', { withTimezone: true }),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex('usuarios_email_unico').on(sql`lower(${t.email})`)],
)

export const roles = pgTable(
  'roles',
  {
    id: id(),
    /** Nulo: rol de sistema, disponible en todas las empresas. */
    empresaId: uuid('empresa_id').references(() => empresas.id),
    nombre: text('nombre').notNull(),
    descripcion: text('descripcion'),
    /** Permisos como "ventas.facturar". "*" da todos. */
    permisos: text('permisos').array().notNull(),
    ...marcasDeTiempo(),
  },
  (t) => [index().on(t.empresaId)],
)

export const membresias = pgTable(
  'membresias',
  {
    id: id(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresas.id),
    rolId: uuid('rol_id')
      .notNull()
      .references(() => roles.id),
    activa: boolean('activa').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.usuarioId, t.empresaId)],
)

/**
 * Invitaciones para sumar a alguien a una empresa. El enlace lleva un token
 * aleatorio que se muestra una sola vez; acá queda solo su hash.
 */
export const invitaciones = pgTable(
  'invitaciones',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresas.id),
    email: text('email').notNull(),
    rolId: uuid('rol_id')
      .notNull()
      .references(() => roles.id),
    hashToken: text('hash_token').notNull().unique(),
    invitadoPor: uuid('invitado_por')
      .notNull()
      .references(() => usuarios.id),
    vence: timestamp('vence', { withTimezone: true }).notNull(),
    aceptada: timestamp('aceptada', { withTimezone: true }),
    creada: timestamp('creada', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.empresaId)],
)

export const sesiones = pgTable(
  'sesiones',
  {
    id: id(),
    /** SHA-256 del token de la cookie. El token en sí nunca se guarda. */
    hashToken: text('hash_token').notNull().unique(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    empresaId: uuid('empresa_id').references(() => empresas.id),
    vence: timestamp('vence', { withTimezone: true }).notNull(),
    ip: inet('ip'),
    navegador: text('navegador'),
    creada: timestamp('creada', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.usuarioId)],
)
