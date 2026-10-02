import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { alicuotasIva, monedas } from './catalogos'
import { cotizacion, empresaId, id, importe, marcasDeTiempo } from './comunes'
import { comprobantes } from './facturacion'
import { articulos, terceros } from './maestros'

/**
 * Etapa 5 (módulo opcional "contratos"): parque instalado, contratos por
 * copias, lecturas de contadores y facturación mensual.
 *
 * Reglas de diseño (sacadas de cómo factura KOMSA en PYMEXIS):
 * - Un contrato agrupa los equipos de un cliente que se facturan juntos: las
 *   copias de todos se suman y se comparan con las copias libres del contrato.
 * - Modalidades: abono (cargo fijo + copias libres + excedente por copia),
 *   excedente (todas las copias por el precio) y cargo fijo (sin copias).
 * - Cargo fijo y copias libres pueden ser del contrato o por equipo (se
 *   multiplican por los equipos activos).
 * - Adelantado: el cargo fijo es del mes siguiente; vencido: del mes leído.
 *   El excedente siempre es del mes leído.
 * - Precios en dólares se facturan en pesos al dólar del día.
 */

const deLaEmpresa = (
  nombre: string,
  empresa: Parameters<typeof foreignKey>[0]['columns'][0],
  columna: Parameters<typeof foreignKey>[0]['columns'][0],
  destino: { empresaId: Parameters<typeof foreignKey>[0]['columns'][0]; id: Parameters<typeof foreignKey>[0]['columns'][0] },
) => foreignKey({ name: nombre, columns: [empresa, columna], foreignColumns: [destino.empresaId, destino.id] })

export const modelosEquipo = pgTable(
  'modelos_equipo',
  {
    id: id(),
    empresaId: empresaId(),
    codigo: text('codigo').notNull(),
    nombre: text('nombre').notNull(),
    color: boolean('color').notNull().default(false),
    multifuncion: boolean('multifuncion').notNull().default(false),
    activo: boolean('activo').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.codigo), unique('modelos_equipo_empresa_id').on(t.empresaId, t.id)],
)

export const contratos = pgTable(
  'contratos',
  {
    id: id(),
    empresaId: empresaId(),
    numero: integer('numero').notNull(),
    terceroId: uuid('tercero_id').notNull(),
    /** Tipo comercial (servicio de fotocopiado, de impresión, full print…). */
    tipo: text('tipo').notNull(),
    /** abono | excedente | cargo_fijo */
    modalidad: text('modalidad').notNull().default('abono'),
    /** adelantada | vencida */
    facturacion: text('facturacion').notNull().default('vencida'),
    moneda: text('moneda')
      .notNull()
      .default('PES')
      .references(() => monedas.codigo),
    cargoFijo: importe('cargo_fijo').notNull().default('0'),
    copiasLibres: integer('copias_libres').notNull().default(0),
    /** Precio de cada copia por encima de las libres (en la moneda del contrato; PYMEXIS usa 5 decimales). */
    precioExcedente: numeric('precio_excedente', { precision: 18, scale: 6 }).notNull().default('0'),
    /** Cargo fijo y copias libres por cada equipo activo (si no, son del contrato). */
    porEquipo: boolean('por_equipo').notNull().default(false),
    alicuotaIva: smallint('alicuota_iva')
      .notNull()
      .default(5)
      .references(() => alicuotasIva.codigo),
    /** Texto que se agrega a la factura. */
    leyenda: text('leyenda'),
    desde: date('desde'),
    hasta: date('hasta'),
    /** activo | suspendido | finalizado */
    estado: text('estado').notNull().default('activo'),
    /** Clave en el sistema anterior (cliente|grupo o equipo), para importar sin duplicar. */
    codigoOrigen: text('codigo_origen'),
    observaciones: text('observaciones'),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.numero),
    uniqueIndex('contratos_codigo_origen').on(t.empresaId, t.codigoOrigen),
    index().on(t.empresaId, t.terceroId),
    unique('contratos_empresa_id').on(t.empresaId, t.id),
    check('contratos_modalidad', sql`${t.modalidad} in ('abono', 'excedente', 'cargo_fijo')`),
    check('contratos_facturacion', sql`${t.facturacion} in ('adelantada', 'vencida')`),
    check('contratos_estado', sql`${t.estado} in ('activo', 'suspendido', 'finalizado')`),
    deLaEmpresa('contratos_tercero_fk', t.empresaId, t.terceroId, terceros),
  ],
)

/** Cada equipo con su número de serie: instalado en un cliente o retirado. */
export const equipos = pgTable(
  'equipos',
  {
    id: id(),
    empresaId: empresaId(),
    serie: text('serie').notNull(),
    modeloId: uuid('modelo_id'),
    articuloId: uuid('articulo_id'),
    terceroId: uuid('tercero_id'),
    /** El contrato por el que se factura (nulo: vendido, en servicio técnico o comodato). */
    contratoId: uuid('contrato_id'),
    /** contrato | venta | servicio_tecnico | comodato | leasing | donacion */
    comercializacion: text('comercializacion').notNull().default('venta'),
    /** instalado | retirado */
    estado: text('estado').notNull().default('instalado'),
    fechaInstalacion: date('fecha_instalacion'),
    garantiaHasta: date('garantia_hasta'),
    fechaRetiro: date('fecha_retiro'),
    motivoRetiro: text('motivo_retiro'),
    domicilio: text('domicilio'),
    localidad: text('localidad'),
    sector: text('sector'),
    contacto: text('contacto'),
    telefono: text('telefono'),
    horario: text('horario'),
    ip: text('ip'),
    tecnico: text('tecnico'),
    /** Contador al instalarlo (desde ahí se cuentan las copias). */
    contadorInicial: bigint('contador_inicial', { mode: 'number' }).notNull().default(0),
    observaciones: text('observaciones'),
    codigoOrigen: text('codigo_origen'),
    ...marcasDeTiempo(),
  },
  (t) => [
    index().on(t.empresaId, t.serie),
    index().on(t.empresaId, t.terceroId),
    index().on(t.empresaId, t.contratoId),
    uniqueIndex('equipos_codigo_origen').on(t.empresaId, t.codigoOrigen),
    unique('equipos_empresa_id').on(t.empresaId, t.id),
    check('equipos_estado', sql`${t.estado} in ('instalado', 'retirado')`),
    check(
      'equipos_comercializacion',
      sql`${t.comercializacion} in ('contrato', 'venta', 'servicio_tecnico', 'comodato', 'leasing', 'donacion')`,
    ),
    deLaEmpresa('equipos_modelo_fk', t.empresaId, t.modeloId, modelosEquipo),
    deLaEmpresa('equipos_articulo_fk', t.empresaId, t.articuloId, articulos),
    deLaEmpresa('equipos_tercero_fk', t.empresaId, t.terceroId, terceros),
    deLaEmpresa('equipos_contrato_fk', t.empresaId, t.contratoId, contratos),
  ],
)

/** Lectura del contador de un equipo (a mano, del técnico, de MPS Monitor o migrada). */
export const lecturas = pgTable(
  'lecturas',
  {
    id: id(),
    empresaId: empresaId(),
    equipoId: uuid('equipo_id').notNull(),
    fecha: date('fecha').notNull(),
    contador: bigint('contador', { mode: 'number' }).notNull(),
    /** Copias de prueba del técnico: no se le cobran al cliente. */
    creditos: integer('creditos').notNull().default(0),
    /** manual | archivo | mps | pymexis */
    origen: text('origen').notNull().default('manual'),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.equipoId, t.fecha),
    check('lecturas_origen', sql`${t.origen} in ('manual', 'archivo', 'mps', 'pymexis')`),
    check('lecturas_positivo', sql`${t.contador} >= 0 and ${t.creditos} >= 0`),
    deLaEmpresa('lecturas_equipo_fk', t.empresaId, t.equipoId, equipos).onDelete('cascade'),
  ],
)

/** Lo facturado de un contrato en un mes, con el detalle de cada equipo. */
export const facturacionesContrato = pgTable(
  'facturaciones_contrato',
  {
    id: id(),
    empresaId: empresaId(),
    contratoId: uuid('contrato_id').notNull(),
    /** Mes de las lecturas, "AAAA-MM". */
    periodo: text('periodo').notNull(),
    fecha: date('fecha').notNull(),
    equipos: integer('equipos').notNull(),
    copias: integer('copias').notNull(),
    copiasLibres: integer('copias_libres').notNull(),
    copiasExcedentes: integer('copias_excedentes').notNull(),
    /** Importes en la moneda del contrato. */
    cargo: importe('cargo').notNull(),
    excedente: importe('excedente').notNull(),
    total: importe('total').notNull(),
    moneda: text('moneda').notNull(),
    cotizacion: cotizacion('cotizacion').notNull().default('1'),
    /** Cada equipo: { equipoId, serie, anterior, actual, creditos, copias }. */
    detalle: jsonb('detalle').notNull(),
    comprobanteId: uuid('comprobante_id'),
    /** facturada | anulada */
    estado: text('estado').notNull().default('facturada'),
    /** erp | pymexis */
    origen: text('origen').notNull().default('erp'),
    usuarioId: uuid('usuario_id'),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('facturaciones_contrato_periodo')
      .on(t.empresaId, t.contratoId, t.periodo)
      .where(sql`${t.estado} = 'facturada'`),
    index().on(t.empresaId, t.periodo),
    check('facturaciones_contrato_estado', sql`${t.estado} in ('facturada', 'anulada')`),
    check('facturaciones_contrato_periodo_valido', sql`${t.periodo} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    deLaEmpresa('facturaciones_contrato_contrato_fk', t.empresaId, t.contratoId, contratos),
    deLaEmpresa('facturaciones_contrato_comprobante_fk', t.empresaId, t.comprobanteId, comprobantes),
  ],
)
