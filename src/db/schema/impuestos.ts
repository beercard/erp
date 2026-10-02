import { sql } from 'drizzle-orm'
import { check, customType, index, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

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
