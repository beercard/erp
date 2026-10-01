import type { Transaccion } from '@/db/conexion'
import { hoyArgentina } from '@/lib/fechas'
import { nombresDeArticulos, obtenerPedido, obtenerPresupuesto } from '@/modulos/comercial/documentos'
import type { CabeceraEditor, LineaEditor } from '@/components/comercial/EditorDocumento'

import { dolarHoy, opcionesDocumento } from './opciones'

/** Datos para abrir el editor: vacío (nuevo) o con un documento existente. */
export async function datosEditor(tx: Transaccion, tipo: 'presupuesto' | 'pedido', id?: string) {
  const [opciones, dolar] = await Promise.all([opcionesDocumento(tx), dolarHoy(tx)])
  const vacio: CabeceraEditor = {
    terceroId: '',
    cliente: '',
    fecha: hoyArgentina(),
    moneda: 'PES',
    listaPreciosId: opciones.listas[0]?.valor ?? '',
    vendedorId: '',
    condicionPagoId: '',
    observaciones: '',
    validezDias: '15',
    depositoId: opciones.depositos[0]?.valor ?? '',
    fechaEntrega: '',
  }
  if (!id) return { opciones, dolar, inicial: vacio, lineas: [] as LineaEditor[], editable: true }

  const doc = tipo === 'presupuesto' ? await obtenerPresupuesto(tx, id) : await obtenerPedido(tx, id)
  if (!doc) return null
  const codigos = await nombresDeArticulos(
    tx,
    doc.items.map((i) => i.articuloId).filter((x): x is string => Boolean(x)),
  )
  const inicial: CabeceraEditor = {
    terceroId: doc.terceroId,
    cliente: doc.cliente?.razonSocial ?? '',
    fecha: doc.fecha,
    moneda: doc.moneda,
    listaPreciosId: doc.listaPreciosId ?? '',
    vendedorId: doc.vendedorId ?? '',
    condicionPagoId: doc.condicionPagoId ?? '',
    observaciones: doc.observaciones ?? '',
    validezDias: 'validezDias' in doc ? String(doc.validezDias) : '15',
    depositoId: 'depositoId' in doc ? (doc.depositoId ?? '') : '',
    fechaEntrega: 'fechaEntrega' in doc ? (doc.fechaEntrega ?? '') : '',
  }
  const lineas: LineaEditor[] = doc.items.map((i) => ({
    clave: i.id,
    articuloId: i.articuloId,
    codigo: i.articuloId ? (codigos.get(i.articuloId) ?? null) : null,
    descripcion: i.descripcion,
    cantidad: String(Number(i.cantidad)),
    precioUnitario: String(Number(i.precioUnitario)),
    descuento: Number(i.descuento) ? String(Number(i.descuento)) : '',
    alicuotaIva: i.alicuotaIva,
  }))
  const editable = tipo === 'presupuesto' ? ['borrador', 'enviado'].includes(doc.estado) : doc.estado === 'pendiente'
  return {
    opciones,
    dolar: doc.moneda === 'DOL' ? String(Number(doc.cotizacion)) : dolar,
    inicial,
    lineas,
    editable,
  }
}
