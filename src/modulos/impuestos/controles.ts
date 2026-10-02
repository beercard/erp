import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, ne, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { compras, comprasTributos, comprobantes, comprobantesAsociados, terceros } from '../../db/schema'
import { validarCuit } from '../../lib/cuit'
import { limitesPeriodo } from './libroIva'

/**
 * Controles antes de presentar el Libro IVA: lo que haría rechazar la
 * importación en el Portal IVA o daría un libro distinto al de ARCA. Cada
 * control dice qué pasa, por qué importa y lleva al comprobante.
 *
 *   error: el libro sale mal (hay que corregirlo antes de presentar)
 *   aviso: puede estar bien, pero conviene mirarlo
 */

export type Control = {
  gravedad: 'error' | 'aviso'
  libro: 'ventas' | 'compras'
  problema: string
  comprobante: string
  enlace: string
}

const numero = (c: { letra: string; puntoVenta: number; numero: number | null }) =>
  `${c.letra} ${String(c.puntoVenta).padStart(5, '0')}-${String(c.numero ?? 0).padStart(8, '0')}`

const ABREV: Record<string, string> = { factura: 'FC', nota_debito: 'ND', nota_credito: 'NC' }

const cuitValido = (v: string | null | undefined) => !!v && validarCuit(v).valido

/** Meses entre dos fechas ISO (aproximado por mes calendario). */
const mesesEntre = (a: string, b: string) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7))

export async function controlesIva(tx: Transaccion, periodo: string): Promise<Control[]> {
  const { desde, hasta } = limitesPeriodo(periodo)
  const lista: Control[] = []

  // ------------------------------------------------------------ Ventas
  const ventas = await tx
    .select({
      id: comprobantes.id,
      clase: comprobantes.clase,
      letra: comprobantes.letra,
      tipo: comprobantes.tipo,
      puntoVenta: comprobantes.puntoVenta,
      numero: comprobantes.numero,
      estado: comprobantes.estado,
      origen: comprobantes.origen,
      moneda: comprobantes.moneda,
      cotizacion: comprobantes.cotizacion,
      receptorDocTipo: comprobantes.receptorDocTipo,
      receptorDocNumero: comprobantes.receptorDocNumero,
      cliente: terceros.razonSocial,
    })
    .from(comprobantes)
    .innerJoin(terceros, eq(terceros.id, comprobantes.terceroId))
    .where(and(gte(comprobantes.fecha, desde), lte(comprobantes.fecha, hasta), ne(comprobantes.letra, 'X')))
    .orderBy(asc(comprobantes.tipo), asc(comprobantes.puntoVenta), asc(comprobantes.numero))
  const venta = (c: (typeof ventas)[number], gravedad: Control['gravedad'], problema: string) =>
    lista.push({
      gravedad,
      libro: 'ventas',
      problema,
      comprobante: `${ABREV[c.clase]} ${numero(c)} · ${c.cliente}`,
      enlace: `/facturas/${c.id}`,
    })

  for (const c of ventas) {
    if (c.estado === 'pendiente_verificacion')
      venta(c, 'error', 'Quedó sin confirmar con ARCA: verificalo. Si ARCA lo autorizó, falta en el libro.')
    else if (c.estado === 'borrador') venta(c, 'aviso', 'Es un borrador con fecha de este mes: autorizalo o borralo.')
    if (c.estado !== 'autorizado') continue
    if ((c.letra === 'A' || c.letra === 'M') && (c.receptorDocTipo !== 80 || !cuitValido(c.receptorDocNumero)))
      venta(c, 'error', 'Factura A con un CUIT del cliente inválido o vacío.')
    if (c.moneda !== 'PES' && !(Number(c.cotizacion) > 1))
      venta(c, 'error', `En ${c.moneda} sin cotización: el libro lo informaría a 1 peso.`)
  }

  // Notas de crédito y débito sin el comprobante que corrigen (ARCA lo pide).
  const notas = ventas.filter((c) => c.estado === 'autorizado' && c.clase !== 'factura' && c.origen === 'erp')
  if (notas.length) {
    const conAsociado = new Set(
      (
        await tx
          .select({ id: comprobantesAsociados.comprobanteId })
          .from(comprobantesAsociados)
          .where(
            inArray(
              comprobantesAsociados.comprobanteId,
              notas.map((n) => n.id),
            ),
          )
      ).map((x) => x.id),
    )
    for (const n of notas) if (!conAsociado.has(n.id)) venta(n, 'aviso', 'Nota sin el comprobante que corrige asociado.')
  }

  // Huecos de numeración: dentro del mes, y contra el último número del mes anterior.
  const autorizadas = ventas.filter((c) => c.estado === 'autorizado' && c.numero !== null && c.origen === 'erp')
  const series = new Map<string, typeof autorizadas>()
  for (const c of autorizadas) {
    const k = `${c.tipo}-${c.puntoVenta}`
    series.set(k, [...(series.get(k) ?? []), c])
  }
  for (const serie of series.values()) {
    const primero = serie[0]
    const [antes] = await tx
      .select({ numero: sql<number | null>`max(${comprobantes.numero})` })
      .from(comprobantes)
      .where(
        and(
          eq(comprobantes.tipo, primero.tipo),
          eq(comprobantes.puntoVenta, primero.puntoVenta),
          eq(comprobantes.estado, 'autorizado'),
          lt(comprobantes.fecha, desde),
        ),
      )
    let esperado = antes?.numero ? antes.numero + 1 : primero.numero!
    for (const c of serie) {
      if (c.numero! > esperado) {
        const faltan = c.numero! - esperado
        venta(
          c,
          'aviso',
          faltan === 1
            ? `Falta el número ${esperado} antes de este (¿está en otro mes o sin cargar?).`
            : `Faltan ${faltan} números antes de este (del ${esperado} al ${c.numero! - 1}).`,
        )
      }
      esperado = c.numero! + 1
    }
  }

  // ------------------------------------------------------------ Compras
  const cs = await tx
    .select({
      id: compras.id,
      clase: compras.clase,
      letra: compras.letra,
      puntoVenta: compras.puntoVenta,
      numero: compras.numero,
      fecha: compras.fecha,
      moneda: compras.moneda,
      cotizacion: compras.cotizacion,
      neto: compras.neto,
      iva: compras.iva,
      proveedor: terceros.razonSocial,
      tipoDocumento: terceros.tipoDocumento,
      cuit: terceros.numeroDocumento,
      condicionIva: terceros.condicionIva,
    })
    .from(compras)
    .innerJoin(terceros, eq(terceros.id, compras.terceroId))
    .where(and(eq(compras.estado, 'registrado'), ne(compras.letra, 'X'), eq(compras.periodoIva, periodo)))
  const compra = (c: (typeof cs)[number], gravedad: Control['gravedad'], problema: string) =>
    lista.push({
      gravedad,
      libro: 'compras',
      problema,
      comprobante: `${ABREV[c.clase]} ${numero(c)} · ${c.proveedor}`,
      enlace: `/compras/${c.id}`,
    })

  for (const c of cs) {
    if (c.tipoDocumento !== 80 || !cuitValido(c.cuit)) compra(c, 'error', 'El proveedor no tiene un CUIT válido.')
    if (c.fecha > hasta)
      compra(
        c,
        'error',
        `Tiene fecha ${c.fecha.split('-').reverse().join('/')}, posterior al período: no se puede computar todavía.`,
      )
    else if (mesesEntre(c.fecha, periodo) > 12)
      compra(c, 'aviso', 'Tiene más de un año: revisá que corresponda computarla en este período.')
    if (c.moneda !== 'PES' && !(Number(c.cotizacion) > 1)) compra(c, 'error', `En ${c.moneda} sin cotización.`)
    if (c.letra === 'A' && Number(c.neto) > 0 && Number(c.iva) === 0) compra(c, 'aviso', 'Factura A con neto gravado y sin IVA.')
    if (c.letra === 'A' && (c.condicionIva === 6 || c.condicionIva === 13))
      compra(c, 'aviso', 'Factura A de un proveedor cargado como monotributista: revisá su condición de IVA.')
    if (c.letra === 'C' && c.condicionIva === 1)
      compra(c, 'aviso', 'Factura C de un proveedor cargado como responsable inscripto: revisá su condición de IVA.')
  }
  if (cs.length) {
    const sinJurisdiccion = await tx
      .select({ compraId: comprasTributos.compraId })
      .from(comprasTributos)
      .where(
        and(
          eq(comprasTributos.tipo, 'percepcion_iibb'),
          isNull(comprasTributos.provincia),
          inArray(
            comprasTributos.compraId,
            cs.map((c) => c.id),
          ),
        ),
      )
    for (const s of new Set(sinJurisdiccion.map((x) => x.compraId)))
      compra(
        cs.find((c) => c.id === s)!,
        'aviso',
        'Percepción de IIBB sin jurisdicción: no se puede computar en la provincia que corresponde.',
      )
  }

  // Compras con fecha de este mes cargadas para un período posterior (para que no queden afuera sin querer).
  const posteriores = await tx
    .select({
      id: compras.id,
      clase: compras.clase,
      letra: compras.letra,
      puntoVenta: compras.puntoVenta,
      numero: compras.numero,
      periodoIva: compras.periodoIva,
      proveedor: terceros.razonSocial,
    })
    .from(compras)
    .innerJoin(terceros, eq(terceros.id, compras.terceroId))
    .where(
      and(
        eq(compras.estado, 'registrado'),
        gte(compras.fecha, desde),
        lte(compras.fecha, hasta),
        gt(compras.periodoIva, periodo),
      ),
    )
  for (const c of posteriores)
    lista.push({
      gravedad: 'aviso',
      libro: 'compras',
      problema: `Tiene fecha de este mes pero está cargada para el período ${c.periodoIva.split('-').reverse().join('/')}.`,
      comprobante: `${ABREV[c.clase]} ${numero(c)} · ${c.proveedor}`,
      enlace: `/compras/${c.id}`,
    })

  return lista.sort((a, b) => (a.gravedad === b.gravedad ? 0 : a.gravedad === 'error' ? -1 : 1))
}
