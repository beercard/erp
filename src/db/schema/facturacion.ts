import { sql } from 'drizzle-orm'
import {
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

import { alicuotasIva, condicionesIva, monedas, provincias, tiposDocumento } from './catalogos'
import { cantidad, cotizacion, empresaId, id, importe, marcasDeTiempo, precio } from './comunes'
import { pedidos } from './comercial'
import { articulos, condicionesPago, listasPrecios, terceros, vendedores } from './maestros'

/**
 * Etapa 2: comprobantes fiscales (factura electrónica de ARCA), cuentas
 * corrientes y cobranzas.
 *
 * Reglas de diseño:
 * - Un comprobante autorizado no se modifica ni se borra: se corrige con una
 *   nota de crédito. Mientras es borrador se edita libremente.
 * - Los datos del receptor se copian al comprobante al emitirlo: si después
 *   cambia la ficha del cliente, la factura sigue diciendo lo que se informó.
 * - El IVA y los tributos son renglones (comprobantes_iva y
 *   comprobantes_tributos), no columnas fijas.
 * - La cuenta corriente no guarda saldos: sale de los comprobantes, los
 *   recibos y las imputaciones.
 */

const deLaEmpresa = (
  nombre: string,
  empresa: Parameters<typeof foreignKey>[0]['columns'][0],
  columna: Parameters<typeof foreignKey>[0]['columns'][0],
  destino: { empresaId: Parameters<typeof foreignKey>[0]['columns'][0]; id: Parameters<typeof foreignKey>[0]['columns'][0] },
) => foreignKey({ name: nombre, columns: [empresa, columna], foreignColumns: [destino.empresaId, destino.id] })

/**
 * Conexión de la empresa con ARCA. El certificado es público; la clave
 * privada se guarda cifrada con la clave maestra del servidor
 * (ERP_CLAVE_MAESTRA), que nunca está en la base.
 */
export const arcaConfiguracion = pgTable(
  'arca_configuracion',
  {
    id: id(),
    empresaId: empresaId(),
    /** homologacion | produccion */
    ambiente: text('ambiente').notNull().default('homologacion'),
    certificado: text('certificado'),
    claveCifrada: text('clave_cifrada'),
    certificadoVence: timestamp('certificado_vence', { withTimezone: true }),
    /** Consumidor final: desde este total hay que identificar al comprador. */
    umbralConsumidorFinal: importe('umbral_consumidor_final').notNull().default('10000000'),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.empresaId), check('arca_ambiente', sql`${t.ambiente} in ('homologacion', 'produccion')`)],
)

/**
 * Ticket de acceso de ARCA (WSAA). Dura 12 horas y ARCA rechaza pedir otro
 * mientras el anterior sigue vigente, así que se guarda y se reutiliza.
 */
export const arcaTickets = pgTable(
  'arca_tickets',
  {
    id: id(),
    empresaId: empresaId(),
    ambiente: text('ambiente').notNull(),
    servicio: text('servicio').notNull(),
    token: text('token').notNull(),
    firma: text('firma').notNull(),
    vence: timestamp('vence', { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.ambiente, t.servicio)],
)

/**
 * Percepción de Ingresos Brutos que practica la empresa. La alícuota de cada
 * cliente puede venir del padrón (terceros.percepcion_iibb); si no, se usa la
 * general de acá. Las reglas las define el contador.
 */
export const percepcionesIibb = pgTable(
  'percepciones_iibb',
  {
    id: id(),
    empresaId: empresaId(),
    nombre: text('nombre').notNull(),
    provincia: text('provincia').references(() => provincias.codigo),
    /** Porcentaje general (3 = 3 %). */
    alicuota: precio('alicuota').notNull(),
    /** No se percibe si el neto gravado es menor. */
    minimoBase: importe('minimo_base').notNull().default('0'),
    /** Solo en comprobantes A (a inscriptos). */
    soloLetraA: boolean('solo_letra_a').notNull().default(true),
    /** Código de tributo de ARCA (7 = percepción de IIBB). */
    tributoArca: smallint('tributo_arca').notNull().default(7),
    activa: boolean('activa').notNull().default(false),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.nombre)],
)

/** Comprobantes de venta: facturas, notas de débito y notas de crédito. */
export const comprobantes = pgTable(
  'comprobantes',
  {
    id: id(),
    empresaId: empresaId(),
    /** factura | nota_debito | nota_credito */
    clase: text('clase').notNull(),
    letra: text('letra').notNull(),
    /** Código de ARCA (1 = factura A, 6 = factura B, 3 = nota de crédito A, …). */
    tipo: smallint('tipo').notNull(),
    puntoVenta: integer('punto_venta').notNull(),
    /** Nulo mientras es borrador: lo asigna ARCA al autorizar. */
    numero: integer('numero'),
    fecha: date('fecha').notNull(),
    /** borrador | autorizado | pendiente_verificacion */
    estado: text('estado').notNull().default('borrador'),
    /** erp | pymexis (saldos iniciales e historial migrado) */
    origen: text('origen').notNull().default('erp'),

    terceroId: uuid('tercero_id').notNull(),
    // Receptor tal como se informó a ARCA.
    receptorNombre: text('receptor_nombre'),
    receptorDocTipo: smallint('receptor_doc_tipo').references(() => tiposDocumento.codigo),
    receptorDocNumero: text('receptor_doc_numero'),
    receptorCondicionIva: smallint('receptor_condicion_iva').references(() => condicionesIva.codigo),
    receptorDomicilio: text('receptor_domicilio'),

    /** 1 productos, 2 servicios, 3 productos y servicios. */
    concepto: smallint('concepto').notNull().default(1),
    servicioDesde: date('servicio_desde'),
    servicioHasta: date('servicio_hasta'),
    vencimiento: date('vencimiento'),

    moneda: text('moneda')
      .notNull()
      .default('PES')
      .references(() => monedas.codigo),
    cotizacion: cotizacion('cotizacion').notNull().default('1'),
    listaPreciosId: uuid('lista_precios_id'),
    vendedorId: uuid('vendedor_id'),
    condicionPagoId: uuid('condicion_pago_id'),
    pedidoId: uuid('pedido_id'),

    /** Neto gravado. */
    neto: importe('neto').notNull().default('0'),
    noGravado: importe('no_gravado').notNull().default('0'),
    exento: importe('exento').notNull().default('0'),
    iva: importe('iva').notNull().default('0'),
    tributos: importe('tributos').notNull().default('0'),
    total: importe('total').notNull().default('0'),

    cae: text('cae'),
    caeVence: date('cae_vence'),
    /** Observaciones y errores devueltos por ARCA, tal cual. */
    respuestaArca: jsonb('respuesta_arca'),
    /** Datos opcionales de ARCA (CBU y modalidad de la FCE, anulación). */
    opcionales: jsonb('opcionales'),
    observaciones: text('observaciones'),
    usuarioId: uuid('usuario_id'),
    autorizado: timestamp('autorizado', { withTimezone: true }),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex('comprobantes_numero').on(t.empresaId, t.tipo, t.puntoVenta, t.numero),
    index().on(t.empresaId, t.terceroId),
    index().on(t.empresaId, t.fecha),
    unique('comprobantes_empresa_id').on(t.empresaId, t.id),
    check('comprobantes_clase', sql`${t.clase} in ('factura', 'nota_debito', 'nota_credito')`),
    check('comprobantes_estado', sql`${t.estado} in ('borrador', 'autorizado', 'pendiente_verificacion')`),
    // Un comprobante autorizado siempre tiene número y CAE (o vino migrado).
    check(
      'comprobantes_autorizado_completo',
      sql`${t.estado} <> 'autorizado' or (${t.numero} is not null and (${t.cae} is not null or ${t.origen} <> 'erp'))`,
    ),
    deLaEmpresa('comprobantes_tercero_fk', t.empresaId, t.terceroId, terceros),
    deLaEmpresa('comprobantes_lista_fk', t.empresaId, t.listaPreciosId, listasPrecios),
    deLaEmpresa('comprobantes_vendedor_fk', t.empresaId, t.vendedorId, vendedores),
    deLaEmpresa('comprobantes_condicion_fk', t.empresaId, t.condicionPagoId, condicionesPago),
    deLaEmpresa('comprobantes_pedido_fk', t.empresaId, t.pedidoId, pedidos),
  ],
)

export const comprobantesItems = pgTable(
  'comprobantes_items',
  {
    id: id(),
    empresaId: empresaId(),
    comprobanteId: uuid('comprobante_id').notNull(),
    orden: smallint('orden').notNull(),
    articuloId: uuid('articulo_id'),
    descripcion: text('descripcion').notNull(),
    cantidad: cantidad('cantidad').notNull(),
    /** Neto, en la moneda del comprobante. */
    precioUnitario: precio('precio_unitario').notNull(),
    descuento: precio('descuento').notNull().default('0'),
    alicuotaIva: smallint('alicuota_iva')
      .notNull()
      .references(() => alicuotasIva.codigo),
    neto: importe('neto').notNull(),
    iva: importe('iva').notNull(),
  },
  (t) => [
    index().on(t.empresaId, t.comprobanteId),
    deLaEmpresa('comprobantes_items_comprobante_fk', t.empresaId, t.comprobanteId, comprobantes).onDelete('cascade'),
    deLaEmpresa('comprobantes_items_articulo_fk', t.empresaId, t.articuloId, articulos),
  ],
)

/** Base e IVA por alícuota, como se informan a ARCA. */
export const comprobantesIva = pgTable(
  'comprobantes_iva',
  {
    id: id(),
    empresaId: empresaId(),
    comprobanteId: uuid('comprobante_id').notNull(),
    alicuotaIva: smallint('alicuota_iva')
      .notNull()
      .references(() => alicuotasIva.codigo),
    base: importe('base').notNull(),
    importe: importe('importe').notNull(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.comprobanteId, t.alicuotaIva),
    deLaEmpresa('comprobantes_iva_comprobante_fk', t.empresaId, t.comprobanteId, comprobantes).onDelete('cascade'),
  ],
)

/** Percepciones y otros tributos del comprobante. */
export const comprobantesTributos = pgTable(
  'comprobantes_tributos',
  {
    id: id(),
    empresaId: empresaId(),
    comprobanteId: uuid('comprobante_id').notNull(),
    /** Código de tributo de ARCA. */
    tributo: smallint('tributo').notNull(),
    descripcion: text('descripcion').notNull(),
    base: importe('base').notNull(),
    alicuota: numeric('alicuota', { precision: 7, scale: 4 }).notNull(),
    importe: importe('importe').notNull(),
    percepcionId: uuid('percepcion_id'),
  },
  (t) => [
    index().on(t.empresaId, t.comprobanteId),
    deLaEmpresa('comprobantes_tributos_comprobante_fk', t.empresaId, t.comprobanteId, comprobantes).onDelete('cascade'),
  ],
)

/** Comprobante que corrige una nota de crédito o débito (CbtesAsoc de ARCA). */
export const comprobantesAsociados = pgTable(
  'comprobantes_asociados',
  {
    id: id(),
    empresaId: empresaId(),
    comprobanteId: uuid('comprobante_id').notNull(),
    asociadoId: uuid('asociado_id').notNull(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.comprobanteId, t.asociadoId),
    deLaEmpresa('comprobantes_asociados_comprobante_fk', t.empresaId, t.comprobanteId, comprobantes).onDelete('cascade'),
    deLaEmpresa('comprobantes_asociados_asociado_fk', t.empresaId, t.asociadoId, comprobantes),
  ],
)

/** Recibos de cobranza. */
export const recibos = pgTable(
  'recibos',
  {
    id: id(),
    empresaId: empresaId(),
    puntoVenta: integer('punto_venta').notNull(),
    numero: integer('numero').notNull(),
    fecha: date('fecha').notNull(),
    terceroId: uuid('tercero_id').notNull(),
    /** Total cobrado, en pesos. */
    total: importe('total').notNull(),
    /** emitido | anulado */
    estado: text('estado').notNull().default('emitido'),
    observaciones: text('observaciones'),
    usuarioId: uuid('usuario_id'),
    anulado: timestamp('anulado', { withTimezone: true }),
    anuladoPor: uuid('anulado_por'),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.puntoVenta, t.numero),
    index().on(t.empresaId, t.terceroId),
    unique('recibos_empresa_id').on(t.empresaId, t.id),
    check('recibos_estado', sql`${t.estado} in ('emitido', 'anulado')`),
    deLaEmpresa('recibos_tercero_fk', t.empresaId, t.terceroId, terceros),
  ],
)

/**
 * Valores recibidos: efectivo, transferencia, cheques, tarjetas, Mercado
 * Pago y las retenciones que practicó el cliente (que también cancelan
 * deuda). Los cheques pasan a la cartera de tesorería en la etapa 4.
 */
export const recibosValores = pgTable(
  'recibos_valores',
  {
    id: id(),
    empresaId: empresaId(),
    reciboId: uuid('recibo_id').notNull(),
    medio: text('medio').notNull(),
    importe: importe('importe').notNull(),
    detalle: text('detalle'),
    // Cheques y ECHEQ
    banco: text('banco'),
    numeroValor: text('numero_valor'),
    fechaPago: date('fecha_pago'),
    cuitLibrador: text('cuit_librador'),
  },
  (t) => [
    index().on(t.empresaId, t.reciboId),
    check(
      'recibos_valores_medio',
      sql`${t.medio} in ('efectivo', 'transferencia', 'cheque', 'echeq', 'tarjeta_credito', 'tarjeta_debito', 'mercado_pago', 'retencion_iibb', 'retencion_ganancias', 'retencion_iva', 'retencion_suss', 'otro')`,
    ),
    deLaEmpresa('recibos_valores_recibo_fk', t.empresaId, t.reciboId, recibos).onDelete('cascade'),
  ],
)

/**
 * Qué cancela qué: un recibo o una nota de crédito aplicados a una factura
 * o nota de débito. Lo que un recibo no imputa queda a cuenta.
 */
export const imputaciones = pgTable(
  'imputaciones',
  {
    id: id(),
    empresaId: empresaId(),
    reciboId: uuid('recibo_id'),
    notaCreditoId: uuid('nota_credito_id'),
    comprobanteId: uuid('comprobante_id').notNull(),
    /** En pesos. */
    importe: importe('importe').notNull(),
    fecha: date('fecha').notNull(),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.empresaId, t.comprobanteId),
    check('imputaciones_un_origen', sql`(${t.reciboId} is null) <> (${t.notaCreditoId} is null)`),
    check('imputaciones_positiva', sql`${t.importe} > 0`),
    deLaEmpresa('imputaciones_recibo_fk', t.empresaId, t.reciboId, recibos).onDelete('cascade'),
    deLaEmpresa('imputaciones_nota_credito_fk', t.empresaId, t.notaCreditoId, comprobantes),
    deLaEmpresa('imputaciones_comprobante_fk', t.empresaId, t.comprobanteId, comprobantes),
  ],
)
