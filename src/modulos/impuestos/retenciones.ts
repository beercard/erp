import { and, asc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import {
  compras,
  comprasTributos,
  comprobantes,
  comprobantesTributos,
  pagos,
  percepcionesIibb,
  provincias,
  recibos,
  recibosValores,
  retenciones,
  terceros,
} from '../../db/schema'
import { limitesPeriodo } from './libroIva'

/**
 * Ingresos Brutos y retenciones del mes:
 *
 * - Como agente: percepciones de IIBB cobradas en las facturas y retenciones
 *   practicadas en los pagos (Ganancias, IIBB, IVA, SUSS). Las de Ganancias
 *   salen en el archivo de importación de SICORE.
 * - Como sujeto: percepciones sufridas en las compras y retenciones que los
 *   clientes descontaron en las cobranzas (se computan en las declaraciones).
 * - Base de IIBB: las ventas netas del mes por provincia del cliente (ayuda
 *   para el Convenio Multilateral; el coeficiente lo define el contador).
 */

const r2 = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------- Como agente

/** Percepciones de IIBB cobradas en las facturas del mes, con su jurisdicción. */
export async function percepcionesPracticadas(tx: Transaccion, periodo: string) {
  const { desde, hasta } = limitesPeriodo(periodo)
  const filas = await tx
    .select({
      fecha: comprobantes.fecha,
      clase: comprobantes.clase,
      letra: comprobantes.letra,
      puntoVenta: comprobantes.puntoVenta,
      numero: comprobantes.numero,
      cotizacion: comprobantes.cotizacion,
      cliente: terceros.razonSocial,
      cuit: terceros.numeroDocumento,
      provincia: percepcionesIibb.provincia,
      jurisdiccion: provincias.nombre,
      base: comprobantesTributos.base,
      alicuota: comprobantesTributos.alicuota,
      importe: comprobantesTributos.importe,
    })
    .from(comprobantesTributos)
    .innerJoin(comprobantes, eq(comprobantes.id, comprobantesTributos.comprobanteId))
    .innerJoin(terceros, eq(terceros.id, comprobantes.terceroId))
    .leftJoin(percepcionesIibb, eq(percepcionesIibb.id, comprobantesTributos.percepcionId))
    .leftJoin(provincias, eq(provincias.codigo, percepcionesIibb.provincia))
    .where(
      and(
        inArray(comprobantesTributos.tributo, [2, 5, 7]),
        eq(comprobantes.estado, 'autorizado'),
        gte(comprobantes.fecha, desde),
        lte(comprobantes.fecha, hasta),
      ),
    )
    .orderBy(asc(comprobantes.fecha), asc(comprobantes.numero))
  return filas.map((f) => {
    const s = f.clase === 'nota_credito' ? -1 : 1
    const c = Number(f.cotizacion)
    return {
      ...f,
      base: r2(Number(f.base) * c * s),
      importe: r2(Number(f.importe) * c * s),
      alicuota: Number(f.alicuota),
      comprobante: `${f.clase === 'nota_credito' ? 'NC' : f.clase === 'nota_debito' ? 'ND' : 'FC'} ${f.letra} ${String(f.puntoVenta).padStart(5, '0')}-${String(f.numero ?? 0).padStart(8, '0')}`,
    }
  })
}

/** Retenciones practicadas en los pagos del mes (no anulados). */
export async function retencionesPracticadas(tx: Transaccion, periodo: string) {
  const { desde, hasta } = limitesPeriodo(periodo)
  return tx
    .select({
      id: retenciones.id,
      impuesto: retenciones.impuesto,
      regimen: retenciones.regimen,
      certificado: retenciones.numero,
      base: retenciones.base,
      alicuota: retenciones.alicuota,
      importe: retenciones.importe,
      fecha: pagos.fecha,
      pago: pagos.numero,
      totalPago: pagos.total,
      proveedor: terceros.razonSocial,
      tipoDocumento: terceros.tipoDocumento,
      cuit: terceros.numeroDocumento,
      inscripto: terceros.gananciasInscripto,
    })
    .from(retenciones)
    .innerJoin(pagos, eq(pagos.id, retenciones.pagoId))
    .innerJoin(terceros, eq(terceros.id, pagos.terceroId))
    .where(and(eq(pagos.estado, 'emitido'), gte(pagos.fecha, desde), lte(pagos.fecha, hasta)))
    .orderBy(asc(retenciones.impuesto), asc(retenciones.numero))
}

// ---------------------------------------------------------------- SICORE

/** dd/mm/aaaa */
const fechaSicore = (iso: string) => iso.split('-').reverse().join('/')
/** Importe con coma decimal, relleno con ceros a la izquierda: (1234.5, 14) → "00000001234,50". */
export function importeSicore(v: string | number, largo: number) {
  const s = Math.abs(Number(v)).toFixed(2).replace('.', ',')
  return s.padStart(largo, '0').slice(-largo)
}
const num = (v: string | number | null | undefined, largo: number) =>
  String(v ?? '')
    .replace(/\D/g, '')
    .padStart(largo, '0')
    .slice(-largo)

export const LARGO_SICORE = 144

/**
 * Archivo de importación de retenciones para SICORE (impuesto 217,
 * Ganancias): una línea por retención, de 144 caracteres.
 *
 *   código de comprobante (06 orden de pago) · fecha · número · importe del
 *   comprobante · impuesto · régimen · operación (1 retención) · base ·
 *   fecha de la retención · condición (01 inscripto, 02 no inscripto) ·
 *   sujeto suspendido · importe retenido · % de exclusión · fecha de boletín
 *   · tipo y número de documento del retenido · número de certificado
 */
export function lineasSicore(lista: Awaited<ReturnType<typeof retencionesPracticadas>>) {
  return lista
    .filter((r) => r.impuesto === 'ganancias')
    .map(
      (r) =>
        '06' +
        fechaSicore(r.fecha) +
        num(r.pago, 16) +
        importeSicore(r.totalPago, 16) +
        '217' +
        num(r.regimen, 3) +
        '1' +
        importeSicore(r.base, 14) +
        fechaSicore(r.fecha) +
        (r.inscripto ? '01' : '02') +
        '0' +
        importeSicore(r.importe, 14) +
        importeSicore(0, 6) +
        ' '.repeat(10) +
        num(r.tipoDocumento ?? 80, 2) +
        num(r.cuit, 20) +
        num(r.certificado, 14),
    )
}

// ---------------------------------------------------------------- Como sujeto

/** Percepciones sufridas en las compras del período de IVA (IIBB por jurisdicción, IVA y Ganancias). */
export async function percepcionesSufridas(tx: Transaccion, periodo: string) {
  const filas = await tx
    .select({
      tipo: comprasTributos.tipo,
      provincia: comprasTributos.provincia,
      jurisdiccion: provincias.nombre,
      importe: sql<string>`sum(${comprasTributos.importe} * ${compras.cotizacion} * case when ${compras.clase} = 'nota_credito' then -1 else 1 end)`,
      cantidad: sql<number>`count(*)::int`,
    })
    .from(comprasTributos)
    .innerJoin(compras, eq(compras.id, comprasTributos.compraId))
    .leftJoin(provincias, eq(provincias.codigo, comprasTributos.provincia))
    .where(
      and(
        inArray(comprasTributos.tipo, ['percepcion_iibb', 'percepcion_iva', 'percepcion_ganancias']),
        eq(compras.estado, 'registrado'),
        eq(compras.periodoIva, periodo),
      ),
    )
    .groupBy(comprasTributos.tipo, comprasTributos.provincia, provincias.nombre)
  return filas.map((f) => ({ ...f, importe: r2(Number(f.importe)) }))
}

/** Retenciones que descontaron los clientes en las cobranzas del mes. */
export async function retencionesSufridas(tx: Transaccion, periodo: string) {
  const { desde, hasta } = limitesPeriodo(periodo)
  const filas = await tx
    .select({
      medio: recibosValores.medio,
      importe: recibosValores.importe,
      certificado: recibosValores.numeroValor,
      detalle: recibosValores.detalle,
      fecha: recibos.fecha,
      recibo: recibos.numero,
      cliente: terceros.razonSocial,
      cuit: terceros.numeroDocumento,
    })
    .from(recibosValores)
    .innerJoin(recibos, eq(recibos.id, recibosValores.reciboId))
    .innerJoin(terceros, eq(terceros.id, recibos.terceroId))
    .where(
      and(
        inArray(recibosValores.medio, ['retencion_iibb', 'retencion_ganancias', 'retencion_iva', 'retencion_suss']),
        eq(recibos.estado, 'emitido'),
        gte(recibos.fecha, desde),
        lte(recibos.fecha, hasta),
      ),
    )
    .orderBy(asc(recibos.fecha))
  return filas.map((f) => ({ ...f, impuesto: f.medio.replace('retencion_', ''), importe: Number(f.importe) }))
}

// ---------------------------------------------------------------- Base de IIBB

/** Ventas netas (sin IVA ni percepciones) del mes, por provincia del cliente. */
export async function baseIibb(tx: Transaccion, periodo: string) {
  const { desde, hasta } = limitesPeriodo(periodo)
  const filas = await tx
    .select({
      provincia: terceros.provincia,
      jurisdiccion: provincias.nombre,
      neto: sql<string>`sum((${comprobantes.neto} + ${comprobantes.noGravado} + ${comprobantes.exento}) * ${comprobantes.cotizacion} * case when ${comprobantes.clase} = 'nota_credito' then -1 else 1 end)`,
      cantidad: sql<number>`count(*)::int`,
    })
    .from(comprobantes)
    .innerJoin(terceros, eq(terceros.id, comprobantes.terceroId))
    .leftJoin(provincias, eq(provincias.codigo, terceros.provincia))
    .where(
      and(
        eq(comprobantes.estado, 'autorizado'),
        ne(comprobantes.letra, 'X'),
        gte(comprobantes.fecha, desde),
        lte(comprobantes.fecha, hasta),
      ),
    )
    .groupBy(terceros.provincia, provincias.nombre)
  const lista = filas.map((f) => ({ ...f, neto: r2(Number(f.neto)) })).sort((a, b) => b.neto - a.neto)
  const total = r2(lista.reduce((s, f) => s + f.neto, 0))
  return { lista: lista.map((f) => ({ ...f, porcentaje: total ? Math.round((f.neto / total) * 10000) / 100 : 0 })), total }
}
