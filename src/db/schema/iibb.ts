import { sql } from 'drizzle-orm'
import { check, date, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { provincias } from './catalogos'
import { empresaId, id, marcasDeTiempo, precio } from './comunes'

/**
 * Padrones de Ingresos Brutos: la alícuota de percepción y de retención que
 * cada provincia le asigna a cada CUIT, con su vigencia (por lo general, un
 * mes). Se guardan solo los CUIT de clientes y proveedores de la empresa:
 * del archivo mensual de la provincia o de la consulta al servicio web.
 */
export const padronIibb = pgTable(
  'padron_iibb',
  {
    id: id(),
    empresaId: empresaId(),
    provincia: text('provincia')
      .notNull()
      .references(() => provincias.codigo),
    cuit: text('cuit').notNull(),
    desde: date('desde').notNull(),
    hasta: date('hasta').notNull(),
    /** Porcentaje (3 = 3 %). Nulo: el padrón no informa esta alícuota. */
    percepcion: precio('percepcion'),
    retencion: precio('retencion'),
    grupoPercepcion: text('grupo_percepcion'),
    grupoRetencion: text('grupo_retencion'),
    /** archivo | servicio */
    origen: text('origen').notNull(),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('padron_iibb_vigencia').on(t.empresaId, t.provincia, t.cuit, t.desde),
    index().on(t.empresaId, t.cuit),
    check('padron_iibb_origen', sql`${t.origen} in ('archivo', 'servicio')`),
    check('padron_iibb_fechas', sql`${t.hasta} >= ${t.desde}`),
  ],
)

/**
 * Acceso a ARBA (Provincia de Buenos Aires): CUIT y Clave de Identificación
 * Tributaria (CIT, cifrada), para consultar alícuotas y presentar el COT.
 */
export const arbaConfiguracion = pgTable(
  'arba_configuracion',
  {
    id: id(),
    empresaId: empresaId(),
    usuario: text('usuario').notNull(),
    /** CIT cifrada con la clave maestra. */
    cit: text('cit').notNull(),
    /** prueba | produccion */
    ambiente: text('ambiente').notNull().default('prueba'),
    /** Planta y puerta del establecimiento de origen, para el nombre del archivo del COT. */
    cotPlanta: text('cot_planta').notNull().default('000000'),
    cotPuerta: text('cot_puerta').notNull().default('000'),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.empresaId), check('arba_configuracion_ambiente', sql`${t.ambiente} in ('prueba', 'produccion')`)],
)
