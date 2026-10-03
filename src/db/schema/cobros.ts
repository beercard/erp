import { sql } from 'drizzle-orm'
import { boolean, check, foreignKey, index, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { empresaId, id, importe, marcasDeTiempo } from './comunes'
import { recibos } from './facturacion'
import { terceros } from './maestros'
import { empresas } from './plataforma'
import { cuentasTesoreria } from './tesoreria'

/**
 * Cobros online: la empresa conecta sus pasarelas (Mercado Pago, Payway,
 * GoCuotas, Clover) y manda a sus clientes un link de pago del ERP. El
 * cliente elige con qué pagar y, cuando la pasarela confirma, el ERP emite
 * el recibo solo y lo imputa a las facturas.
 */

const deLaEmpresa = (
  nombre: string,
  empresa: Parameters<typeof foreignKey>[0]['columns'][0],
  columna: Parameters<typeof foreignKey>[0]['columns'][0],
  destino: { empresaId: Parameters<typeof foreignKey>[0]['columns'][0]; id: Parameters<typeof foreignKey>[0]['columns'][0] },
) => foreignKey({ name: nombre, columns: [empresa, columna], foreignColumns: [destino.empresaId, destino.id] })

export const pasarelasPago = pgTable(
  'pasarelas_pago',
  {
    id: id(),
    empresaId: empresaId(),
    /** mercadopago | payway | gocuotas | clover */
    proveedor: text('proveedor').notNull(),
    activa: boolean('activa').notNull().default(true),
    /** Modo de prueba de la pasarela (sandbox). */
    prueba: boolean('prueba').notNull().default(false),
    /** Claves de la pasarela, cifradas con ERP_CLAVE_MAESTRA. */
    credenciales: text('credenciales').notNull(),
    /** Secreto con que la pasarela firma sus avisos (Mercado Pago, Clover), cifrado. */
    secretoAvisos: text('secreto_avisos'),
    /** Dónde entra la plata (vacío: la cuenta predeterminada del medio). */
    cuentaId: uuid('cuenta_id'),
    /** Medio con que queda el recibo. */
    medio: text('medio').notNull().default('otro'),
    ...marcasDeTiempo(),
  },
  (t) => [
    unique('pasarelas_pago_empresa_id').on(t.empresaId, t.id),
    uniqueIndex('pasarelas_pago_proveedor').on(t.empresaId, t.proveedor),
    check('pasarelas_pago_proveedor_valido', sql`${t.proveedor} in ('mercadopago', 'payway', 'gocuotas', 'clover')`),
    deLaEmpresa('pasarelas_pago_cuenta_fk', t.empresaId, t.cuentaId, cuentasTesoreria).onDelete('set null'),
  ],
)

/** Un pedido de pago: lo que el cliente tiene que pagar y cómo terminó. */
export const pagosOnline = pgTable(
  'pagos_online',
  {
    id: id(),
    empresaId: empresaId(),
    terceroId: uuid('tercero_id').notNull(),
    concepto: text('concepto').notNull(),
    importe: importe('importe').notNull(),
    /** Facturas a las que se imputa el pago (en este orden, hasta su saldo). */
    comprobanteIds: uuid('comprobante_ids').array().notNull().default(sql`'{}'::uuid[]`),
    /** pendiente | aprobado | rechazado | cancelado | vencido */
    estado: text('estado').notNull().default('pendiente'),
    /** Pasarela con la que eligió pagar el cliente (la última que intentó). */
    pasarelaId: uuid('pasarela_id'),
    proveedor: text('proveedor'),
    /** Id del checkout en la pasarela (preferencia, link o sesión). */
    externoId: text('externo_id'),
    /** Id del pago aprobado en la pasarela. */
    pagoExternoId: text('pago_externo_id'),
    /** Link de la pasarela (vence; el del ERP no). */
    urlPasarela: text('url_pasarela'),
    /** Clave pública del link del ERP (/pago/<clave>). */
    clave: text('clave').notNull(),
    /** Clave secreta de la dirección de avisos de este pago (distinta de la pública: el cliente no la ve). */
    claveAviso: text('clave_aviso').notNull(),
    vence: timestamp('vence', { withTimezone: true }),
    aprobado: timestamp('aprobado', { withTimezone: true }),
    reciboId: uuid('recibo_id'),
    /** erp | portal | whatsapp */
    origen: text('origen').notNull().default('erp'),
    /** Lo último que dijo la pasarela (estado, detalle), para mostrar. */
    detalle: jsonb('detalle').$type<Record<string, unknown>>(),
    usuarioId: uuid('usuario_id'),
    ...marcasDeTiempo(),
  },
  (t) => [
    unique('pagos_online_empresa_id').on(t.empresaId, t.id),
    index().on(t.empresaId, t.estado, t.creado),
    index().on(t.empresaId, t.terceroId),
    check('pagos_online_estado', sql`${t.estado} in ('pendiente', 'aprobado', 'rechazado', 'cancelado', 'vencido')`),
    check('pagos_online_importe', sql`${t.importe} > 0`),
    deLaEmpresa('pagos_online_tercero_fk', t.empresaId, t.terceroId, terceros),
    deLaEmpresa('pagos_online_pasarela_fk', t.empresaId, t.pasarelaId, pasarelasPago).onDelete('set null'),
    deLaEmpresa('pagos_online_recibo_fk', t.empresaId, t.reciboId, recibos).onDelete('set null'),
  ],
)

/**
 * Para lo que llega sin sesión (el link /pago/<clave> y los avisos de las
 * pasarelas): a qué empresa va cada clave. De plataforma, sin datos del negocio.
 */
export const clavesCobro = pgTable('claves_cobro', {
  clave: text('clave').primaryKey(),
  /** pago (link público de un pago) | aviso (dirección secreta de avisos de un pago) | pasarela (avisos de una pasarela) */
  tipo: text('tipo').notNull(),
  empresaId: uuid('empresa_id')
    .notNull()
    .references(() => empresas.id, { onDelete: 'cascade' }),
  id: uuid('id').notNull(),
  creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
})
