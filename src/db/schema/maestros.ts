import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

import { alicuotasIva, condicionesIva, monedas, provincias, tiposDocumento } from './catalogos'
import { cantidad, empresaId, id, importe, marcasDeTiempo, precio } from './comunes'
import { usuarios } from './plataforma'

/**
 * Maestros de cada empresa (etapa 0). Todas estas tablas llevan empresa_id
 * con RLS forzado (ver la migración de seguridad y src/db/empresa.ts).
 *
 * Las referencias entre tablas de empresa son claves foráneas COMPUESTAS
 * (empresa_id, id): una clave foránea común no pasa por RLS, y con ella un
 * cliente de una empresa podría apuntar al depósito de otra si alguien
 * conociera el id. Con la compuesta lo impide la base. Por eso cada tabla
 * referenciada tiene además un UNIQUE (empresa_id, id).
 */

/** Clave foránea compuesta hacia otra tabla de la misma empresa. */
function deLaEmpresa(
  nombre: string,
  empresa: AnyPgColumn,
  columna: AnyPgColumn,
  destino: { empresaId: AnyPgColumn; id: AnyPgColumn },
) {
  return foreignKey({
    name: nombre,
    columns: [empresa, columna],
    foreignColumns: [destino.empresaId, destino.id],
  })
}

export const zonas = pgTable(
  'zonas',
  {
    id: id(),
    empresaId: empresaId(),
    nombre: text('nombre').notNull(),
    activa: boolean('activa').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.nombre), unique('zonas_empresa_id').on(t.empresaId, t.id)],
)

export const transportes = pgTable(
  'transportes',
  {
    id: id(),
    empresaId: empresaId(),
    nombre: text('nombre').notNull(),
    cuit: text('cuit'),
    telefono: text('telefono'),
    activo: boolean('activo').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.nombre), unique('transportes_empresa_id').on(t.empresaId, t.id)],
)

export const condicionesPago = pgTable(
  'condiciones_pago',
  {
    id: id(),
    empresaId: empresaId(),
    nombre: text('nombre').notNull(),
    /** Días hasta el vencimiento; 0 es contado. */
    dias: smallint('dias').notNull().default(0),
    /** Cantidad de cuotas iguales (1 = un solo pago). */
    cuotas: smallint('cuotas').notNull().default(1),
    activa: boolean('activa').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.nombre), unique('condiciones_pago_empresa_id').on(t.empresaId, t.id)],
)

export const vendedores = pgTable(
  'vendedores',
  {
    id: id(),
    empresaId: empresaId(),
    codigo: text('codigo').notNull(),
    nombre: text('nombre').notNull(),
    email: text('email'),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    comisionVenta: precio('comision_venta').notNull().default('0'),
    comisionCobranza: precio('comision_cobranza').notNull().default('0'),
    activo: boolean('activo').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.codigo), unique('vendedores_empresa_id').on(t.empresaId, t.id)],
)

export const depositos = pgTable(
  'depositos',
  {
    id: id(),
    empresaId: empresaId(),
    codigo: text('codigo').notNull(),
    nombre: text('nombre').notNull(),
    domicilio: text('domicilio'),
    activo: boolean('activo').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.codigo), unique('depositos_empresa_id').on(t.empresaId, t.id)],
)

export const puntosVenta = pgTable(
  'puntos_venta',
  {
    id: id(),
    empresaId: empresaId(),
    /** Número que va en el comprobante (0004). */
    numero: integer('numero').notNull(),
    nombre: text('nombre').notNull(),
    /** electronico | fce | manual | remitos */
    tipo: text('tipo').notNull(),
    depositoId: uuid('deposito_id'),
    activo: boolean('activo').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.numero),
    unique('puntos_venta_empresa_id').on(t.empresaId, t.id),
    deLaEmpresa('puntos_venta_deposito_fk', t.empresaId, t.depositoId, depositos),
  ],
)

export const rubros = pgTable(
  'rubros',
  {
    id: id(),
    empresaId: empresaId(),
    nombre: text('nombre').notNull(),
    padreId: uuid('padre_id'),
    activo: boolean('activo').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [
    index().on(t.empresaId, t.padreId),
    unique('rubros_empresa_id').on(t.empresaId, t.id),
    deLaEmpresa('rubros_padre_fk', t.empresaId, t.padreId, t),
  ],
)

export const marcas = pgTable(
  'marcas',
  {
    id: id(),
    empresaId: empresaId(),
    nombre: text('nombre').notNull(),
    activa: boolean('activa').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.nombre), unique('marcas_empresa_id').on(t.empresaId, t.id)],
)

export const listasPrecios = pgTable(
  'listas_precios',
  {
    id: id(),
    empresaId: empresaId(),
    codigo: text('codigo').notNull(),
    nombre: text('nombre').notNull(),
    moneda: text('moneda')
      .notNull()
      .default('PES')
      .references(() => monedas.codigo),
    /** Los precios cargados incluyen IVA. */
    incluyeIva: boolean('incluye_iva').notNull().default(false),
    /**
     * Lista derivada: precio = precio de la lista base × (1 + porcentaje/100).
     * Así funcionan "Tarjeta 6 cuotas", "Cheque 30 días", etc.
     */
    listaBaseId: uuid('lista_base_id'),
    porcentaje: precio('porcentaje'),
    vigenteHasta: date('vigente_hasta'),
    activa: boolean('activa').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.codigo),
    unique('listas_precios_empresa_id').on(t.empresaId, t.id),
    deLaEmpresa('listas_precios_base_fk', t.empresaId, t.listaBaseId, t),
  ],
)

export const articulos = pgTable(
  'articulos',
  {
    id: id(),
    empresaId: empresaId(),
    codigo: text('codigo').notNull(),
    nombre: text('nombre').notNull(),
    descripcion: text('descripcion'),
    /** producto | servicio */
    tipo: text('tipo').notNull().default('producto'),
    rubroId: uuid('rubro_id'),
    marcaId: uuid('marca_id'),
    unidad: text('unidad').notNull().default('unidad'),
    alicuotaIva: smallint('alicuota_iva')
      .notNull()
      .default(5)
      .references(() => alicuotasIva.codigo),
    llevaStock: boolean('lleva_stock').notNull().default(true),
    llevaSerie: boolean('lleva_serie').notNull().default(false),
    codigoBarras: text('codigo_barras'),
    costo: precio('costo'),
    monedaCosto: text('moneda_costo')
      .notNull()
      .default('PES')
      .references(() => monedas.codigo),
    stockMinimo: cantidad('stock_minimo'),
    /** Cuánto pedir al reponer; sin dato, se repone hasta el doble del mínimo. */
    loteReposicion: cantidad('lote_reposicion'),
    /** Proveedor habitual; sin dato, el de la última compra. */
    proveedorId: uuid('proveedor_id'),
    activo: boolean('activo').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.codigo),
    index().on(t.empresaId, t.nombre),
    unique('articulos_empresa_id').on(t.empresaId, t.id),
    deLaEmpresa('articulos_rubro_fk', t.empresaId, t.rubroId, rubros),
    deLaEmpresa('articulos_marca_fk', t.empresaId, t.marcaId, marcas),
  ],
)

export const precios = pgTable(
  'precios',
  {
    id: id(),
    empresaId: empresaId(),
    listaId: uuid('lista_id').notNull(),
    articuloId: uuid('articulo_id').notNull(),
    precio: precio('precio').notNull(),
    /**
     * Moneda de este precio. Nula: la de la lista. Una misma lista puede
     * tener equipos en dólares e insumos en pesos (así trabaja KOMSA).
     */
    moneda: text('moneda').references(() => monedas.codigo),
    /** Queda el historial: el precio vigente es el de mayor vigente_desde <= hoy. */
    vigenteDesde: date('vigente_desde').notNull().defaultNow(),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.listaId, t.articuloId, t.vigenteDesde),
    deLaEmpresa('precios_lista_fk', t.empresaId, t.listaId, listasPrecios),
    deLaEmpresa('precios_articulo_fk', t.empresaId, t.articuloId, articulos),
  ],
)

/**
 * Grupos de clientes: un usuario con grupos asignados solo ve los clientes
 * de esos grupos (y sus órdenes, equipos y formularios). Sin grupos ve todo.
 * Lo hace cumplir Postgres (drizzle/0048_grupos_clientes_seguridad.sql).
 */
export const gruposClientes = pgTable(
  'grupos_clientes',
  {
    id: id(),
    empresaId: empresaId(),
    nombre: text('nombre').notNull(),
    ...marcasDeTiempo(),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.nombre), unique('grupos_clientes_empresa_id').on(t.empresaId, t.id)],
)

export const usuariosGruposClientes = pgTable(
  'usuarios_grupos_clientes',
  {
    empresaId: empresaId(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    grupoId: uuid('grupo_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.usuarioId, t.grupoId] }),
    index().on(t.empresaId, t.usuarioId),
    deLaEmpresa('usuarios_grupos_clientes_grupo_fk', t.empresaId, t.grupoId, gruposClientes).onDelete('cascade'),
  ],
)

export const terceros = pgTable(
  'terceros',
  {
    id: id(),
    empresaId: empresaId(),
    codigo: text('codigo').notNull(),
    razonSocial: text('razon_social').notNull(),
    nombreFantasia: text('nombre_fantasia'),
    esCliente: boolean('es_cliente').notNull().default(true),
    esProveedor: boolean('es_proveedor').notNull().default(false),
    tipoDocumento: smallint('tipo_documento')
      .notNull()
      .references(() => tiposDocumento.codigo),
    numeroDocumento: text('numero_documento'),
    condicionIva: smallint('condicion_iva')
      .notNull()
      .references(() => condicionesIva.codigo),
    /** local | convenio | exento | no_inscripto */
    iibbRegimen: text('iibb_regimen'),
    iibbNumero: text('iibb_numero'),
    email: text('email'),
    telefono: text('telefono'),
    domicilio: text('domicilio'),
    localidad: text('localidad'),
    codigoPostal: text('codigo_postal'),
    provincia: text('provincia').references(() => provincias.codigo),
    // Condiciones comerciales
    listaPreciosId: uuid('lista_precios_id'),
    vendedorId: uuid('vendedor_id'),
    condicionPagoId: uuid('condicion_pago_id'),
    zonaId: uuid('zona_id'),
    transporteId: uuid('transporte_id'),
    descuento: precio('descuento'),
    limiteCredito: importe('limite_credito'),
    /** Percepción de IIBB: nulo = alícuota general de la empresa; 0 = no se le percibe. */
    percepcionIibb: precio('percepcion_iibb'),
    /**
     * Retención de Ganancias al pagarle (proveedores): código del régimen
     * (regimenes_ganancias.codigo, el de SICORE). Nulo = no se le retiene.
     */
    regimenGanancias: text('regimen_ganancias'),
    /** Inscripto en Ganancias (si no, se le retiene con la alícuota de no inscriptos). */
    gananciasInscripto: boolean('ganancias_inscripto').notNull().default(true),
    notas: text('notas'),
    /** Grupo de clientes (visibilidad por usuario). */
    grupoClienteId: uuid('grupo_cliente_id'),
    activo: boolean('activo').notNull().default(true),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.codigo),
    index().on(t.empresaId, t.numeroDocumento),
    index().on(t.empresaId, t.razonSocial),
    unique('terceros_empresa_id').on(t.empresaId, t.id),
    deLaEmpresa('terceros_lista_fk', t.empresaId, t.listaPreciosId, listasPrecios),
    deLaEmpresa('terceros_vendedor_fk', t.empresaId, t.vendedorId, vendedores),
    deLaEmpresa('terceros_condicion_pago_fk', t.empresaId, t.condicionPagoId, condicionesPago),
    deLaEmpresa('terceros_zona_fk', t.empresaId, t.zonaId, zonas),
    deLaEmpresa('terceros_transporte_fk', t.empresaId, t.transporteId, transportes),
    deLaEmpresa('terceros_grupo_cliente_fk', t.empresaId, t.grupoClienteId, gruposClientes),
  ],
)

export const tercerosContactos = pgTable(
  'terceros_contactos',
  {
    id: id(),
    empresaId: empresaId(),
    terceroId: uuid('tercero_id').notNull(),
    nombre: text('nombre').notNull(),
    cargo: text('cargo'),
    email: text('email'),
    telefono: text('telefono'),
    ...marcasDeTiempo(),
  },
  (t) => [
    index().on(t.empresaId, t.terceroId),
    deLaEmpresa('terceros_contactos_tercero_fk', t.empresaId, t.terceroId, terceros).onDelete('cascade'),
  ],
)
