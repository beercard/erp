import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  customType,
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
 *
 * Funciona como Persat (ver docs/04-servicio-tecnico.md): cada tipo de orden
 * tiene un formulario de instrucciones y uno de devolución, versionados; la
 * orden pasa por pendiente → proyectada → asignada → informe → cerrada (OK,
 * con desvío o no cumplida), o vencida si el técnico no informa a tiempo.
 */

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => 'bytea',
  fromDriver: (v) => Buffer.from(v),
})

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
    /** Con este email entra al sistema y ve su agenda (Mi agenda). */
    email: text('email'),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    /** Su camioneta: de acá salen los materiales que carga en la devolución. */
    depositoId: uuid('deposito_id'),
    /** Jornada para el asistente de huecos: "HH:MM", y días que trabaja (1 = lunes … 7 = domingo). */
    jornadaDesde: text('jornada_desde').notNull().default('08:00'),
    jornadaHasta: text('jornada_hasta').notNull().default('17:00'),
    dias: text('dias').notNull().default('12345'),
    /** Desde dónde sale (domicilio), como el punto de partida de Persat. */
    partida: text('partida'),
    partidaLat: numeric('partida_lat', { precision: 9, scale: 6 }),
    partidaLng: numeric('partida_lng', { precision: 9, scale: 6 }),
    activo: boolean('activo').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.codigo),
    unique('tecnicos_empresa_id').on(t.empresaId, t.id),
    check(
      'tecnicos_jornada',
      sql`${t.jornadaDesde} ~ '^[0-2][0-9]:[0-5][0-9]$' and ${t.jornadaHasta} ~ '^[0-2][0-9]:[0-5][0-9]$'`,
    ),
    check('tecnicos_dias', sql`${t.dias} ~ '^[1-7]{1,7}$'`),
    deLaEmpresa('tecnicos_deposito_fk', t.empresaId, t.depositoId, depositos),
  ],
)

/** Tipo de orden: correctivo de fotocopiadora, preventivo, instalación… Cada uno con sus formularios. */
export const tiposOrden = pgTable(
  'tipos_orden',
  {
    id: id(),
    empresaId: empresaId(),
    codigo: text('codigo').notNull(),
    nombre: text('nombre').notNull(),
    /** correctivo | preventivo | instalacion | retiro | insumos (para agrupar e informar) */
    clase: text('clase').notNull().default('correctivo'),
    color: text('color').notNull().default('#2563eb'),
    /** Duración estimada de la visita, en minutos. */
    duracion: integer('duracion').notNull().default(60),
    /** Horas que tiene el técnico para informar desde la hora programada; después la orden vence. */
    plazoHoras: integer('plazo_horas').notNull().default(48),
    /** El cliente lo puede pedir desde el portal. */
    portal: boolean('portal').notNull().default(false),
    /** Versión vigente de los formularios (la última de plantillas_orden). */
    version: integer('version').notNull().default(1),
    activo: boolean('activo').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.codigo),
    unique('tipos_orden_empresa_id').on(t.empresaId, t.id),
    check('tipos_orden_clase', sql`${t.clase} in ('correctivo', 'preventivo', 'instalacion', 'retiro', 'insumos')`),
    check('tipos_orden_tiempos', sql`${t.duracion} between 5 and 1440 and ${t.plazoHoras} between 1 and 720`),
  ],
)

/**
 * Formularios de un tipo de orden, versionados: cambiar un formulario crea
 * una versión nueva y las órdenes viejas siguen con la suya. Una versión no
 * se modifica ni se borra (lo impide la base).
 */
export const plantillasOrden = pgTable(
  'plantillas_orden',
  {
    id: id(),
    empresaId: empresaId(),
    tipoId: uuid('tipo_id').notNull(),
    version: integer('version').notNull(),
    /** Campos que completa la oficina (ver src/modulos/servicio/formularios.ts). */
    instrucciones: jsonb('instrucciones').notNull(),
    /** Campos que completa el técnico. */
    devolucion: jsonb('devolucion').notNull(),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.tipoId, t.version),
    unique('plantillas_orden_empresa_id').on(t.empresaId, t.id),
    deLaEmpresa('plantillas_orden_tipo_fk', t.empresaId, t.tipoId, tiposOrden),
  ],
)

/**
 * Mantenimiento preventivo: genera órdenes solas cada N semanas o meses, o
 * cada N copias del equipo (con las lecturas del contrato).
 */
export const reglasPreventivo = pgTable(
  'reglas_preventivo',
  {
    id: id(),
    empresaId: empresaId(),
    terceroId: uuid('tercero_id').notNull(),
    equipoId: uuid('equipo_id'),
    tipoOrdenId: uuid('tipo_orden_id').notNull(),
    /** semanal | mensual | copias */
    frecuencia: text('frecuencia').notNull(),
    /** Cada cuántas semanas, meses o copias. */
    cada: integer('cada').notNull(),
    desde: date('desde').notNull(),
    hora: text('hora'),
    tecnicoId: uuid('tecnico_id'),
    /** Última fecha generada (semanal y mensual). */
    ultimaFecha: date('ultima_fecha'),
    /** Contador desde el que se cuentan las copias (por copias). */
    contadorBase: bigint('contador_base', { mode: 'number' }),
    activa: boolean('activa').notNull().default(true),
    observaciones: text('observaciones'),
    ...marcasDeTiempo(),
  },
  (t) => [
    index().on(t.empresaId, t.terceroId),
    unique('reglas_preventivo_empresa_id').on(t.empresaId, t.id),
    check('reglas_preventivo_frecuencia', sql`${t.frecuencia} in ('semanal', 'mensual', 'copias')`),
    check('reglas_preventivo_cada', sql`${t.cada} > 0`),
    check('reglas_preventivo_copias_con_equipo', sql`${t.frecuencia} <> 'copias' or ${t.equipoId} is not null`),
    deLaEmpresa('reglas_preventivo_tercero_fk', t.empresaId, t.terceroId, terceros),
    deLaEmpresa('reglas_preventivo_equipo_fk', t.empresaId, t.equipoId, equipos),
    deLaEmpresa('reglas_preventivo_tipo_fk', t.empresaId, t.tipoOrdenId, tiposOrden),
    deLaEmpresa('reglas_preventivo_tecnico_fk', t.empresaId, t.tecnicoId, tecnicos),
  ],
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
    /** Clase: correctivo | preventivo | instalacion | retiro | insumos (la del tipo, si tiene). */
    tipo: text('tipo').notNull().default('correctivo'),
    tipoOrdenId: uuid('tipo_orden_id'),
    /** Versión de los formularios con la que se abrió. */
    plantillaId: uuid('plantilla_id'),
    /** Respuestas del formulario de instrucciones y del de devolución. */
    instrucciones: jsonb('instrucciones').notNull().default({}),
    resultados: jsonb('resultados'),
    /** normal | urgente */
    prioridad: text('prioridad').notNull().default('normal'),
    /** Lo que pide o reporta el cliente. */
    falla: text('falla').notNull(),
    contacto: text('contacto'),
    telefono: text('telefono'),
    domicilio: text('domicilio'),
    tecnicoId: uuid('tecnico_id'),
    /** Día y hora de la visita ("HH:MM") y duración estimada en minutos. */
    programada: date('programada'),
    hora: text('hora'),
    duracion: integer('duracion').notNull().default(60),
    /** Pasado este momento sin informe, la orden vence. */
    vence: timestamp('vence', { withTimezone: true }),
    /**
     * pendiente (sin fecha) | proyectada (con fecha, sin técnico) | asignada |
     * informe (el técnico la completó; falta revisarla) | vencida |
     * cerrada_ok | cerrada_desvio | cerrada_no_cumplida | cancelada
     */
    estado: text('estado').notNull().default('pendiente'),
    /** contrato | garantia | cargo */
    cobertura: text('cobertura').notNull().default('cargo'),
    solucion: text('solucion'),
    fechaResolucion: date('fecha_resolucion'),
    /** Contador que tomó el técnico al resolver (también queda como lectura del equipo). */
    contador: bigint('contador', { mode: 'number' }),
    motivoCancelacion: text('motivo_cancelacion'),
    /** Llegada y salida del técnico, con la ubicación del celular. */
    llegada: timestamp('llegada', { withTimezone: true }),
    llegadaLat: numeric('llegada_lat', { precision: 9, scale: 6 }),
    llegadaLng: numeric('llegada_lng', { precision: 9, scale: 6 }),
    salida: timestamp('salida', { withTimezone: true }),
    informada: timestamp('informada', { withTimezone: true }),
    /** Cierre que propone el técnico y el que pone el supervisor: ok | desvio | no_cumplida */
    cierreTecnico: text('cierre_tecnico'),
    notaCierre: text('nota_cierre'),
    cerrada: timestamp('cerrada', { withTimezone: true }),
    cerradaPor: uuid('cerrada_por'),
    /**
     * Tiempos comprometidos (SLA), fijados al abrir según la prioridad y el
     * contrato: hasta cuándo hay que llegar y hasta cuándo resolverla.
     */
    slaRespuesta: timestamp('sla_respuesta', { withTimezone: true }),
    slaResolucion: timestamp('sla_resolucion', { withTimezone: true }),
    /** Cuándo se avisó a coordinación que el SLA vencía (para no repetir). */
    alertaSla: timestamp('alerta_sla', { withTimezone: true }),
    /** Cuándo se le avisó al cliente el día de la visita (y para qué día). */
    avisoVisita: timestamp('aviso_visita', { withTimezone: true }),
    /** Email del cliente para esta orden (si no, el de su ficha). */
    email: text('email'),
    /** Quién la abrió: oficina | portal (el cliente) | api | preventivo */
    origen: text('origen').notNull().default('oficina'),
    /** Dónde es la visita (del equipo, o geocodificado del domicilio). */
    lat: numeric('lat', { precision: 9, scale: 6 }),
    lng: numeric('lng', { precision: 9, scale: 6 }),
    /** Regla de preventivo que la generó, y para qué fecha (o contador). */
    preventivoId: uuid('preventivo_id'),
    origenPreventivo: text('origen_preventivo'),
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
    check(
      'ordenes_servicio_estado',
      sql`${t.estado} in ('pendiente', 'proyectada', 'asignada', 'informe', 'vencida', 'cerrada_ok', 'cerrada_desvio', 'cerrada_no_cumplida', 'cancelada')`,
    ),
    check('ordenes_servicio_cobertura', sql`${t.cobertura} in ('contrato', 'garantia', 'cargo')`),
    check('ordenes_servicio_cierre_tecnico', sql`${t.cierreTecnico} in ('ok', 'desvio', 'no_cumplida')`),
    check(
      'ordenes_servicio_cerrada',
      sql`(${t.estado} like 'cerrada%') = (${t.fechaResolucion} is not null and ${t.cerrada} is not null)`,
    ),
    check('ordenes_servicio_hora', sql`${t.hora} ~ '^[0-2][0-9]:[0-5][0-9]$'`),
    check('ordenes_servicio_duracion', sql`${t.duracion} between 5 and 1440`),
    check('ordenes_servicio_origen', sql`${t.origen} in ('oficina', 'portal', 'api', 'preventivo', 'persat')`),
    uniqueIndex('ordenes_servicio_preventivo').on(t.empresaId, t.preventivoId, t.origenPreventivo),
    deLaEmpresa('ordenes_servicio_tipo_orden_fk', t.empresaId, t.tipoOrdenId, tiposOrden),
    deLaEmpresa('ordenes_servicio_plantilla_fk', t.empresaId, t.plantillaId, plantillasOrden),
    deLaEmpresa('ordenes_servicio_preventivo_fk', t.empresaId, t.preventivoId, reglasPreventivo),
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

/**
 * Formularios sueltos (como los de Persat): un relevamiento, un checklist de
 * la camioneta, un pedido del cliente… que no son una orden. Cada envío cae
 * en la bandeja de entrada con un estado de color que define la empresa.
 */
export const formularios = pgTable(
  'formularios',
  {
    id: id(),
    empresaId: empresaId(),
    codigo: text('codigo').notNull(),
    nombre: text('nombre').notNull(),
    descripcion: text('descripcion'),
    /** Definición (la misma que la de los tipos de orden). Cada envío guarda la suya. */
    campos: jsonb('campos').notNull(),
    version: integer('version').notNull().default(1),
    /** Pide elegir el cliente (y con eso, un equipo del cliente). */
    pideCliente: boolean('pide_cliente').notNull().default(true),
    /** Quién lo puede completar además de la oficina. */
    tecnico: boolean('tecnico').notNull().default(true),
    portal: boolean('portal').notNull().default(false),
    color: text('color').notNull().default('#2563eb'),
    activo: boolean('activo').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('formularios_codigo').on(t.empresaId, t.codigo),
    unique('formularios_empresa_id').on(t.empresaId, t.id),
    check('formularios_color', sql`${t.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
)

/** Estados de la bandeja de entrada (los define la empresa, con su color). */
export const estadosBandeja = pgTable(
  'estados_bandeja',
  {
    id: id(),
    empresaId: empresaId(),
    nombre: text('nombre').notNull(),
    color: text('color').notNull(),
    orden: smallint('orden').notNull().default(0),
    /** Un envío en un estado final ya no está pendiente. */
    final: boolean('final').notNull().default(false),
    /** El estado con el que entra un envío nuevo. */
    inicial: boolean('inicial').notNull().default(false),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('estados_bandeja_nombre').on(t.empresaId, t.nombre),
    unique('estados_bandeja_empresa_id').on(t.empresaId, t.id),
    check('estados_bandeja_color', sql`${t.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
)

/** Un formulario completado. Mientras es borrador no tiene número ni estado. */
export const enviosFormulario = pgTable(
  'envios_formulario',
  {
    id: id(),
    empresaId: empresaId(),
    numero: integer('numero'),
    formularioId: uuid('formulario_id').notNull(),
    version: integer('version').notNull(),
    /** La definición con la que se completó (no cambia si después se edita el formulario). */
    campos: jsonb('campos').notNull(),
    valores: jsonb('valores').notNull().default({}),
    terceroId: uuid('tercero_id'),
    equipoId: uuid('equipo_id'),
    ordenId: uuid('orden_id'),
    /** oficina | tecnico | portal */
    origen: text('origen').notNull().default('oficina'),
    usuarioId: uuid('usuario_id'),
    usuarioPortalId: uuid('usuario_portal_id'),
    tecnicoId: uuid('tecnico_id'),
    estadoId: uuid('estado_id'),
    /** Nota interna de la oficina (no la ve el cliente). */
    nota: text('nota'),
    lat: numeric('lat', { precision: 9, scale: 6 }),
    lng: numeric('lng', { precision: 9, scale: 6 }),
    enviado: timestamp('enviado', { withTimezone: true }),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('envios_formulario_numero').on(t.empresaId, t.numero),
    unique('envios_formulario_empresa_id').on(t.empresaId, t.id),
    index().on(t.empresaId, t.estadoId),
    index().on(t.empresaId, t.terceroId),
    check('envios_formulario_origen', sql`${t.origen} in ('oficina', 'tecnico', 'portal')`),
    check('envios_formulario_borrador', sql`(${t.enviado} is null) = (${t.numero} is null)`),
    deLaEmpresa('envios_formulario_formulario_fk', t.empresaId, t.formularioId, formularios),
    deLaEmpresa('envios_formulario_tercero_fk', t.empresaId, t.terceroId, terceros),
    deLaEmpresa('envios_formulario_equipo_fk', t.empresaId, t.equipoId, equipos),
    deLaEmpresa('envios_formulario_orden_fk', t.empresaId, t.ordenId, ordenesServicio),
    deLaEmpresa('envios_formulario_tecnico_fk', t.empresaId, t.tecnicoId, tecnicos),
    deLaEmpresa('envios_formulario_estado_fk', t.empresaId, t.estadoId, estadosBandeja),
  ],
)

/** Fotos y firmas de las órdenes (reducidas en el celular antes de subir). */
export const archivosServicio = pgTable(
  'archivos_servicio',
  {
    id: id(),
    empresaId: empresaId(),
    /** De una orden o de un formulario suelto (uno de los dos). */
    ordenId: uuid('orden_id'),
    envioId: uuid('envio_id'),
    /** foto | firma */
    clase: text('clase').notNull(),
    tipoMime: text('tipo_mime').notNull(),
    tamano: integer('tamano').notNull(),
    datos: bytea('datos').notNull(),
    usuarioId: uuid('usuario_id'),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.empresaId, t.ordenId),
    check('archivos_servicio_clase', sql`${t.clase} in ('foto', 'firma')`),
    check('archivos_servicio_tipo', sql`${t.tipoMime} in ('image/jpeg', 'image/png', 'image/webp')`),
    check('archivos_servicio_tamano', sql`${t.tamano} between 1 and 3000000`),
    deLaEmpresa('archivos_servicio_orden_fk', t.empresaId, t.ordenId, ordenesServicio),
    deLaEmpresa('archivos_servicio_envio_fk', t.empresaId, t.envioId, enviosFormulario).onDelete('cascade'),
    check('archivos_servicio_de', sql`(${t.ordenId} is null) <> (${t.envioId} is null)`),
  ],
)

/**
 * Configuración del servicio técnico de la empresa (una fila): tiempos de
 * servicio (SLA) por prioridad y qué se le avisa al cliente.
 */
export const configuracionServicio = pgTable(
  'configuracion_servicio',
  {
    id: id(),
    empresaId: empresaId(),
    /** Horas corridas desde que se abre la orden. */
    respuestaNormal: integer('respuesta_normal').notNull().default(24),
    respuestaUrgente: integer('respuesta_urgente').notNull().default(4),
    resolucionNormal: integer('resolucion_normal').notNull().default(72),
    resolucionUrgente: integer('resolucion_urgente').notNull().default(24),
    /** A quién avisar en la oficina cuando un SLA está por vencer o venció. */
    emailCoordinacion: text('email_coordinacion'),
    avisarVisita: boolean('avisar_visita').notNull().default(true),
    avisarCierre: boolean('avisar_cierre').notNull().default(true),
    encuesta: boolean('encuesta').notNull().default(true),
    /** Firma al pie de los correos (nombre, teléfono, horario). */
    firma: text('firma'),
    /** Portal de clientes: activo, y si el cliente ve sus órdenes y carga contadores. */
    portal: boolean('portal').notNull().default(false),
    portalOrdenes: boolean('portal_ordenes').notNull().default(true),
    portalContadores: boolean('portal_contadores').notNull().default(true),
    /** El cliente ve su saldo, sus facturas impagas y sus movimientos. */
    portalCuenta: boolean('portal_cuenta').notNull().default(false),
    /** Color del portal (el de la marca de la empresa). */
    portalColor: text('portal_color').notNull().default('#0f766e'),
    /** Radio (metros) alrededor del cliente para dar por llegado o ido al técnico según el GPS. */
    radioGeocerca: integer('radio_geocerca').notNull().default(150),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId),
    check(
      'configuracion_servicio_horas',
      sql`least(${t.respuestaNormal}, ${t.respuestaUrgente}, ${t.resolucionNormal}, ${t.resolucionUrgente}) > 0`,
    ),
  ],
)

/** Recordatorios por cliente (los "seguimientos" de Persat): visitas, presupuestos, llamados. */
export const recordatorios = pgTable(
  'recordatorios',
  {
    id: id(),
    empresaId: empresaId(),
    terceroId: uuid('tercero_id').notNull(),
    equipoId: uuid('equipo_id'),
    fecha: date('fecha').notNull(),
    hora: text('hora'),
    titulo: text('titulo').notNull(),
    detalle: text('detalle'),
    color: text('color').notNull().default('#2563eb'),
    /** A quién avisar por email y cuántos días antes (0: el mismo día). */
    avisarA: text('avisar_a'),
    diasAntes: integer('dias_antes').notNull().default(1),
    avisado: timestamp('avisado', { withTimezone: true }),
    hecho: timestamp('hecho', { withTimezone: true }),
    usuarioId: uuid('usuario_id'),
    ...marcasDeTiempo(),
  },
  (t) => [
    index().on(t.empresaId, t.fecha),
    index().on(t.empresaId, t.terceroId),
    check('recordatorios_dias_antes', sql`${t.diasAntes} between 0 and 60`),
    deLaEmpresa('recordatorios_tercero_fk', t.empresaId, t.terceroId, terceros),
    deLaEmpresa('recordatorios_equipo_fk', t.empresaId, t.equipoId, equipos),
  ],
)

/**
 * Encuesta de satisfacción de una orden cerrada. El cliente la responde sin
 * usuario, con un enlace que lleva la empresa y un secreto (acá solo se
 * guarda su hash).
 */
export const encuestas = pgTable(
  'encuestas',
  {
    id: id(),
    empresaId: empresaId(),
    ordenId: uuid('orden_id').notNull(),
    secretoHash: text('secreto_hash').notNull(),
    /** 1 a 5 estrellas. */
    puntaje: smallint('puntaje'),
    /** 0 a 10: ¿recomendaría el servicio? */
    nps: smallint('nps'),
    comentario: text('comentario'),
    respondida: timestamp('respondida', { withTimezone: true }),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.ordenId),
    uniqueIndex('encuestas_secreto').on(t.secretoHash),
    check('encuestas_valores', sql`(${t.puntaje} between 1 and 5) and (${t.nps} between 0 and 10)`),
    check('encuestas_respondida', sql`(${t.respondida} is null) = (${t.puntaje} is null)`),
    deLaEmpresa('encuestas_orden_fk', t.empresaId, t.ordenId, ordenesServicio),
  ],
)

/**
 * Usuarios del portal de clientes: gente del cliente (no de la empresa), que
 * entra con su email y ve solo lo de su cliente. Se dan de alta por invitación.
 */
export const usuariosPortal = pgTable(
  'usuarios_portal',
  {
    id: id(),
    empresaId: empresaId(),
    terceroId: uuid('tercero_id').notNull(),
    email: text('email').notNull(),
    nombre: text('nombre'),
    /** scrypt (como los usuarios del ERP). Nulo hasta que acepta la invitación. */
    hashClave: text('hash_clave'),
    /** Hash del token de la invitación (o de recuperar la clave) y su vencimiento. */
    invitacionHash: text('invitacion_hash'),
    invitacionVence: timestamp('invitacion_vence', { withTimezone: true }),
    activo: boolean('activo').notNull().default(true),
    ultimoIngreso: timestamp('ultimo_ingreso', { withTimezone: true }),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.email),
    uniqueIndex('usuarios_portal_invitacion').on(t.invitacionHash),
    unique('usuarios_portal_empresa_id').on(t.empresaId, t.id),
    deLaEmpresa('usuarios_portal_tercero_fk', t.empresaId, t.terceroId, terceros),
  ],
)

export const sesionesPortal = pgTable(
  'sesiones_portal',
  {
    id: id(),
    empresaId: empresaId(),
    usuarioId: uuid('usuario_id').notNull(),
    /** Hash del token de la cookie. */
    tokenHash: text('token_hash').notNull(),
    vence: timestamp('vence', { withTimezone: true }).notNull(),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sesiones_portal_token').on(t.tokenHash),
    deLaEmpresa('sesiones_portal_usuario_fk', t.empresaId, t.usuarioId, usuariosPortal).onDelete('cascade'),
  ],
)

/** Posiciones del técnico (las manda el celular mientras tiene la app abierta, si lo acepta). */
export const posicionesTecnicos = pgTable(
  'posiciones_tecnicos',
  {
    id: id(),
    empresaId: empresaId(),
    tecnicoId: uuid('tecnico_id').notNull(),
    lat: numeric('lat', { precision: 9, scale: 6 }).notNull(),
    lng: numeric('lng', { precision: 9, scale: 6 }).notNull(),
    /** Precisión en metros, según el celular. */
    precision: integer('precision'),
    momento: timestamp('momento', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.empresaId, t.tecnicoId, t.momento),
    deLaEmpresa('posiciones_tecnicos_tecnico_fk', t.empresaId, t.tecnicoId, tecnicos).onDelete('cascade'),
  ],
)

/** Fichada de la jornada del técnico (entrada y salida, con la ubicación del celular). */
export const fichadas = pgTable(
  'fichadas',
  {
    id: id(),
    empresaId: empresaId(),
    tecnicoId: uuid('tecnico_id').notNull(),
    /** entrada | salida */
    tipo: text('tipo').notNull(),
    momento: timestamp('momento', { withTimezone: true }).notNull().defaultNow(),
    lat: numeric('lat', { precision: 9, scale: 6 }),
    lng: numeric('lng', { precision: 9, scale: 6 }),
    precision: integer('precision'),
    usuarioId: uuid('usuario_id'),
  },
  (t) => [
    index().on(t.empresaId, t.tecnicoId, t.momento),
    check('fichadas_tipo', sql`${t.tipo} in ('entrada', 'salida')`),
    deLaEmpresa('fichadas_tecnico_fk', t.empresaId, t.tecnicoId, tecnicos).onDelete('cascade'),
  ],
)

/**
 * Geocercas: el GPS del técnico entró o salió del lugar de una orden del día
 * (como las alertas de Persat). Sirve para comparar con la llegada que
 * marcó y para medir cuánto estuvo.
 */
export const eventosGeocerca = pgTable(
  'eventos_geocerca',
  {
    id: id(),
    empresaId: empresaId(),
    tecnicoId: uuid('tecnico_id').notNull(),
    ordenId: uuid('orden_id').notNull(),
    /** entrada | salida */
    tipo: text('tipo').notNull(),
    momento: timestamp('momento', { withTimezone: true }).notNull(),
    /** En la salida: minutos que estuvo. */
    minutos: integer('minutos'),
  },
  (t) => [
    index().on(t.empresaId, t.ordenId, t.momento),
    index().on(t.empresaId, t.tecnicoId, t.momento),
    check('eventos_geocerca_tipo', sql`${t.tipo} in ('entrada', 'salida')`),
    deLaEmpresa('eventos_geocerca_tecnico_fk', t.empresaId, t.tecnicoId, tecnicos).onDelete('cascade'),
    deLaEmpresa('eventos_geocerca_orden_fk', t.empresaId, t.ordenId, ordenesServicio).onDelete('cascade'),
  ],
)

/**
 * Etiquetas de colores de las órdenes (como las de Persat): "Espera
 * repuesto", "Garantía del fabricante", "Cliente VIP"… Una orden puede tener
 * varias; se filtra por ellas y se ven en el listado y el calendario.
 */
export const etiquetasServicio = pgTable(
  'etiquetas_servicio',
  {
    id: id(),
    empresaId: empresaId(),
    nombre: text('nombre').notNull(),
    color: text('color').notNull(),
    activa: boolean('activa').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('etiquetas_servicio_nombre').on(t.empresaId, t.nombre),
    unique('etiquetas_servicio_empresa_id').on(t.empresaId, t.id),
    check('etiquetas_servicio_color', sql`${t.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
)

export const ordenesServicioEtiquetas = pgTable(
  'ordenes_servicio_etiquetas',
  {
    empresaId: empresaId(),
    ordenId: uuid('orden_id').notNull(),
    etiquetaId: uuid('etiqueta_id').notNull(),
  },
  (t) => [
    uniqueIndex('ordenes_servicio_etiquetas_pk').on(t.empresaId, t.ordenId, t.etiquetaId),
    index().on(t.empresaId, t.etiquetaId),
    deLaEmpresa('ordenes_servicio_etiquetas_orden_fk', t.empresaId, t.ordenId, ordenesServicio).onDelete('cascade'),
    deLaEmpresa('ordenes_servicio_etiquetas_etiqueta_fk', t.empresaId, t.etiquetaId, etiquetasServicio).onDelete('cascade'),
  ],
)

/**
 * Acompañantes de una orden: técnicos que van con el responsable
 * (`ordenes_servicio.tecnico_id`). La ven en su agenda y les ocupa el
 * horario; el informe lo carga el responsable.
 */
export const ordenesServicioTecnicos = pgTable(
  'ordenes_servicio_tecnicos',
  {
    empresaId: empresaId(),
    ordenId: uuid('orden_id').notNull(),
    tecnicoId: uuid('tecnico_id').notNull(),
  },
  (t) => [
    uniqueIndex('ordenes_servicio_tecnicos_pk').on(t.empresaId, t.ordenId, t.tecnicoId),
    index().on(t.empresaId, t.tecnicoId),
    deLaEmpresa('ordenes_servicio_tecnicos_orden_fk', t.empresaId, t.ordenId, ordenesServicio).onDelete('cascade'),
    deLaEmpresa('ordenes_servicio_tecnicos_tecnico_fk', t.empresaId, t.tecnicoId, tecnicos).onDelete('cascade'),
  ],
)

/**
 * Excepciones a la jornada semanal (como el horario por día de Persat):
 * licencias, vacaciones, feriados (sin técnico: valen para todos) y días con
 * horario especial. Las usan el asistente de huecos y el calendario.
 */
export const excepcionesJornada = pgTable(
  'excepciones_jornada',
  {
    id: id(),
    empresaId: empresaId(),
    /** Sin técnico: para todos (un feriado). */
    tecnicoId: uuid('tecnico_id'),
    desde: date('desde').notNull(),
    hasta: date('hasta').notNull(),
    /** ausencia (no trabaja) | horario (trabaja en otro horario) */
    tipo: text('tipo').notNull().default('ausencia'),
    jornadaDesde: text('jornada_desde'),
    jornadaHasta: text('jornada_hasta'),
    motivo: text('motivo').notNull(),
    ...marcasDeTiempo(),
  },
  (t) => [
    index().on(t.empresaId, t.desde, t.hasta),
    check('excepciones_jornada_tipo', sql`${t.tipo} in ('ausencia', 'horario')`),
    check('excepciones_jornada_fechas', sql`${t.hasta} >= ${t.desde}`),
    check(
      'excepciones_jornada_horario',
      sql`${t.tipo} = 'ausencia' or (${t.jornadaDesde} ~ '^[0-2][0-9]:[0-5][0-9]$' and ${t.jornadaHasta} ~ '^[0-2][0-9]:[0-5][0-9]$' and ${t.jornadaHasta} > ${t.jornadaDesde})`,
    ),
    deLaEmpresa('excepciones_jornada_tecnico_fk', t.empresaId, t.tecnicoId, tecnicos).onDelete('cascade'),
  ],
)

/**
 * Historial de estados de un formulario de la bandeja: quién lo pasó a qué
 * estado y cuándo (como en Persat). Guarda el nombre y el color del estado
 * de ese momento, así sigue legible aunque el estado cambie o se borre.
 */
export const historialEnvios = pgTable(
  'historial_envios',
  {
    id: id(),
    empresaId: empresaId(),
    envioId: uuid('envio_id').notNull(),
    estado: text('estado').notNull(),
    color: text('color').notNull(),
    nota: text('nota'),
    /** Nombre de quien lo cambió (o de dónde vino, al recibirlo). */
    autor: text('autor').notNull(),
    usuarioId: uuid('usuario_id'),
    momento: timestamp('momento', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.empresaId, t.envioId, t.momento),
    deLaEmpresa('historial_envios_envio_fk', t.empresaId, t.envioId, enviosFormulario).onDelete('cascade'),
  ],
)

/**
 * Zonas de trabajo (como las de Persat): un centro y un radio. Se asignan a
 * los técnicos; si durante la jornada uno sale de todas sus zonas, queda una
 * alerta y se avisa a coordinación.
 */
export const zonasTrabajo = pgTable(
  'zonas_trabajo',
  {
    id: id(),
    empresaId: empresaId(),
    nombre: text('nombre').notNull(),
    lat: numeric('lat', { precision: 9, scale: 6 }).notNull(),
    lng: numeric('lng', { precision: 9, scale: 6 }).notNull(),
    radioKm: numeric('radio_km', { precision: 6, scale: 2 }).notNull(),
    activa: boolean('activa').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('zonas_trabajo_nombre').on(t.empresaId, t.nombre),
    unique('zonas_trabajo_empresa_id').on(t.empresaId, t.id),
    check('zonas_trabajo_radio', sql`${t.radioKm} > 0 and ${t.radioKm} <= 500`),
  ],
)

export const tecnicosZonas = pgTable(
  'tecnicos_zonas',
  {
    empresaId: empresaId(),
    tecnicoId: uuid('tecnico_id').notNull(),
    zonaId: uuid('zona_id').notNull(),
  },
  (t) => [
    uniqueIndex('tecnicos_zonas_pk').on(t.empresaId, t.tecnicoId, t.zonaId),
    deLaEmpresa('tecnicos_zonas_tecnico_fk', t.empresaId, t.tecnicoId, tecnicos).onDelete('cascade'),
    deLaEmpresa('tecnicos_zonas_zona_fk', t.empresaId, t.zonaId, zonasTrabajo).onDelete('cascade'),
  ],
)

/** El técnico salió de sus zonas (o volvió) durante la jornada. */
export const alertasZona = pgTable(
  'alertas_zona',
  {
    id: id(),
    empresaId: empresaId(),
    tecnicoId: uuid('tecnico_id').notNull(),
    /** salida | entrada */
    tipo: text('tipo').notNull(),
    momento: timestamp('momento', { withTimezone: true }).notNull(),
    lat: numeric('lat', { precision: 9, scale: 6 }).notNull(),
    lng: numeric('lng', { precision: 9, scale: 6 }).notNull(),
  },
  (t) => [
    index().on(t.empresaId, t.tecnicoId, t.momento),
    check('alertas_zona_tipo', sql`${t.tipo} in ('salida', 'entrada')`),
    deLaEmpresa('alertas_zona_tecnico_fk', t.empresaId, t.tecnicoId, tecnicos).onDelete('cascade'),
  ],
)
