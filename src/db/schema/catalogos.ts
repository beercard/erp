import { boolean, date, index, numeric, pgTable, primaryKey, smallint, text } from 'drizzle-orm/pg-core'

import { cotizacion } from './comunes'

/**
 * Catálogos fiscales globales, con los códigos de ARCA. Los comparten todas
 * las empresas y se cargan desde src/db/semillas/catalogos.ts.
 */

export const condicionesIva = pgTable('condiciones_iva', {
  /** Código de ARCA (CondicionIVAReceptorId, RG 5616). */
  codigo: smallint('codigo').primaryKey(),
  nombre: text('nombre').notNull(),
  /** Letra de factura que corresponde cuando el emisor es Responsable Inscripto. */
  letraDesdeInscripto: text('letra_desde_inscripto').notNull(),
})

export const tiposDocumento = pgTable('tipos_documento', {
  codigo: smallint('codigo').primaryKey(),
  nombre: text('nombre').notNull(),
  abreviatura: text('abreviatura').notNull(),
})

export const alicuotasIva = pgTable('alicuotas_iva', {
  codigo: smallint('codigo').primaryKey(),
  nombre: text('nombre').notNull(),
  porcentaje: numeric('porcentaje', { precision: 5, scale: 2 }).notNull(),
})

export const monedas = pgTable('monedas', {
  /** Código de ARCA: PES, DOL, 060 (euro)… */
  codigo: text('codigo').primaryKey(),
  iso: text('iso').notNull().unique(),
  nombre: text('nombre').notNull(),
  simbolo: text('simbolo').notNull(),
})

export const provincias = pgTable('provincias', {
  /** ISO 3166-2 sin el prefijo AR- (H = Chaco). */
  codigo: text('codigo').primaryKey(),
  nombre: text('nombre').notNull(),
  /** Jurisdicción del Convenio Multilateral (906 = Chaco). */
  jurisdiccionCm: smallint('jurisdiccion_cm').notNull().unique(),
})

export const cotizaciones = pgTable(
  'cotizaciones',
  {
    moneda: text('moneda')
      .notNull()
      .references(() => monedas.codigo),
    fecha: date('fecha').notNull(),
    /** bna_vendedor, bna_comprador, bcra_a3500, manual */
    fuente: text('fuente').notNull(),
    valor: cotizacion('valor').notNull(),
    oficial: boolean('oficial').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.moneda, t.fecha, t.fuente] }), index().on(t.moneda, t.fecha)],
)
