import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { alicuotasIva } from './catalogos'
import { cantidad, empresaId, id, marcasDeTiempo, precio } from './comunes'
import { contratos, equipos } from './contratos'
import { articulos, depositos, terceros } from './maestros'
import { usuarios } from './plataforma'

/**
 * Etapa 5 (módulo opcional "contratos"): servicio técnico sobre el parque
 * instalado.
 *
 * - Una orden de servicio es un pedido del cliente (una falla, un
 *   preventivo, una instalación…), casi siempre sobre un equipo.
 * - Se asigna a un técnico, que la visita una o más veces, carga los
 *   insumos y repuestos que usó (descuentan stock en el momento) y la
 *   resuelve, con el contador del equipo si lo tomó.
 * - La cobertura dice quién paga: lo cubre el contrato, la garantía, o va
 *   con cargo al cliente y se factura (queda una factura en borrador).
 * - La factura de la orden se guarda en `comprobante_id`. Esa clave foránea
 *   está en la migración de seguridad, con ON DELETE SET NULL: si se borra
 *   el borrador, la orden queda otra vez sin facturar.
 */

const deLaEmpresa = (
  nombre: string,
  empresa: Parameters<typeof foreignKey>[0]['columns'][0],
  columna: Parameters<typeof foreignKey>[0]['columns'][0],
  destino: { empresaId: Parameters<typeof foreignKey>[0]['columns'][0]; id: Parameters<typeof foreignKey>[0]['columns'][0] },
) => foreignKey({ name: nombre, columns: [empresa, columna], foreignColumns: [destino.empresaId, destino.id] })

export const tecnicos = pgTable(
  'tecnicos',
  {
    id: id(),
    empresaId: empresaId(),
    codigo: text('codigo').notNull(),
    nombre: text('nombre').notNull(),
    telefono: text('telefono'),
    email: text('email'),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    activo: boolean('activo').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.codigo), unique('tecnicos_empresa_id').on(t.empresaId, t.id)],
)

export const ordenesServicio = pgTable(
  'ordenes_servicio',
  {
    id: id(),
    empresaId: empresaId(),
    numero: integer('numero').notNull(),
    fecha: date('fecha').notNull(),
    terceroId: uuid('tercero_id').notNull(),
    equipoId: uuid('equipo_id'),
    /** Contrato del equipo al abrir la orden. */
    contratoId: uuid('contrato_id'),
    /** correctivo | preventivo | instalacion | retiro | insumos */
    tipo: text('tipo').notNull().default('correctivo'),
    /** normal | urgente */
    prioridad: text('prioridad').notNull().default('normal'),
    /** Lo que pide o reporta el cliente. */
    falla: text('falla').notNull(),
    contacto: text('contacto'),
    telefono: text('telefono'),
    domicilio: text('domicilio'),
    tecnicoId: uuid('tecnico_id'),
    /** Día de visita acordado. */
    programada: date('programada'),
    /** pendiente | asignada | resuelta | cancelada */
    estado: text('estado').notNull().default('pendiente'),
    /** contrato | garantia | cargo */
    cobertura: text('cobertura').notNull().default('cargo'),
    solucion: text('solucion'),
    fechaResolucion: date('fecha_resolucion'),
    /** Contador que tomó el técnico al resolver (también queda como lectura del equipo). */
    contador: bigint('contador', { mode: 'number' }),
    motivoCancelacion: text('motivo_cancelacion'),
    comprobanteId: uuid('comprobante_id'),
    observaciones: text('observaciones'),
    usuarioId: uuid('usuario_id'),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.numero),
    index().on(t.empresaId, t.estado),
    index().on(t.empresaId, t.terceroId),
    index().on(t.empresaId, t.equipoId),
    index().on(t.empresaId, t.tecnicoId),
    unique('ordenes_servicio_empresa_id').on(t.empresaId, t.id),
    check('ordenes_servicio_tipo', sql`${t.tipo} in ('correctivo', 'preventivo', 'instalacion', 'retiro', 'insumos')`),
    check('ordenes_servicio_prioridad', sql`${t.prioridad} in ('normal', 'urgente')`),
    check('ordenes_servicio_estado', sql`${t.estado} in ('pendiente', 'asignada', 'resuelta', 'cancelada')`),
    check('ordenes_servicio_cobertura', sql`${t.cobertura} in ('contrato', 'garantia', 'cargo')`),
    check(
      'ordenes_servicio_resuelta',
      sql`(${t.estado} = 'resuelta') = (${t.fechaResolucion} is not null) and (${t.estado} <> 'resuelta' or ${t.solucion} is not null)`,
    ),
    deLaEmpresa('ordenes_servicio_tercero_fk', t.empresaId, t.terceroId, terceros),
    deLaEmpresa('ordenes_servicio_equipo_fk', t.empresaId, t.equipoId, equipos),
    deLaEmpresa('ordenes_servicio_contrato_fk', t.empresaId, t.contratoId, contratos),
    deLaEmpresa('ordenes_servicio_tecnico_fk', t.empresaId, t.tecnicoId, tecnicos),
  ],
)

/** Cada visita del técnico: qué hizo y cuánto tiempo le llevó. */
export const ordenesServicioVisitas = pgTable(
  'ordenes_servicio_visitas',
  {
    id: id(),
    empresaId: empresaId(),
    ordenId: uuid('orden_id').notNull(),
    fecha: date('fecha').notNull(),
    tecnicoId: uuid('tecnico_id'),
    /** Horas de trabajo (con decimales: 1,5 es una hora y media). */
    horas: precio('horas').notNull().default('0'),
    detalle: text('detalle').notNull(),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.empresaId, t.ordenId),
    check('ordenes_servicio_visitas_horas', sql`${t.horas} >= 0`),
    deLaEmpresa('ordenes_servicio_visitas_orden_fk', t.empresaId, t.ordenId, ordenesServicio),
    deLaEmpresa('ordenes_servicio_visitas_tecnico_fk', t.empresaId, t.tecnicoId, tecnicos),
  ],
)

/**
 * Insumos, repuestos y mano de obra de la orden. Un artículo con stock sale
 * del depósito al cargarlo (movimiento "servicio") y vuelve si se quita.
 * El precio es el que se factura si la orden va con cargo.
 */
export const ordenesServicioItems = pgTable(
  'ordenes_servicio_items',
  {
    id: id(),
    empresaId: empresaId(),
    ordenId: uuid('orden_id').notNull(),
    articuloId: uuid('articulo_id'),
    descripcion: text('descripcion').notNull(),
    cantidad: cantidad('cantidad').notNull(),
    depositoId: uuid('deposito_id'),
    precioUnitario: precio('precio_unitario').notNull().default('0'),
    alicuotaIva: smallint('alicuota_iva')
      .notNull()
      .default(5)
      .references(() => alicuotasIva.codigo),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.empresaId, t.ordenId),
    check('ordenes_servicio_items_cantidad', sql`${t.cantidad} > 0 and ${t.precioUnitario} >= 0`),
    deLaEmpresa('ordenes_servicio_items_orden_fk', t.empresaId, t.ordenId, ordenesServicio),
    deLaEmpresa('ordenes_servicio_items_articulo_fk', t.empresaId, t.articuloId, articulos),
    deLaEmpresa('ordenes_servicio_items_deposito_fk', t.empresaId, t.depositoId, depositos),
  ],
)
