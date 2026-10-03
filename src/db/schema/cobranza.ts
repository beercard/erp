import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { empresaId, id, importe, marcasDeTiempo } from './comunes'
import { comprobantes } from './facturacion'

/**
 * Cobranza automática: recordatorios de deuda antes y después del
 * vencimiento (correo y WhatsApp, con el estado de deuda) e intereses por
 * mora que se pasan a notas de débito.
 */

const deLaEmpresa = (
  nombre: string,
  empresa: Parameters<typeof foreignKey>[0]['columns'][0],
  columna: Parameters<typeof foreignKey>[0]['columns'][0],
  destino: { empresaId: Parameters<typeof foreignKey>[0]['columns'][0]; id: Parameters<typeof foreignKey>[0]['columns'][0] },
) => foreignKey({ name: nombre, columns: [empresa, columna], foreignColumns: [destino.empresaId, destino.id] })

export const cobranzaConfiguracion = pgTable(
  'cobranza_configuracion',
  {
    id: id(),
    empresaId: empresaId(),
    recordatorios: boolean('recordatorios').notNull().default(false),
    /** Aviso antes del vencimiento (días); 0 = sin aviso previo. */
    diasAntes: smallint('dias_antes').notNull().default(3),
    /** Días después del vencimiento en que se recuerda (y después se reclama). */
    etapas: smallint('etapas')
      .array()
      .notNull()
      .default(sql`'{1,7,15,30}'::smallint[]`),
    porCorreo: boolean('por_correo').notNull().default(true),
    porWhatsapp: boolean('por_whatsapp').notNull().default(false),
    /** Interés por mora, % mensual (simple, por día). Vacío: no se cobran intereses. */
    tasaMensual: numeric('tasa_mensual', { precision: 7, scale: 4 }),
    /** Días después del vencimiento en que empieza a correr el interés. */
    diasGracia: smallint('dias_gracia').notNull().default(0),
    /** Por debajo de esto no se hace nota de débito. */
    minimoInteres: importe('minimo_interes').notNull().default('0'),
    /** Último día en que salieron los recordatorios (una vuelta por día). */
    ultimoEnvio: date('ultimo_envio'),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.empresaId)],
)

/** Cada recordatorio mandado: un comprobante no recibe dos veces la misma etapa. */
export const recordatoriosDeuda = pgTable(
  'recordatorios_deuda',
  {
    id: id(),
    empresaId: empresaId(),
    comprobanteId: uuid('comprobante_id').notNull(),
    /** Días respecto del vencimiento (negativo: aviso previo). */
    etapa: smallint('etapa').notNull(),
    via: text('via').notNull(),
    destino: text('destino'),
    enviado: timestamp('enviado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('recordatorios_deuda_etapa').on(t.empresaId, t.comprobanteId, t.etapa, t.via),
    deLaEmpresa('recordatorios_deuda_comprobante_fk', t.empresaId, t.comprobanteId, comprobantes).onDelete('cascade'),
  ],
)

/** Intereses por mora ya cobrados (en nota de débito): el próximo cálculo arranca al día siguiente. */
export const interesesMora = pgTable(
  'intereses_mora',
  {
    id: id(),
    empresaId: empresaId(),
    comprobanteId: uuid('comprobante_id').notNull(),
    desde: date('desde').notNull(),
    hasta: date('hasta').notNull(),
    dias: integer('dias').notNull(),
    saldo: importe('saldo').notNull(),
    tasaMensual: numeric('tasa_mensual', { precision: 7, scale: 4 }).notNull(),
    importe: importe('importe').notNull(),
    notaDebitoId: uuid('nota_debito_id'),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.empresaId, t.comprobanteId, t.hasta),
    deLaEmpresa('intereses_mora_comprobante_fk', t.empresaId, t.comprobanteId, comprobantes),
  ],
)
