import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  customType,
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
import { terceros } from './maestros'
import { empresas } from './plataforma'

/**
 * WhatsApp Business (API oficial de Meta, "Cloud API"). Cada empresa conecta
 * su número; los mensajes entran por un aviso firmado y quedan en
 * conversaciones que atiende una persona o el agente de atención.
 */

const deLaEmpresa = (
  nombre: string,
  empresa: Parameters<typeof foreignKey>[0]['columns'][0],
  columna: Parameters<typeof foreignKey>[0]['columns'][0],
  destino: { empresaId: Parameters<typeof foreignKey>[0]['columns'][0]; id: Parameters<typeof foreignKey>[0]['columns'][0] },
) => foreignKey({ name: nombre, columns: [empresa, columna], foreignColumns: [destino.empresaId, destino.id] })

export const whatsappCuentas = pgTable(
  'whatsapp_cuentas',
  {
    id: id(),
    empresaId: empresaId(),
    /** Phone number ID de Meta (no es el número). */
    numeroId: text('numero_id').notNull(),
    /** El número como lo muestra WhatsApp, para la pantalla. */
    numero: text('numero'),
    nombreVerificado: text('nombre_verificado'),
    /** Token de acceso (usuario del sistema), cifrado. */
    token: text('token').notNull(),
    /** App secret de Meta, cifrado: con él se verifica la firma de cada aviso. */
    secretoApp: text('secreto_app').notNull(),
    /** Lo que Meta manda al verificar la dirección del webhook. */
    tokenVerificacion: text('token_verificacion').notNull(),
    activa: boolean('activa').notNull().default(true),
    /** Plantilla aprobada para escribir fuera de las 24 horas (con un parámetro de texto en el cuerpo). */
    plantilla: text('plantilla'),
    idioma: text('idioma').notNull().default('es_AR'),
    /** El agente de atención contesta a los clientes. */
    agente: boolean('agente').notNull().default(false),
    /** Instrucciones extra para el agente (horarios, tono, qué no prometer). */
    instrucciones: text('instrucciones'),
    /** Los usuarios autorizados pueden mandar facturas de proveedores para cargarlas. */
    registroFacturas: boolean('registro_facturas').notNull().default(false),
    ...marcasDeTiempo(),
  },
  (t) => [unique('whatsapp_cuentas_empresa_id').on(t.empresaId, t.id), uniqueIndex('whatsapp_cuentas_empresa').on(t.empresaId)],
)

/** Personas de la empresa que escriben desde su celular (para mandar facturas de proveedores). */
export const whatsappAutorizados = pgTable(
  'whatsapp_autorizados',
  {
    id: id(),
    empresaId: empresaId(),
    usuarioId: uuid('usuario_id').notNull(),
    /** Solo dígitos, con código de país (549…). */
    telefono: text('telefono').notNull(),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex('whatsapp_autorizados_telefono').on(t.empresaId, t.telefono)],
)

export const whatsappConversaciones = pgTable(
  'whatsapp_conversaciones',
  {
    id: id(),
    empresaId: empresaId(),
    /** wa_id: número con código de país, solo dígitos. */
    telefono: text('telefono').notNull(),
    nombre: text('nombre'),
    terceroId: uuid('tercero_id'),
    /** Si es alguien de la empresa autorizado (registro de facturas). */
    usuarioId: uuid('usuario_id'),
    /** agente | humano */
    atiende: text('atiende').notNull().default('agente'),
    /** abierta | cerrada */
    estado: text('estado').notNull().default('abierta'),
    asignadoA: uuid('asignado_a'),
    /** Último mensaje del contacto: abre la ventana de 24 horas para escribirle libremente. */
    ultimoEntrante: timestamp('ultimo_entrante', { withTimezone: true }),
    ultimoMensaje: timestamp('ultimo_mensaje', { withTimezone: true }),
    resumen: text('resumen'),
    noLeidos: integer('no_leidos').notNull().default(0),
    ...marcasDeTiempo(),
  },
  (t) => [
    unique('whatsapp_conversaciones_empresa_id').on(t.empresaId, t.id),
    uniqueIndex('whatsapp_conversaciones_telefono').on(t.empresaId, t.telefono),
    index().on(t.empresaId, t.ultimoMensaje),
    check('whatsapp_conversaciones_atiende', sql`${t.atiende} in ('agente', 'humano')`),
    check('whatsapp_conversaciones_estado', sql`${t.estado} in ('abierta', 'cerrada')`),
    deLaEmpresa('whatsapp_conversaciones_tercero_fk', t.empresaId, t.terceroId, terceros).onDelete('set null'),
  ],
)

export const whatsappMensajes = pgTable(
  'whatsapp_mensajes',
  {
    id: id(),
    empresaId: empresaId(),
    conversacionId: uuid('conversacion_id').notNull(),
    /** entrante | saliente */
    direccion: text('direccion').notNull(),
    /** cliente | usuario | agente | sistema */
    autor: text('autor').notNull(),
    usuarioId: uuid('usuario_id'),
    /** text | image | document | audio | video | template | interactive | otro */
    tipo: text('tipo').notNull().default('text'),
    texto: text('texto'),
    /** Archivo que mandó el contacto (id en Meta; se descarga cuando hace falta). */
    medio: jsonb('medio').$type<{ id: string; tipo: string; nombre?: string | null; tamano?: number | null }>(),
    /** wamid de Meta. */
    externoId: text('externo_id'),
    /** recibido | enviado | entregado | leido | fallido */
    estado: text('estado').notNull().default('recibido'),
    error: text('error'),
    /** Lo que hizo el sistema con el mensaje (factura cargada, herramientas del agente…). */
    datos: jsonb('datos').$type<Record<string, unknown>>(),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('whatsapp_mensajes_externo').on(t.empresaId, t.externoId),
    index().on(t.empresaId, t.conversacionId, t.creado),
    check('whatsapp_mensajes_direccion', sql`${t.direccion} in ('entrante', 'saliente')`),
    deLaEmpresa('whatsapp_mensajes_conversacion_fk', t.empresaId, t.conversacionId, whatsappConversaciones).onDelete('cascade'),
  ],
)

/** Para los avisos de Meta, que llegan sin sesión: a qué empresa va cada dirección. De plataforma. */
export const whatsappNumeros = pgTable('whatsapp_numeros', {
  /** Clave de la dirección del webhook (/api/whatsapp/<clave>). */
  clave: text('clave').primaryKey(),
  /** Un mismo número de WhatsApp no puede estar en dos empresas. */
  numeroId: text('numero_id').notNull().unique(),
  empresaId: uuid('empresa_id')
    .notNull()
    .unique()
    .references(() => empresas.id, { onDelete: 'cascade' }),
  creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
})

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => 'bytea',
  fromDriver: (v) => Buffer.from(v),
})

/**
 * Facturas de proveedores que llegan por WhatsApp (foto o PDF). Se leen con
 * IA y quedan para revisar; al confirmarlas se registran como compra.
 */
export const facturasRecibidas = pgTable(
  'facturas_recibidas',
  {
    id: id(),
    empresaId: empresaId(),
    /** whatsapp */
    origen: text('origen').notNull().default('whatsapp'),
    usuarioId: uuid('usuario_id'),
    conversacionId: uuid('conversacion_id'),
    archivo: bytea('archivo').notNull(),
    tipoArchivo: text('tipo_archivo').notNull(),
    nombreArchivo: text('nombre_archivo'),
    /** leyendo | lista | registrada | descartada | error */
    estado: text('estado').notNull().default('leyendo'),
    /** Lo que se leyó (CUIT, tipo, número, fecha, importes…). */
    datos: jsonb('datos').$type<Record<string, unknown>>(),
    error: text('error'),
    proveedorId: uuid('proveedor_id'),
    compraId: uuid('compra_id'),
    ...marcasDeTiempo(),
  },
  (t) => [
    index().on(t.empresaId, t.estado, t.creado),
    check('facturas_recibidas_estado', sql`${t.estado} in ('leyendo', 'lista', 'registrada', 'descartada', 'error')`),
  ],
)
