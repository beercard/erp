import { sql } from 'drizzle-orm'
import { boolean, check, date, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import { presupuestos } from './comercial'
import { empresaId, id, importe, marcasDeTiempo } from './comunes'
import { terceros } from './maestros'
import { empresas } from './plataforma'

/**
 * CRM: el embudo de ventas antes de la venta. Cada oportunidad avanza por
 * etapas que define la empresa, con actividades (llamadas, reuniones…) y un
 * historial; al ganarla se vuelve presupuesto y el prospecto, cliente.
 */

const deLaEmpresa = (
  nombre: string,
  empresa: Parameters<typeof foreignKey>[0]['columns'][0],
  columna: Parameters<typeof foreignKey>[0]['columns'][0],
  destino: { empresaId: Parameters<typeof foreignKey>[0]['columns'][0]; id: Parameters<typeof foreignKey>[0]['columns'][0] },
) => foreignKey({ name: nombre, columns: [empresa, columna], foreignColumns: [destino.empresaId, destino.id] })

export const crmEtapas = pgTable(
  'crm_etapas',
  {
    id: id(),
    empresaId: empresaId(),
    nombre: text('nombre').notNull(),
    orden: integer('orden').notNull().default(0),
    /** Probabilidad de cierre que se le asigna a la oportunidad al entrar a la etapa (0 a 100). */
    probabilidad: integer('probabilidad').notNull().default(10),
    /** Llegar a esta etapa es ganar la oportunidad. */
    ganada: boolean('ganada').notNull().default(false),
    /** Días en la etapa a partir de los que la oportunidad se marca como estancada (vacío: nunca). */
    diasAlerta: integer('dias_alerta'),
    ...marcasDeTiempo(),
  },
  (t) => [
    unique('crm_etapas_empresa_id').on(t.empresaId, t.id),
    index().on(t.empresaId, t.orden),
    check('crm_etapas_probabilidad', sql`${t.probabilidad} between 0 and 100`),
    check('crm_etapas_dias_alerta', sql`${t.diasAlerta} is null or ${t.diasAlerta} > 0`),
  ],
)

export const crmMotivosPerdida = pgTable(
  'crm_motivos_perdida',
  {
    id: id(),
    empresaId: empresaId(),
    nombre: text('nombre').notNull(),
    activo: boolean('activo').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [unique('crm_motivos_perdida_empresa_id').on(t.empresaId, t.id)],
)

export const crmOportunidades = pgTable(
  'crm_oportunidades',
  {
    id: id(),
    empresaId: empresaId(),
    titulo: text('titulo').notNull(),
    /** Cliente ya cargado; si es un prospecto nuevo queda vacío y se usan los datos de contacto. */
    terceroId: uuid('tercero_id'),
    empresaProspecto: text('empresa_prospecto'),
    contacto: text('contacto'),
    email: text('email'),
    telefono: text('telefono'),
    /** Etapa actual; una perdida conserva la etapa en la que se perdió. */
    etapaId: uuid('etapa_id').notNull(),
    /** Desde cuándo está en la etapa actual (para el tiempo en etapa y las estancadas). */
    etapaDesde: timestamp('etapa_desde', { withTimezone: true }).notNull().defaultNow(),
    /** abierta | ganada | perdida */
    estado: text('estado').notNull().default('abierta'),
    /** Ingreso esperado, neto de IVA. */
    ingresoEsperado: importe('ingreso_esperado').notNull().default('0'),
    probabilidad: integer('probabilidad').notNull().default(10),
    cierreEstimado: date('cierre_estimado'),
    /** 0 a 3 estrellas. */
    prioridad: integer('prioridad').notNull().default(0),
    responsableId: uuid('responsable_id'),
    /** De dónde vino: web, referido, Mercado Libre, llamada, feria… */
    origen: text('origen'),
    etiquetas: text('etiquetas')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    descripcion: text('descripcion'),
    /** Lo próximo que hay que hacer, en una línea. */
    proximoPaso: text('proximo_paso'),
    motivoPerdidaId: uuid('motivo_perdida_id'),
    notaPerdida: text('nota_perdida'),
    presupuestoId: uuid('presupuesto_id'),
    /** Posición dentro de la columna del embudo. */
    orden: integer('orden').notNull().default(0),
    cerrada: timestamp('cerrada', { withTimezone: true }),
    usuarioId: uuid('usuario_id'),
    ...marcasDeTiempo(),
  },
  (t) => [
    unique('crm_oportunidades_empresa_id').on(t.empresaId, t.id),
    index().on(t.empresaId, t.estado, t.etapaId),
    index().on(t.empresaId, t.terceroId),
    index().on(t.empresaId, t.responsableId),
    check('crm_oportunidades_estado', sql`${t.estado} in ('abierta','ganada','perdida')`),
    check('crm_oportunidades_probabilidad', sql`${t.probabilidad} between 0 and 100`),
    check('crm_oportunidades_prioridad', sql`${t.prioridad} between 0 and 3`),
    check('crm_oportunidades_ingreso', sql`${t.ingresoEsperado} >= 0`),
    deLaEmpresa('crm_oportunidades_tercero_fk', t.empresaId, t.terceroId, terceros).onDelete('set null'),
    deLaEmpresa('crm_oportunidades_etapa_fk', t.empresaId, t.etapaId, crmEtapas),
    deLaEmpresa('crm_oportunidades_motivo_fk', t.empresaId, t.motivoPerdidaId, crmMotivosPerdida),
    deLaEmpresa('crm_oportunidades_presupuesto_fk', t.empresaId, t.presupuestoId, presupuestos).onDelete('set null'),
  ],
)

export const crmActividades = pgTable(
  'crm_actividades',
  {
    id: id(),
    empresaId: empresaId(),
    oportunidadId: uuid('oportunidad_id').notNull(),
    /** llamada | reunion | email | whatsapp | tarea */
    tipo: text('tipo').notNull(),
    resumen: text('resumen').notNull(),
    vence: date('vence').notNull(),
    responsableId: uuid('responsable_id'),
    hecha: boolean('hecha').notNull().default(false),
    hechaEl: timestamp('hecha_el', { withTimezone: true }),
    /** Lo que pasó, al marcarla hecha. */
    resultado: text('resultado'),
    usuarioId: uuid('usuario_id'),
    ...marcasDeTiempo(),
  },
  (t) => [
    index().on(t.empresaId, t.oportunidadId),
    index().on(t.empresaId, t.hecha, t.vence),
    check('crm_actividades_tipo', sql`${t.tipo} in ('llamada','reunion','email','whatsapp','tarea')`),
    deLaEmpresa('crm_actividades_oportunidad_fk', t.empresaId, t.oportunidadId, crmOportunidades).onDelete('cascade'),
  ],
)

/** Historial de la oportunidad (notas y cambios), como el chatter de Odoo. */
export const crmHistorial = pgTable(
  'crm_historial',
  {
    id: id(),
    empresaId: empresaId(),
    oportunidadId: uuid('oportunidad_id').notNull(),
    /** nota | cambio */
    tipo: text('tipo').notNull().default('nota'),
    texto: text('texto').notNull(),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.empresaId, t.oportunidadId, t.creado),
    check('crm_historial_tipo', sql`${t.tipo} in ('nota','cambio','llamada','whatsapp','email')`),
    deLaEmpresa('crm_historial_oportunidad_fk', t.empresaId, t.oportunidadId, crmOportunidades).onDelete('cascade'),
  ],
)

/** Plantillas de mensajes para WhatsApp y email, con variables como {cliente} o {oportunidad}. */
export const crmPlantillas = pgTable(
  'crm_plantillas',
  {
    id: id(),
    empresaId: empresaId(),
    nombre: text('nombre').notNull(),
    /** whatsapp | email */
    canal: text('canal').notNull(),
    asunto: text('asunto'),
    texto: text('texto').notNull(),
    activa: boolean('activa').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [index().on(t.empresaId, t.canal), check('crm_plantillas_canal', sql`${t.canal} in ('whatsapp','email')`)],
)

/** Ajustes del CRM de cada empresa (una fila por empresa). */
export const crmAjustes = pgTable(
  'crm_ajustes',
  {
    id: id(),
    empresaId: empresaId(),
    /** ninguna | rotativa: cómo se asignan las oportunidades que entran solas (formulario web). */
    asignacion: text('asignacion').notNull().default('ninguna'),
    /** Vendedores entre los que se reparte, en orden. */
    vendedores: uuid('vendedores').array().notNull().default(sql`'{}'::uuid[]`),
    ultimoAsignado: integer('ultimo_asignado').notNull().default(-1),
    /** Resumen diario por email con las actividades vencidas y de hoy. */
    resumenDiario: boolean('resumen_diario').notNull().default(true),
    ultimoResumen: date('ultimo_resumen'),
    ...marcasDeTiempo(),
  },
  (t) => [
    unique('crm_ajustes_empresa').on(t.empresaId),
    check('crm_ajustes_asignacion', sql`${t.asignacion} in ('ninguna','rotativa')`),
  ],
)

/**
 * Formulario web de la empresa (captura de oportunidades desde su sitio).
 * Es de plataforma: el pedido llega sin sesión y por el token se sabe de qué
 * empresa es. Solo guarda ese vínculo.
 */
export const crmFormularios = pgTable('crm_formularios', {
  token: text('token').primaryKey(),
  empresaId: uuid('empresa_id')
    .notNull()
    .unique()
    .references(() => empresas.id, { onDelete: 'cascade' }),
  activo: boolean('activo').notNull().default(true),
  origen: text('origen').notNull().default('Formulario web'),
  creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
})
