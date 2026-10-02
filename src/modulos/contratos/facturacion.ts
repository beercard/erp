import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { comprobantes, contratos, equipos, facturacionesContrato, lecturas, terceros } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { filasDe } from '../compras/compras'
import { eliminarBorrador, guardarComprobante } from '../facturacion/comprobantes'
import { calcularContrato, renglonesFactura, type Calculo, type EquipoLectura } from './calculo'

/**
 * Facturación mensual de contratos: se arma la vista previa del mes (qué
 * contratos se facturan, con qué lecturas y cuánto da), se revisa y se
 * generan las facturas como borradores. La autorización en ARCA se pide
 * después, desde cada factura, como cualquier otra.
 */

/** Último día de un período "AAAA-MM". */
function finDeMes(periodo: string) {
  const [a, m] = periodo.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

export type Preparado = {
  contratoId: string
  numero: number
  cliente: string
  terceroId: string
  tipo: string
  moneda: string
  /** Ya facturado en este período. */
  facturado: boolean
  /** Equipos sin lectura nueva en el período (se factura con la anterior). */
  sinLectura: string[]
  calculo: Calculo
}

/**
 * Lecturas de los equipos en contrato para facturar un período, en pocas
 * consultas: la anterior es el último contador facturado de cada equipo (o
 * el de instalación) y la actual, la última lectura hasta fin de mes.
 */
async function lecturasDelPeriodo(tx: Transaccion, periodo: string, contratoIds: string[]) {
  const porContrato = new Map<string, (EquipoLectura & { conLectura: boolean })[]>()
  if (!contratoIds.length) return porContrato
  const fin = finDeMes(periodo)
  const [eqs, ultimas, facturados] = await Promise.all([
    tx
      .select({ id: equipos.id, serie: equipos.serie, contratoId: equipos.contratoId, contadorInicial: equipos.contadorInicial })
      .from(equipos)
      .where(and(inArray(equipos.contratoId, contratoIds), eq(equipos.estado, 'instalado'))),
    tx
      .selectDistinctOn([lecturas.equipoId], {
        equipoId: lecturas.equipoId,
        fecha: lecturas.fecha,
        contador: lecturas.contador,
        creditos: lecturas.creditos,
      })
      .from(lecturas)
      .where(lte(lecturas.fecha, fin))
      .orderBy(lecturas.equipoId, desc(lecturas.fecha)),
    tx.execute(sql`
      select distinct on (d->>'equipoId') d->>'equipoId' as equipo_id, (d->>'actual')::bigint as actual
      from facturaciones_contrato f, jsonb_array_elements(f.detalle) d
      where f.estado = 'facturada' and f.periodo < ${periodo}
      order by d->>'equipoId', f.periodo desc`),
  ])
  const ultima = new Map(ultimas.map((l) => [l.equipoId, l]))
  const anterior = new Map(
    filasDe<{ equipo_id: string; actual: string | number }>(facturados).map((f) => [f.equipo_id, Number(f.actual)]),
  )
  for (const e of eqs) {
    const l = ultima.get(e.id)
    // Nunca desde menos que el contador inicial (para los migrados, el último conocido del sistema anterior).
    const desde = Math.max(anterior.get(e.id) ?? 0, e.contadorInicial)
    const conLectura = !!l && l.fecha >= `${periodo}-01`
    const fila = {
      equipoId: e.id,
      serie: e.serie,
      anterior: desde,
      // Una lectura vieja (anterior a lo facturado) no resta copias.
      actual: Math.max(desde, l?.contador ?? desde),
      creditos: conLectura ? l!.creditos : 0,
      conLectura,
    }
    porContrato.set(e.contratoId!, [...(porContrato.get(e.contratoId!) ?? []), fila])
  }
  return porContrato
}

const paraCalculo = (c: typeof contratos.$inferSelect) => ({
  modalidad: c.modalidad as 'abono' | 'excedente' | 'cargo_fijo',
  facturacion: c.facturacion as 'adelantada' | 'vencida',
  moneda: c.moneda,
  cargoFijo: c.cargoFijo,
  copiasLibres: c.copiasLibres,
  precioExcedente: c.precioExcedente,
  porEquipo: c.porEquipo,
})

export async function prepararMes(tx: Transaccion, periodo: string, cotizacion: string): Promise<Preparado[]> {
  const activos = await tx
    .select({ c: contratos, cliente: terceros.razonSocial })
    .from(contratos)
    .innerJoin(terceros, eq(terceros.id, contratos.terceroId))
    .where(eq(contratos.estado, 'activo'))
  const ya = new Set(
    (
      await tx
        .select({ contratoId: facturacionesContrato.contratoId })
        .from(facturacionesContrato)
        .where(and(eq(facturacionesContrato.periodo, periodo), eq(facturacionesContrato.estado, 'facturada')))
    ).map((f) => f.contratoId),
  )
  const lecturasPorContrato = await lecturasDelPeriodo(
    tx,
    periodo,
    activos.map((a) => a.c.id),
  )
  const salida: Preparado[] = []
  for (const { c, cliente } of activos) {
    const l = lecturasPorContrato.get(c.id) ?? []
    if (!l.length && c.modalidad !== 'cargo_fijo') continue
    salida.push({
      contratoId: c.id,
      numero: c.numero,
      cliente,
      terceroId: c.terceroId,
      tipo: c.tipo,
      moneda: c.moneda,
      facturado: ya.has(c.id),
      sinLectura: l.filter((x) => !x.conLectura).map((x) => x.serie),
      calculo: calcularContrato(paraCalculo(c), l, cotizacion),
    })
  }
  return salida.sort((a, b) => a.cliente.localeCompare(b.cliente))
}

/**
 * Genera la facturación del período de los contratos elegidos: registra lo
 * facturado (con el detalle de cada equipo) y deja la factura en borrador.
 */
export async function generarFacturas(
  tx: Transaccion,
  usuarioId: string,
  o: { periodo: string; contratoIds: string[]; puntoVenta: number; fecha: string; cotizacion: string },
) {
  const preparados = (await prepararMes(tx, o.periodo, o.cotizacion)).filter((p) => o.contratoIds.includes(p.contratoId))
  const generadas: { contratoId: string; comprobanteId: string }[] = []
  const errores: string[] = []
  for (const p of preparados) {
    if (p.facturado) {
      errores.push(`${p.cliente}: el contrato ${p.numero} ya se facturó en ${o.periodo}.`)
      continue
    }
    if (!Number(p.calculo.totalPesos)) {
      errores.push(`${p.cliente}: el contrato ${p.numero} no tiene nada para facturar.`)
      continue
    }
    const [c] = await tx.select().from(contratos).where(eq(contratos.id, p.contratoId))
    const items = renglonesFactura(
      {
        ...paraCalculo(c),
        alicuotaIva: c.alicuotaIva,
        tipo: c.tipo,
        leyenda: c.leyenda,
      },
      p.calculo,
      o.periodo,
      o.cotizacion,
    )
    const f = await guardarComprobante(tx, usuarioId, {
      clase: 'factura',
      terceroId: c.terceroId,
      puntoVenta: o.puntoVenta,
      fecha: o.fecha,
      moneda: 'PES',
      cotizacion: '1',
      concepto: 2,
      servicioDesde: `${o.periodo}-01`,
      servicioHasta: finDeMes(o.periodo),
      vencimiento: o.fecha,
      observaciones: `Contrato N° ${c.numero}${c.moneda !== 'PES' ? ` · dólar ${o.cotizacion}` : ''}`,
      items,
    })
    if (!f.ok) {
      errores.push(`${p.cliente}: ${f.error}`)
      continue
    }
    await tx.insert(facturacionesContrato).values({
      contratoId: c.id,
      periodo: o.periodo,
      fecha: o.fecha,
      equipos: p.calculo.equipos,
      copias: p.calculo.copias,
      copiasLibres: p.calculo.copiasLibres,
      copiasExcedentes: p.calculo.copiasExcedentes,
      cargo: p.calculo.cargo,
      excedente: p.calculo.excedente,
      total: p.calculo.total,
      moneda: c.moneda,
      cotizacion: c.moneda === 'PES' ? '1' : o.cotizacion,
      detalle: p.calculo.detalle,
      comprobanteId: f.id,
      usuarioId,
    })
    generadas.push({ contratoId: c.id, comprobanteId: f.id })
  }
  await auditar(tx, {
    usuarioId,
    accion: 'emision',
    entidad: 'facturacion_contratos',
    despues: { ...o, generadas: generadas.length },
  })
  return { generadas, errores }
}

/**
 * Anula la facturación de un contrato en un período para poder rehacerla. Si
 * la factura sigue en borrador, la borra; si ya se autorizó, queda y hay que
 * hacerle la nota de crédito.
 */
export async function anularFacturacion(tx: Transaccion, usuarioId: string, id: string) {
  const [f] = await tx.select().from(facturacionesContrato).where(eq(facturacionesContrato.id, id))
  if (!f || f.estado === 'anulada') return { ok: false as const, error: 'Esa facturación no existe o ya está anulada.' }
  const [factura] = f.comprobanteId
    ? await tx.select({ estado: comprobantes.estado }).from(comprobantes).where(eq(comprobantes.id, f.comprobanteId))
    : []
  // Una factura ya pedida a ARCA queda: se anula con nota de crédito. El borrador se borra.
  const borrador = factura?.estado === 'borrador'
  await tx
    .update(facturacionesContrato)
    .set({ estado: 'anulada', ...(borrador ? { comprobanteId: null } : {}) })
    .where(eq(facturacionesContrato.id, id))
  if (borrador) {
    const r = await eliminarBorrador(tx, usuarioId, f.comprobanteId!)
    if (!r.ok) throw new Error(r.error)
  }
  await auditar(tx, { usuarioId, accion: 'anulacion', entidad: 'facturacion_contrato', entidadId: id })
  return { ok: true as const }
}
