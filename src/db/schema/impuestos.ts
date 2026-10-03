import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { empresaId, id, importe, marcasDeTiempo } from './comunes'

/**
 * Etapa 6 (función "Informes e impuestos" del plan): libros y declaraciones
 * que se generan para ARCA y los fiscos provinciales.
 */

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => 'bytea',
  fromDriver: (v) => Buffer.from(v),
})

/**
 * Cada vez que se genera un libro o una declaración queda acá, con el
 * archivo exacto. Al marcarla presentada (con el número de transacción de
 * ARCA) el período queda cerrado para ese impuesto: no se cargan ni anulan
 * comprobantes de ese mes. Para corregir se reabre y se presenta una
 * rectificativa (secuencia 1, 2…).
 */
export const presentaciones = pgTable(
  'presentaciones',
  {
    id: id(),
    empresaId: empresaId(),
    /** iva_digital | sicore | iibb */
    impuesto: text('impuesto').notNull(),
    /** "AAAA-MM" */
    periodo: text('periodo').notNull(),
    /** 0 la original, 1… las rectificativas. */
    secuencia: smallint('secuencia').notNull().default(0),
    /** generada | presentada | reabierta */
    estado: text('estado').notNull().default('generada'),
    /** El .zip (o .txt) tal cual se bajó. */
    archivo: bytea('archivo').notNull(),
    nombreArchivo: text('nombre_archivo').notNull(),
    /** Totales y cantidades, para mostrar sin regenerar. */
    resumen: jsonb('resumen').notNull(),
    usuarioId: uuid('usuario_id'),
    presentada: timestamp('presentada', { withTimezone: true }),
    /** Número de transacción o de verificación que da ARCA al presentar. */
    transaccion: text('transaccion'),
    reabierta: timestamp('reabierta', { withTimezone: true }),
    motivo: text('motivo'),
    ...marcasDeTiempo(),
  },
  (t) => [
    index().on(t.empresaId, t.impuesto, t.periodo),
    // Una sola presentada por impuesto, período y secuencia.
    uniqueIndex('presentaciones_presentada')
      .on(t.empresaId, t.impuesto, t.periodo, t.secuencia)
      .where(sql`${t.estado} = 'presentada'`),
    check('presentaciones_impuesto', sql`${t.impuesto} in ('iva_digital', 'sicore', 'iibb')`),
    check('presentaciones_estado', sql`${t.estado} in ('generada', 'presentada', 'reabierta')`),
    check('presentaciones_periodo', sql`${t.periodo} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
)

/**
 * Saldos de IVA a favor con los que arranca un período cuando el mes
 * anterior no se presentó desde el sistema (por ejemplo, al empezar a usarlo).
 * Si el mes anterior está presentado acá, el saldo sale de esa presentación.
 */
export const saldosIva = pgTable(
  'saldos_iva',
  {
    id: id(),
    empresaId: empresaId(),
    /** Período al que se trae el saldo ("AAAA-MM"). */
    periodo: text('periodo').notNull(),
    /** Saldo técnico a favor (crédito fiscal que sobró). */
    tecnico: importe('tecnico').notNull().default('0'),
    /** Saldo de libre disponibilidad (pagos a cuenta que sobraron). */
    libre: importe('libre').notNull().default('0'),
    usuarioId: uuid('usuario_id'),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('saldos_iva_periodo').on(t.empresaId, t.periodo),
    check('saldos_iva_periodo_valido', sql`${t.periodo} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check('saldos_iva_positivos', sql`${t.tecnico} >= 0 and ${t.libre} >= 0`),
  ],
)

/** Configuración de impuestos de la empresa: a quién avisar y el contador. */
export const configuracionImpuestos = pgTable(
  'configuracion_impuestos',
  {
    id: id(),
    empresaId: empresaId(),
    /** Email del estudio contable: recibe el paquete del mes. */
    emailContador: text('email_contador'),
    /** Quién recibe los avisos de vencimientos (si no, el contador). */
    emailAvisos: text('email_avisos'),
    /** Días antes del vencimiento para avisar. */
    avisarDias: smallint('avisar_dias').notNull().default(3),
    /** Al marcar presentado el Libro IVA, mandar el paquete del mes al contador. */
    paqueteAlPresentar: boolean('paquete_al_presentar').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('configuracion_impuestos_empresa').on(t.empresaId),
    check('configuracion_impuestos_dias', sql`${t.avisarDias} between 0 and 15`),
  ],
)

/**
 * Obligaciones fiscales con vencimiento mensual. Las de IVA y SICORE se dan
 * por cumplidas solas cuando el período se marca presentado; las demás, a
 * mano. El día es el del mes siguiente al período (si cae en fin de semana,
 * se corre al lunes); cada vencimiento se puede corregir con la fecha exacta
 * del calendario de ARCA o del fisco provincial.
 */
export const obligaciones = pgTable(
  'obligaciones',
  {
    id: id(),
    empresaId: empresaId(),
    /** iva_digital | sicore | iibb | otro */
    impuesto: text('impuesto').notNull(),
    nombre: text('nombre').notNull(),
    dia: smallint('dia').notNull(),
    activa: boolean('activa').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('obligaciones_nombre').on(t.empresaId, t.nombre),
    unique('obligaciones_empresa_id').on(t.empresaId, t.id),
    check('obligaciones_impuesto', sql`${t.impuesto} in ('iva_digital', 'sicore', 'iibb', 'otro')`),
    check('obligaciones_dia', sql`${t.dia} between 1 and 31`),
  ],
)

export const vencimientos = pgTable(
  'vencimientos',
  {
    id: id(),
    empresaId: empresaId(),
    obligacionId: uuid('obligacion_id').notNull(),
    periodo: text('periodo').notNull(),
    fecha: date('fecha').notNull(),
    /** La fecha se corrigió a mano (no se recalcula). */
    ajustada: boolean('ajustada').notNull().default(false),
    /** Cumplida a mano (IIBB y otras); IVA y SICORE salen de las presentaciones. */
    cumplida: timestamp('cumplida', { withTimezone: true }),
    avisado: timestamp('avisado', { withTimezone: true }),
    avisadoVencido: timestamp('avisado_vencido', { withTimezone: true }),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('vencimientos_periodo').on(t.empresaId, t.obligacionId, t.periodo),
    index().on(t.empresaId, t.fecha),
    foreignKey({
      name: 'vencimientos_obligacion_fk',
      columns: [t.empresaId, t.obligacionId],
      foreignColumns: [obligaciones.empresaId, obligaciones.id],
    }).onDelete('cascade'),
  ],
)

/** Paquetes del mes mandados al contador (para no mandarlos dos veces solos). */
export const enviosContador = pgTable(
  'envios_contador',
  {
    id: id(),
    empresaId: empresaId(),
    periodo: text('periodo').notNull(),
    para: text('para').notNull(),
    correoId: uuid('correo_id'),
    automatico: boolean('automatico').notNull().default(false),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.empresaId, t.periodo)],
)
