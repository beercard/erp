import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

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
    /** Administra la plataforma: ve todas las empresas y sus suscripciones (no sus datos). */
    adminPlataforma: boolean('admin_plataforma').notNull().default(false),
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
    /**
     * Acceso de soporte de la plataforma: quien administra entra a una
     * empresa sin ser miembro, solo para consultar, hasta esta hora.
     */
    soporteHasta: timestamp('soporte_hasta', { withTimezone: true }),
    creada: timestamp('creada', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.usuarioId)],
)

/**
 * Lo que hace quien administra la plataforma (cambios de plan, suspensiones,
 * accesos de soporte, permisos). La auditoría de cada empresa vive en su
 * propia tabla; esta es la de la plataforma y no lleva RLS.
 */
export const auditoriaPlataforma = pgTable(
  'auditoria_plataforma',
  {
    id: id(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    accion: text('accion').notNull(),
    /** Empresa afectada, si la hay. */
    empresaId: uuid('empresa_id').references(() => empresas.id),
    /** Usuario afectado (permisos, bajas), si lo hay. */
    sobreUsuarioId: uuid('sobre_usuario_id').references(() => usuarios.id),
    detalle: jsonb('detalle').$type<Record<string, unknown>>(),
    ip: inet('ip'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.creado), index().on(t.empresaId, t.creado)],
)

/**
 * Suscripción de cada empresa al servicio (una por empresa). Qué incluye cada
 * plan está en src/lib/planes.ts; acá queda lo contratado y su estado.
 */
export const suscripciones = pgTable(
  'suscripciones',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresas.id),
    /** gratis | inicial | pyme | empresa (src/lib/planes.ts) */
    plan: text('plan').notNull(),
    /** prueba | activa | impaga | suspendida | cancelada */
    estado: text('estado').notNull(),
    /** mensual | anual */
    ciclo: text('ciclo').notNull().default('mensual'),
    /** Aplicaciones contratadas sobre el plan, por ejemplo "contratos". */
    aplicaciones: text('aplicaciones')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    usuariosAdicionales: smallint('usuarios_adicionales').notNull().default(0),
    pruebaHasta: date('prueba_hasta'),
    /** Hasta cuándo está pagada; vencida, corren los días de gracia. */
    pagadoHasta: date('pagado_hasta'),
    /** Precio mensual acordado sin IVA; nulo es el de lista. */
    precioAcordado: numeric('precio_acordado', { precision: 18, scale: 2 }),
    /** Débito automático de Mercado Pago (preapproval): su id y su estado. */
    mpSuscripcion: text('mp_suscripcion'),
    mpEstado: text('mp_estado'),
    observaciones: text('observaciones'),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId),
    check('suscripciones_plan', sql`${t.plan} in ('gratis', 'inicial', 'pyme', 'empresa')`),
    check('suscripciones_estado', sql`${t.estado} in ('prueba', 'activa', 'impaga', 'suspendida', 'cancelada')`),
    check('suscripciones_ciclo', sql`${t.ciclo} in ('mensual', 'anual')`),
  ],
)

/**
 * Historial de cada suscripción: altas, cambios de plan, pagos y pedidos de
 * la empresa (que la plataforma atiende).
 */
export const eventosSuscripcion = pgTable(
  'eventos_suscripcion',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresas.id),
    /** alta | cambio | pago | pedido | nota */
    tipo: text('tipo').notNull(),
    detalle: jsonb('detalle')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Solo los pedidos: pendiente | atendido | rechazado */
    estado: text('estado'),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.empresaId, t.creado),
    check('eventos_suscripcion_tipo', sql`${t.tipo} in ('alta', 'cambio', 'pago', 'pedido', 'nota')`),
  ],
)

/**
 * Consultas del formulario de contacto del sitio comercial. De plataforma:
 * las atiende Vektra. La IP se guarda resumida (hash), solo para frenar abusos.
 */
export const consultasSitio = pgTable(
  'consultas_sitio',
  {
    id: id(),
    nombre: text('nombre').notNull(),
    email: text('email').notNull(),
    telefono: text('telefono'),
    empresa: text('empresa'),
    rubro: text('rubro'),
    mensaje: text('mensaje').notNull(),
    /** Página desde la que escribió. */
    origen: text('origen'),
    ipHash: text('ip_hash'),
    /** nueva | atendida */
    estado: text('estado').notNull().default('nueva'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.creado), index().on(t.ipHash, t.creado)],
)

/**
 * Freno a la fuerza bruta y al abuso (ingreso, portal, formularios
 * públicos): un registro por intento. Vive en la base para que funcione con
 * varias instancias y sobreviva a los reinicios; la tarea periódica borra
 * lo viejo.
 */
export const frenos = pgTable(
  'frenos',
  {
    id: id(),
    /** Qué se frena: "ingreso:email:x@y.com", "ingreso:ip:1.2.3.4"… (las IP van resumidas). */
    clave: text('clave').notNull(),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.clave, t.creado), index().on(t.creado)],
)

/** Pedidos de "olvidé mi contraseña": token de un solo uso (acá queda su hash), vence en una hora. */
export const recuperacionesClave = pgTable(
  'recuperaciones_clave',
  {
    id: id(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    hashToken: text('hash_token').notNull().unique(),
    vence: timestamp('vence', { withTimezone: true }).notNull(),
    usada: timestamp('usada', { withTimezone: true }),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.usuarioId)],
)

/**
 * Monitoreo (de plataforma): el último paso de cada tarea periódica, para
 * saber si dejó de correr.
 */
export const latidos = pgTable('latidos', {
  nombre: text('nombre').primaryKey(),
  ultimo: timestamp('ultimo', { withTimezone: true }).notNull().defaultNow(),
  ok: boolean('ok').notNull().default(true),
  detalle: jsonb('detalle').$type<Record<string, unknown>>(),
})

/** Errores del servidor agrupados por huella (mensaje y ruta), con aviso a la plataforma. */
export const erroresServidor = pgTable('errores_servidor', {
  huella: text('huella').primaryKey(),
  mensaje: text('mensaje').notNull(),
  ruta: text('ruta'),
  tipo: text('tipo'),
  digest: text('digest'),
  cantidad: integer('cantidad').notNull().default(1),
  primero: timestamp('primero', { withTimezone: true }).notNull().defaultNow(),
  ultimo: timestamp('ultimo', { withTimezone: true }).notNull().defaultNow(),
  avisado: timestamp('avisado', { withTimezone: true }),
})
