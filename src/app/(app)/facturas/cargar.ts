import { and, eq, inArray } from 'drizzle-orm'

import type { CabeceraEditor, ContextoFactura, LineaEditor } from '@/components/comercial/EditorDocumento'
import type { Transaccion } from '@/db/conexion'
import { condicionesIva, puntosVenta } from '@/db/schema'
import { hoyArgentina } from '@/lib/fechas'
import { nombresDeArticulos, obtenerPedido } from '@/modulos/comercial/documentos'
import { formatearNumero } from '@/modulos/comercial/numeracion'
import { empresaEmisora, obtenerComprobante } from '@/modulos/facturacion/comprobantes'
import { abreviatura, letraPara, type Clase } from '@/modulos/facturacion/tipos'

import { dolarHoy, opcionesDocumento } from '../comercial/opciones'

const lineasDe = async (
  tx: Transaccion,
  items: {
    id: string
    articuloId: string | null
    descripcion: string
    cantidad: string
    precioUnitario: string
    descuento: string
    alicuotaIva: number
  }[],
): Promise<LineaEditor[]> => {
  const codigos = await nombresDeArticulos(
    tx,
    items.map((i) => i.articuloId).filter((x): x is string => Boolean(x)),
  )
  return items.map((i) => ({
    clave: i.id,
    articuloId: i.articuloId,
    codigo: i.articuloId ? (codigos.get(i.articuloId) ?? null) : null,
    descripcion: i.descripcion,
    cantidad: String(Number(i.cantidad)),
    precioUnitario: String(Number(i.precioUnitario)),
    descuento: Number(i.descuento) ? String(Number(i.descuento)) : '',
    alicuotaIva: i.alicuotaIva,
  }))
}

/**
 * Datos para el editor de comprobantes: uno nuevo (vacío, desde un pedido o
 * como nota sobre otro comprobante) o un borrador existente.
 */
export async function datosFactura(tx: Transaccion, o: { id?: string; pedidoId?: string; asociadoId?: string; clase?: Clase }) {
  const [opciones, dolar, empresa, condiciones, pvs] = await Promise.all([
    opcionesDocumento(tx),
    dolarHoy(tx),
    empresaEmisora(tx),
    tx.select().from(condicionesIva),
    tx
      .select()
      .from(puntosVenta)
      .where(and(eq(puntosVenta.activo, true), inArray(puntosVenta.tipo, ['electronico', 'fce'])))
      .orderBy(puntosVenta.numero),
  ])
  const letraDe = Object.fromEntries(condiciones.map((c) => [c.codigo, letraPara(empresa.condicionIva, c.letraDesdeInscripto)]))
  const puntos = pvs.map((p) => ({ valor: String(p.numero), texto: `${String(p.numero).padStart(4, '0')} · ${p.nombre}` }))

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
    depositoId: '',
    fechaEntrega: '',
    puntoVenta: puntos[0]?.valor ?? '',
    concepto: '1',
    servicioDesde: '',
    servicioHasta: '',
    vencimiento: '',
    condicionIva: null,
  }
  const contexto: ContextoFactura = { clase: o.clase ?? 'factura', asociado: null, pedidoId: null, puntosVenta: puntos, letraDe }

  if (o.id) {
    const c = await obtenerComprobante(tx, o.id)
    if (!c) return null
    const inicial: CabeceraEditor = {
      ...vacio,
      terceroId: c.terceroId,
      cliente: c.cliente?.razonSocial ?? '',
      fecha: c.fecha,
      moneda: c.moneda,
      listaPreciosId: c.listaPreciosId ?? '',
      vendedorId: c.vendedorId ?? '',
      condicionPagoId: c.condicionPagoId ?? '',
      observaciones: c.observaciones ?? '',
      puntoVenta: String(c.puntoVenta),
      concepto: String(c.concepto),
      servicioDesde: c.servicioDesde ?? '',
      servicioHasta: c.servicioHasta ?? '',
      vencimiento: c.vencimiento ?? '',
      condicionIva: c.cliente?.condicionIva ?? null,
    }
    const asociado = c.asociados[0]
    return {
      opciones,
      dolar: c.moneda === 'DOL' ? String(Number(c.cotizacion)) : dolar,
      inicial,
      lineas: await lineasDe(tx, c.items),
      editable: c.estado === 'borrador',
      factura: {
        ...contexto,
        clase: c.clase as Clase,
        pedidoId: c.pedidoId,
        asociado: asociado
          ? {
              id: asociado.id,
              texto: `${abreviatura(asociado.tipo)} ${formatearNumero(asociado.puntoVenta, asociado.numero ?? 0)}`,
            }
          : null,
      },
    }
  }

  if (o.asociadoId) {
    // Nota de crédito o débito: mismo cliente, moneda y renglones del original.
    const a = await obtenerComprobante(tx, o.asociadoId)
    if (!a || a.estado !== 'autorizado') return null
    return {
      opciones,
      dolar: a.moneda === 'DOL' ? String(Number(a.cotizacion)) : dolar,
      inicial: {
        ...vacio,
        terceroId: a.terceroId,
        cliente: a.cliente?.razonSocial ?? '',
        moneda: a.moneda,
        listaPreciosId: a.listaPreciosId ?? '',
        vendedorId: a.vendedorId ?? '',
        condicionPagoId: a.condicionPagoId ?? '',
        puntoVenta: String(a.puntoVenta),
        concepto: String(a.concepto),
        servicioDesde: a.servicioDesde ?? '',
        servicioHasta: a.servicioHasta ?? '',
        vencimiento: a.vencimiento ?? '',
        condicionIva: a.cliente?.condicionIva ?? null,
      },
      lineas: o.clase === 'nota_debito' ? [] : await lineasDe(tx, a.items),
      editable: true,
      factura: {
        ...contexto,
        asociado: { id: a.id, texto: `${abreviatura(a.tipo)} ${formatearNumero(a.puntoVenta, a.numero ?? 0)}` },
      },
    }
  }

  if (o.pedidoId) {
    const p = await obtenerPedido(tx, o.pedidoId)
    if (!p) return null
    return {
      opciones,
      dolar: p.moneda === 'DOL' ? String(Number(p.cotizacion)) : dolar,
      inicial: {
        ...vacio,
        terceroId: p.terceroId,
        cliente: p.cliente?.razonSocial ?? '',
        moneda: p.moneda,
        listaPreciosId: p.listaPreciosId ?? '',
        vendedorId: p.vendedorId ?? '',
        condicionPagoId: p.condicionPagoId ?? '',
        observaciones: p.observaciones ?? '',
        condicionIva: p.cliente?.condicionIva ?? null,
      },
      lineas: await lineasDe(tx, p.items),
      editable: true,
      factura: { ...contexto, pedidoId: p.id },
    }
  }

  return { opciones, dolar, inicial: vacio, lineas: [] as LineaEditor[], editable: true, factura: contexto }
}
