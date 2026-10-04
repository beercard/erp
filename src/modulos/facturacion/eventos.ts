import { eq } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { comprobantes, imputaciones, recibos, recibosValores, terceros } from '../../db/schema'
import { emitir } from '../integraciones/webhooks'
import { abreviatura, nombreComprobante } from './tipos'

/**
 * Lo que va en los webhooks de facturación: el comprobante o el recibo con el cliente, para que el sistema que recibe
 * (una tienda, un CRM, la facturación de otro sistema) no tenga que volver a consultar la API. Se encolan en la misma
 * transacción que la emisión: si esta se revierte, no sale ningún aviso.
 */

const cliente = {
  id: terceros.id,
  codigo: terceros.codigo,
  razonSocial: terceros.razonSocial,
  tipoDocumento: terceros.tipoDocumento,
  numeroDocumento: terceros.numeroDocumento,
}

export async function datosComprobante(tx: Transaccion, id: string) {
  const [f] = await tx
    .select({ c: comprobantes, cliente })
    .from(comprobantes)
    .innerJoin(terceros, eq(terceros.id, comprobantes.terceroId))
    .where(eq(comprobantes.id, id))
  if (!f) return { id }
  const c = f.c
  return {
    id: c.id,
    clase: c.clase,
    tipo: c.tipo,
    letra: c.letra,
    nombre: nombreComprobante(c.tipo),
    abreviatura: abreviatura(c.tipo),
    puntoVenta: c.puntoVenta,
    numero: c.numero,
    fecha: c.fecha,
    vencimiento: c.vencimiento,
    moneda: c.moneda,
    cotizacion: c.cotizacion,
    neto: c.neto,
    iva: c.iva,
    total: c.total,
    cae: c.cae,
    caeVence: c.caeVence,
    referencia: c.referenciaExterna,
    cliente: f.cliente,
  }
}

export async function datosRecibo(tx: Transaccion, id: string) {
  const [f] = await tx
    .select({ r: recibos, cliente })
    .from(recibos)
    .innerJoin(terceros, eq(terceros.id, recibos.terceroId))
    .where(eq(recibos.id, id))
  if (!f) return { id }
  const valores = await tx
    .select({ medio: recibosValores.medio, importe: recibosValores.importe })
    .from(recibosValores)
    .where(eq(recibosValores.reciboId, id))
  const aplicado = await tx
    .select({ comprobanteId: imputaciones.comprobanteId, importe: imputaciones.importe })
    .from(imputaciones)
    .where(eq(imputaciones.reciboId, id))
  return {
    id: f.r.id,
    puntoVenta: f.r.puntoVenta,
    numero: f.r.numero,
    fecha: f.r.fecha,
    estado: f.r.estado,
    total: f.r.total,
    cliente: f.cliente,
    valores,
    imputaciones: aplicado,
  }
}

export const avisarAutorizado = async (tx: Transaccion, id: string) =>
  emitir(tx, 'comprobante.autorizado', await datosComprobante(tx, id))

export const avisarCobranza = async (tx: Transaccion, evento: 'cobranza.registrada' | 'cobranza.anulada', id: string) =>
  emitir(tx, evento, await datosRecibo(tx, id))

/** Una factura o nota de débito quedó sin deuda: con qué se terminó de cancelar. */
export async function avisarSaldado(tx: Transaccion, id: string, origen: { reciboId?: string; notaCreditoId?: string }) {
  return emitir(tx, 'comprobante.saldado', {
    ...(await datosComprobante(tx, id)),
    canceladoCon: origen.reciboId ? { recibo: origen.reciboId } : { notaCredito: origen.notaCreditoId },
  })
}
