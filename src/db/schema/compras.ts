import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { alicuotasIva, monedas, provincias } from './catalogos'
import { cantidad, cotizacion, empresaId, id, importe, marcasDeTiempo, precio } from './comunes'
import { recibosValores } from './facturacion'
import { articulos, depositos, terceros } from './maestros'

/**
 * Etapa 3: compras, cuentas de proveedores y pagos.
 *
 * Reglas de diseño:
 * - Un comprobante de compra se registra tal como lo emitió el proveedor; no
 *   se edita: si está mal se anula y se carga de nuevo. Anularlo devuelve el
 *   stock que había entrado.
 * - El período del libro de IVA (periodo_iva) es independiente de la fecha.
 * - Como en ventas, nada guarda un saldo: la deuda con el proveedor sale de
 *   los comprobantes, los pagos y las imputaciones.
 * - Un pago cancela deuda con valores (efectivo, transferencia, cheques) y
 *   con las retenciones que se le practican al proveedor.
 * - La deuda de cada comprobante se lleva en su moneda: una factura en
 *   dólares se cancela en dólares aunque se pague en pesos (al dólar del día
 *   del pago), como en PYMEXIS.
 * - Un cheque de terceros está en cartera mientras no se usó en un pago
 *   emitido: no hay un estado guardado que se desfase.
 */

const deLaEmpresa = (
  nombre: string,
  empresa: Parameters<typeof foreignKey>[0]['columns'][0],
  columna: Parameters<typeof foreignKey>[0]['columns'][0],
  destino: { empresaId: Parameters<typeof foreignKey>[0]['columns'][0]; id: Parameters<typeof foreignKey>[0]['columns'][0] },
) => foreignKey({ name: nombre, columns: [empresa, columna], foreignColumns: [destino.empresaId, destino.id] })

// ------------------------------------------------------- Órdenes de compra

/** Pedido a un proveedor. Se cumple con los comprobantes de compra que lo reciben. */
export const ordenesCompra = pgTable(
  'ordenes_compra',
  {
    id: id(),
    empresaId: empresaId(),
    numero: integer('numero').notNull(),
    fecha: date('fecha').notNull(),
    terceroId: uuid('tercero_id').notNull(),
    depositoId: uuid('deposito_id'),
    fechaEntrega: date('fecha_entrega'),
    moneda: text('moneda')
      .notNull()
      .default('PES')
      .references(() => monedas.codigo),
    cotizacion: cotizacion('cotizacion').notNull().default('1'),
    /** pendiente | parcial | recibida | cancelada */
    estado: text('estado').notNull().default('pendiente'),
    neto: importe('neto').notNull().default('0'),
    iva: importe('iva').notNull().default('0'),
    total: importe('total').notNull().default('0'),
    observaciones: text('observaciones'),
    usuarioId: uuid('usuario_id'),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.numero),
    index().on(t.empresaId, t.terceroId),
    unique('ordenes_compra_empresa_id').on(t.empresaId, t.id),
    check('ordenes_compra_estado', sql`${t.estado} in ('pendiente', 'parcial', 'recibida', 'cancelada')`),
    deLaEmpresa('ordenes_compra_tercero_fk', t.empresaId, t.terceroId, terceros),
    deLaEmpresa('ordenes_compra_deposito_fk', t.empresaId, t.depositoId, depositos),
  ],
)

export const ordenesCompraItems = pgTable(
  'ordenes_compra_items',
  {
    id: id(),
    empresaId: empresaId(),
    ordenId: uuid('orden_id').notNull(),
    orden: smallint('orden').notNull(),
    articuloId: uuid('articulo_id'),
    descripcion: text('descripcion').notNull(),
    cantidad: cantidad('cantidad').notNull(),
    /** Precio neto pactado, en la moneda de la orden. */
    precioUnitario: precio('precio_unitario').notNull(),
    descuento: precio('descuento').notNull().default('0'),
    alicuotaIva: smallint('alicuota_iva')
      .notNull()
      .references(() => alicuotasIva.codigo),
    neto: importe('neto').notNull(),
    iva: importe('iva').notNull(),
  },
  (t) => [
    index().on(t.empresaId, t.ordenId),
    unique('ordenes_compra_items_empresa_id').on(t.empresaId, t.id),
    deLaEmpresa('ordenes_compra_items_orden_fk', t.empresaId, t.ordenId, ordenesCompra).onDelete('cascade'),
    deLaEmpresa('ordenes_compra_items_articulo_fk', t.empresaId, t.articuloId, articulos),
  ],
)

// ------------------------------------------------- Comprobantes de compra

/** Facturas, notas de débito y notas de crédito de proveedores. */
export const compras = pgTable(
  'compras',
  {
    id: id(),
    empresaId: empresaId(),
    /** factura | nota_debito | nota_credito */
    clase: text('clase').notNull(),
    /** A, B, C, M o E (importación). */
    letra: text('letra').notNull(),
    /** Código de ARCA del comprobante (1 = factura A, 3 = nota de crédito A, …). */
    tipo: smallint('tipo').notNull(),
    puntoVenta: integer('punto_venta').notNull(),
    numero: integer('numero').notNull(),
    fecha: date('fecha').notNull(),
    /** Mes del libro de IVA compras, "AAAA-MM". Puede no ser el de la fecha. */
    periodoIva: text('periodo_iva').notNull(),
    terceroId: uuid('tercero_id').notNull(),
    /** CAE o CAI del comprobante del proveedor. */
    cae: text('cae'),
    vencimiento: date('vencimiento'),
    moneda: text('moneda')
      .notNull()
      .default('PES')
      .references(() => monedas.codigo),
    cotizacion: cotizacion('cotizacion').notNull().default('1'),
    /** Depósito donde entra la mercadería (si tiene artículos con stock). */
    depositoId: uuid('deposito_id'),
    ordenCompraId: uuid('orden_compra_id'),

    /** Neto gravado. */
    neto: importe('neto').notNull().default('0'),
    noGravado: importe('no_gravado').notNull().default('0'),
    exento: importe('exento').notNull().default('0'),
    iva: importe('iva').notNull().default('0'),
    /** Percepciones, impuestos internos y otros tributos. */
    tributos: importe('tributos').notNull().default('0'),
    total: importe('total').notNull().default('0'),

    /** registrado | anulado */
    estado: text('estado').notNull().default('registrado'),
    /** erp | mis_comprobantes | pymexis */
    origen: text('origen').notNull().default('erp'),
    observaciones: text('observaciones'),
    usuarioId: uuid('usuario_id'),
    anulado: timestamp('anulado', { withTimezone: true }),
    anuladoPor: uuid('anulado_por'),
    ...marcasDeTiempo(),
  },
  (t) => [
    // Un mismo comprobante del proveedor no se registra dos veces.
    uniqueIndex('compras_numero')
      .on(t.empresaId, t.terceroId, t.tipo, t.puntoVenta, t.numero)
      .where(sql`${t.estado} = 'registrado'`),
    index().on(t.empresaId, t.terceroId),
    index().on(t.empresaId, t.periodoIva),
    unique('compras_empresa_id').on(t.empresaId, t.id),
    check('compras_clase', sql`${t.clase} in ('factura', 'nota_debito', 'nota_credito')`),
    check('compras_estado', sql`${t.estado} in ('registrado', 'anulado')`),
    check('compras_origen', sql`${t.origen} in ('erp', 'mis_comprobantes', 'pymexis', 'planilla')`),
    check('compras_periodo', sql`${t.periodoIva} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    deLaEmpresa('compras_tercero_fk', t.empresaId, t.terceroId, terceros),
    deLaEmpresa('compras_deposito_fk', t.empresaId, t.depositoId, depositos),
    deLaEmpresa('compras_orden_fk', t.empresaId, t.ordenCompraId, ordenesCompra),
  ],
)

export const comprasItems = pgTable(
  'compras_items',
  {
    id: id(),
    empresaId: empresaId(),
    compraId: uuid('compra_id').notNull(),
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
    /** Renglón de la orden de compra que recibe. */
    ordenItemId: uuid('orden_item_id'),
  },
  (t) => [
    index().on(t.empresaId, t.compraId),
    index().on(t.empresaId, t.ordenItemId),
    deLaEmpresa('compras_items_compra_fk', t.empresaId, t.compraId, compras).onDelete('cascade'),
    deLaEmpresa('compras_items_articulo_fk', t.empresaId, t.articuloId, articulos),
    deLaEmpresa('compras_items_orden_item_fk', t.empresaId, t.ordenItemId, ordenesCompraItems),
  ],
)

/** Base e IVA por alícuota (lo que va al libro de IVA compras). */
export const comprasIva = pgTable(
  'compras_iva',
  {
    id: id(),
    empresaId: empresaId(),
    compraId: uuid('compra_id').notNull(),
    alicuotaIva: smallint('alicuota_iva')
      .notNull()
      .references(() => alicuotasIva.codigo),
    base: importe('base').notNull(),
    importe: importe('importe').notNull(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.compraId, t.alicuotaIva),
    deLaEmpresa('compras_iva_compra_fk', t.empresaId, t.compraId, compras).onDelete('cascade'),
  ],
)

/** Percepciones sufridas, impuestos internos y otros tributos del comprobante. */
export const comprasTributos = pgTable(
  'compras_tributos',
  {
    id: id(),
    empresaId: empresaId(),
    compraId: uuid('compra_id').notNull(),
    /** percepcion_iva | percepcion_iibb | percepcion_ganancias | impuestos_internos | impuesto_municipal | otro */
    tipo: text('tipo').notNull(),
    /** Jurisdicción de la percepción de IIBB. */
    provincia: text('provincia').references(() => provincias.codigo),
    base: importe('base'),
    alicuota: numeric('alicuota', { precision: 7, scale: 4 }),
    importe: importe('importe').notNull(),
  },
  (t) => [
    index().on(t.empresaId, t.compraId),
    check(
      'compras_tributos_tipo',
      sql`${t.tipo} in ('percepcion_iva', 'percepcion_iibb', 'percepcion_ganancias', 'impuestos_internos', 'impuesto_municipal', 'otro')`,
    ),
    deLaEmpresa('compras_tributos_compra_fk', t.empresaId, t.compraId, compras).onDelete('cascade'),
  ],
)

// --------------------------------------------- Retención de Ganancias

/**
 * Regímenes de retención de Ganancias (RG 830) que usa la empresa. El código
 * es el de SICORE (78 = enajenación de bienes muebles, 94 = locaciones de
 * obra y servicios, …). Los importes los actualiza ARCA: se cargan acá.
 */
export const regimenesGanancias = pgTable(
  'regimenes_ganancias',
  {
    id: id(),
    empresaId: empresaId(),
    codigo: text('codigo').notNull(),
    concepto: text('concepto').notNull(),
    /** Porcentaje para inscriptos (2 = 2 %). Si usa escala, se ignora. */
    alicuotaInscripto: precio('alicuota_inscripto').notNull(),
    alicuotaNoInscripto: precio('alicuota_no_inscripto').notNull(),
    /** Mínimo no sujeto a retención, por mes y por proveedor. */
    minimoNoSujeto: importe('minimo_no_sujeto').notNull().default('0'),
    /** Si la retención del pago da menos, no se retiene. */
    minimoRetencion: importe('minimo_retencion').notNull().default('0'),
    /** A inscriptos se les aplica la escala (honorarios, locaciones). */
    usaEscala: boolean('usa_escala').notNull().default(false),
    activo: boolean('activo').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.codigo)],
)

/** Escala del Anexo VIII de la RG 830: sobre lo que excede "desde", fijo + porcentaje. */
export const escalaGanancias = pgTable(
  'escala_ganancias',
  {
    id: id(),
    empresaId: empresaId(),
    desde: importe('desde').notNull(),
    /** Nulo en el último tramo. */
    hasta: importe('hasta'),
    fijo: importe('fijo').notNull(),
    porcentaje: precio('porcentaje').notNull(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.desde)],
)

/** Parámetros de retenciones de la empresa. */
export const retencionesConfiguracion = pgTable(
  'retenciones_configuracion',
  {
    id: id(),
    empresaId: empresaId(),
    /** Retiene Ganancias al pagar (agente de retención). */
    gananciasActiva: boolean('ganancias_activa').notNull().default(false),
    /** Retiene Ingresos Brutos al pagar, como agente de la provincia indicada. */
    iibbActiva: boolean('iibb_activa').notNull().default(false),
    iibbProvincia: text('iibb_provincia').references(() => provincias.codigo),
    /** No se retiene si la base del pago es menor. */
    iibbMinimo: importe('iibb_minimo').notNull().default('0'),
    /** Alícuota para los que no están en el padrón (vacío: no se les retiene). */
    iibbAlicuotaGeneral: precio('iibb_alicuota_general'),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.empresaId)],
)

// ----------------------------------------------------------------- Pagos

/** Órdenes de pago a proveedores. */
export const pagos = pgTable(
  'pagos',
  {
    id: id(),
    empresaId: empresaId(),
    numero: integer('numero').notNull(),
    fecha: date('fecha').notNull(),
    terceroId: uuid('tercero_id').notNull(),
    /** Moneda de los valores entregados. */
    moneda: text('moneda')
      .notNull()
      .default('PES')
      .references(() => monedas.codigo),
    /** Dólar del día del pago: convierte lo que se cancela de comprobantes en otra moneda. */
    cotizacion: cotizacion('cotizacion').notNull().default('1'),
    /** Lo que cancela, en la moneda del pago: valores entregados + retenciones. */
    total: importe('total').notNull(),
    /** Base de la retención de Ganancias de este pago (neto de IVA), en pesos. */
    baseGanancias: importe('base_ganancias').notNull().default('0'),
    regimenGanancias: text('regimen_ganancias'),
    /** emitido | anulado */
    estado: text('estado').notNull().default('emitido'),
    observaciones: text('observaciones'),
    usuarioId: uuid('usuario_id'),
    anulado: timestamp('anulado', { withTimezone: true }),
    anuladoPor: uuid('anulado_por'),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.numero),
    index().on(t.empresaId, t.terceroId, t.fecha),
    unique('pagos_empresa_id').on(t.empresaId, t.id),
    check('pagos_estado', sql`${t.estado} in ('emitido', 'anulado')`),
    deLaEmpresa('pagos_tercero_fk', t.empresaId, t.terceroId, terceros),
  ],
)

/** Con qué se pagó. Un cheque de terceros sale de la cartera (recibos_valores). */
export const pagosValores = pgTable(
  'pagos_valores',
  {
    id: id(),
    empresaId: empresaId(),
    pagoId: uuid('pago_id').notNull(),
    /** efectivo | transferencia | cheque_propio | echeq_propio | cheque_tercero | tarjeta | otro */
    medio: text('medio').notNull(),
    importe: importe('importe').notNull(),
    detalle: text('detalle'),
    banco: text('banco'),
    numeroValor: text('numero_valor'),
    fechaPago: date('fecha_pago'),
    /** El cheque de terceros que se entrega. */
    reciboValorId: uuid('recibo_valor_id'),
    /** Caja, banco o tarjeta de donde sale (tesorería). */
    cuentaId: uuid('cuenta_id'),
  },
  (t) => [
    index().on(t.empresaId, t.pagoId),
    index().on(t.empresaId, t.reciboValorId),
    check(
      'pagos_valores_medio',
      sql`${t.medio} in ('efectivo', 'transferencia', 'cheque_propio', 'echeq_propio', 'cheque_tercero', 'tarjeta', 'otro')`,
    ),
    check('pagos_valores_positivo', sql`${t.importe} > 0`),
    check('pagos_valores_cheque_tercero', sql`(${t.medio} = 'cheque_tercero') = (${t.reciboValorId} is not null)`),
    deLaEmpresa('pagos_valores_pago_fk', t.empresaId, t.pagoId, pagos).onDelete('cascade'),
    deLaEmpresa('pagos_valores_recibo_valor_fk', t.empresaId, t.reciboValorId, recibosValores),
  ],
)

/** Retenciones practicadas al proveedor en un pago, con su certificado. */
export const retenciones = pgTable(
  'retenciones',
  {
    id: id(),
    empresaId: empresaId(),
    pagoId: uuid('pago_id').notNull(),
    /** ganancias | iibb | iva | suss */
    impuesto: text('impuesto').notNull(),
    /** Régimen (código de SICORE en Ganancias). */
    regimen: text('regimen'),
    /** Número de certificado, correlativo por impuesto. */
    numero: integer('numero').notNull(),
    /** Base sujeta a retención (acumulada del mes, menos el mínimo). */
    base: importe('base').notNull(),
    alicuota: precio('alicuota'),
    importe: importe('importe').notNull(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.impuesto, t.numero),
    index().on(t.empresaId, t.pagoId),
    check('retenciones_impuesto', sql`${t.impuesto} in ('ganancias', 'iibb', 'iva', 'suss')`),
    check('retenciones_positiva', sql`${t.importe} > 0`),
    deLaEmpresa('retenciones_pago_fk', t.empresaId, t.pagoId, pagos).onDelete('cascade'),
  ],
)

/**
 * Qué cancela qué del lado de proveedores: un pago o una nota de crédito del
 * proveedor aplicados a una factura o nota de débito. Lo que un pago no
 * imputa queda a cuenta.
 */
export const imputacionesCompras = pgTable(
  'imputaciones_compras',
  {
    id: id(),
    empresaId: empresaId(),
    pagoId: uuid('pago_id'),
    notaCreditoId: uuid('nota_credito_id'),
    compraId: uuid('compra_id').notNull(),
    /** Lo que se cancela, en la moneda del comprobante cancelado. */
    importe: importe('importe').notNull(),
    /** Lo mismo en la moneda del pago o de la nota de crédito. */
    importeOrigen: importe('importe_origen').notNull(),
    fecha: date('fecha').notNull(),
    creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.empresaId, t.compraId),
    index().on(t.empresaId, t.pagoId),
    check('imputaciones_compras_un_origen', sql`(${t.pagoId} is null) <> (${t.notaCreditoId} is null)`),
    check('imputaciones_compras_positiva', sql`${t.importe} > 0 and ${t.importeOrigen} > 0`),
    deLaEmpresa('imputaciones_compras_pago_fk', t.empresaId, t.pagoId, pagos).onDelete('cascade'),
    deLaEmpresa('imputaciones_compras_nota_credito_fk', t.empresaId, t.notaCreditoId, compras),
    deLaEmpresa('imputaciones_compras_compra_fk', t.empresaId, t.compraId, compras),
  ],
)
