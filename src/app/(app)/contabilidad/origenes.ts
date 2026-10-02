/** Nombre de cada origen de asiento, para listados y filtros. */
export const ORIGENES: Record<string, string> = {
  manual: 'Manual',
  venta: 'Venta',
  compra: 'Compra',
  cobranza: 'Cobranza',
  pago: 'Pago',
  cheque_propio: 'Débito de cheque propio',
  tesoreria: 'Tesorería',
  cheque_rechazado: 'Cheque rechazado',
  liquidacion_iva: 'Liquidación de IVA',
  refundicion: 'Refundición',
  apertura: 'Apertura',
}

const RUTA: Partial<Record<string, string>> = {
  venta: '/facturas',
  compra: '/compras',
  cobranza: '/cobranzas',
  pago: '/pagos',
}

/** Enlace a la operación que generó el asiento, si tiene pantalla propia. */
export const rutaOrigen = (origen: string, id: string | null) => (id && RUTA[origen] ? `${RUTA[origen]}/${id}` : null)

/** Fechas por defecto de un listado: el mes en curso. */
export function rangoPedido(p: { desde?: string; hasta?: string }, hoy: string) {
  const fecha = /^\d{4}-\d{2}-\d{2}$/
  const desde = p.desde && fecha.test(p.desde) ? p.desde : `${hoy.slice(0, 7)}-01`
  const hasta = p.hasta && fecha.test(p.hasta) ? p.hasta : hoy
  return { desde, hasta }
}
