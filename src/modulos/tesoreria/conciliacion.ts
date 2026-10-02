import { asc, eq, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { conciliaciones, cuentasTesoreria, extractos, extractosLineas } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { leerCsv } from '../../lib/csv'
import { aImporte, D, monto, normalizarNumero, type Monto } from '../../lib/dinero'
import { leerXlsx, serialAFecha } from '../../lib/xlsx'
import { esZip } from '../../lib/zip'
import { movimientosCuenta, type MovimientoCuenta } from './cuentas'

/**
 * Conciliación bancaria: se importa el extracto del banco (CSV o Excel, como
 * lo baja el home banking) y cada línea se empareja con lo registrado en el
 * sistema. El sistema propone las parejas obvias (mismo importe, fechas
 * cercanas); el usuario confirma y resuelve lo demás.
 */

export type LineaExtracto = {
  fecha: string
  descripcion: string
  referencia: string | null
  importe: string
  saldo: string | null
}

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function numero(v: string | undefined): Monto | null {
  const t = (v ?? '')
    .trim()
    .replace(/^\$\s*/, '')
    .replace(/\s/g, '')
  if (!t) return null
  // "1.234,56", "1234.56", "-1.234,56", "(1.234,56)"
  const negativo = /^\(.*\)$/.test(t) || t.startsWith('-') || t.endsWith('-')
  const limpio = normalizarNumero(t.replace(/[()]/g, '').replace(/^-|-$/g, ''))
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null
  return negativo ? new D(limpio).negated() : new D(limpio)
}

function fecha(v: string): string | null {
  const t = v.trim()
  let m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  if (/^\d{5}(\.\d+)?$/.test(t)) return serialAFecha(Number(t))
  return null
}

/**
 * Convierte la tabla del extracto en líneas. Reconoce las columnas por nombre:
 * fecha, descripción (concepto, detalle), referencia (comprobante, número),
 * débito y crédito por separado o un solo importe con signo, y saldo.
 */
export function interpretarExtracto(tabla: string[][]): { lineas: LineaExtracto[]; error?: string } {
  const inicio = tabla.findIndex((f) => f.some((c) => normal(c).startsWith('fecha')))
  if (inicio < 0) return { lineas: [], error: 'No encontré la columna de fecha en el extracto.' }
  const cab = tabla[inicio].map(normal)
  const col = (...nombres: string[]) => cab.findIndex((c) => nombres.some((n) => c === n || c.startsWith(n)))
  const iFecha = col('fecha')
  const iDesc = col('descripcion', 'concepto', 'detalle', 'movimiento', 'leyenda')
  const iRef = col('referencia', 'comprobante', 'numero', 'nro', 'cod. operacion', 'operacion')
  const iDebito = col('debito', 'debitos', 'egreso', 'retiro')
  const iCredito = col('credito', 'creditos', 'ingreso', 'deposito')
  const iImporte = col('importe', 'monto', 'valor')
  const iSaldo = col('saldo')
  if (iDebito < 0 && iCredito < 0 && iImporte < 0) {
    return { lineas: [], error: 'No encontré las columnas de importe (débito y crédito, o importe).' }
  }
  const lineas: LineaExtracto[] = []
  for (const fila of tabla.slice(inicio + 1)) {
    const f = fecha(fila[iFecha] ?? '')
    if (!f) continue
    let importe: Monto | null
    if (iDebito >= 0 || iCredito >= 0) {
      const deb = iDebito >= 0 ? (numero(fila[iDebito])?.abs() ?? new D(0)) : new D(0)
      const cre = iCredito >= 0 ? (numero(fila[iCredito])?.abs() ?? new D(0)) : new D(0)
      importe = cre.minus(deb)
    } else {
      importe = numero(fila[iImporte])
    }
    if (!importe || importe.isZero()) continue
    const saldo = iSaldo >= 0 ? numero(fila[iSaldo]) : null
    lineas.push({
      fecha: f,
      descripcion: (iDesc >= 0 ? fila[iDesc] : '').trim() || '(sin descripción)',
      referencia: iRef >= 0 ? (fila[iRef] ?? '').trim() || null : null,
      importe: aImporte(importe),
      saldo: saldo ? aImporte(saldo) : null,
    })
  }
  return { lineas }
}

export async function leerExtracto(datos: Uint8Array) {
  if (esZip(datos)) return interpretarExtracto(await leerXlsx(datos))
  const texto = new TextDecoder().decode(datos).replace(/^﻿/, '')
  const primera = texto.split(/\r?\n/).find((l) => normal(l).includes('fecha')) ?? ''
  const separador = [';', '\t', ','].sort((a, b) => primera.split(b).length - primera.split(a).length)[0]
  const filas = leerCsv(texto, separador)
  const cabecera = Object.keys(filas[0] ?? {})
  return interpretarExtracto([cabecera, ...filas.map((r) => cabecera.map((c) => r[c] ?? ''))])
}

/** Guarda las líneas del extracto. Las que ya se habían importado se saltean (misma huella). */
export async function importarExtracto(
  tx: Transaccion,
  usuarioId: string,
  cuentaId: string,
  archivo: string,
  lineas: LineaExtracto[],
) {
  const [cuenta] = await tx.select().from(cuentasTesoreria).where(eq(cuentasTesoreria.id, cuentaId))
  if (!cuenta) return { ok: false as const, error: 'Esa cuenta ya no existe.' }
  if (!lineas.length) return { ok: false as const, error: 'El extracto no tiene movimientos.' }
  const fechas = lineas.map((l) => l.fecha).sort()
  const [ext] = await tx
    .insert(extractos)
    .values({ cuentaId, archivo, desde: fechas[0], hasta: fechas.at(-1)!, usuarioId })
    .returning()
  // Huella: fecha, importe, descripción y cuántas iguales van (dos comisiones iguales el mismo día).
  const vistas = new Map<string, number>()
  const filas = lineas.map((l, n) => {
    const base = `${l.fecha}|${l.importe}|${normal(l.descripcion)}|${l.referencia ?? ''}`
    const vez = (vistas.get(base) ?? 0) + 1
    vistas.set(base, vez)
    return { ...l, extractoId: ext.id, cuentaId, huella: `${base}|${vez}`, orden: n }
  })
  const nuevas = await tx.insert(extractosLineas).values(filas).onConflictDoNothing().returning({ id: extractosLineas.id })
  await auditar(tx, {
    usuarioId,
    accion: 'importacion',
    entidad: 'extracto',
    entidadId: ext.id,
    despues: { archivo, lineas: lineas.length },
  })
  return { ok: true as const, nuevas: nuevas.length, repetidas: lineas.length - nuevas.length }
}

export type Sugerencia = { lineaId: string; movimientos: { origen: MovimientoCuenta['origen']; id: string }[] }

/** Estado de la conciliación de una cuenta: líneas del banco y movimientos del sistema sin conciliar, con sugerencias. */
export async function estadoConciliacion(tx: Transaccion, cuentaId: string) {
  const lineas = await tx
    .select({
      id: extractosLineas.id,
      fecha: extractosLineas.fecha,
      descripcion: extractosLineas.descripcion,
      referencia: extractosLineas.referencia,
      importe: extractosLineas.importe,
      saldo: extractosLineas.saldo,
      conciliada: sql<boolean>`exists (select 1 from conciliaciones c where c.linea_id = extractos_lineas.id)`,
    })
    .from(extractosLineas)
    .where(eq(extractosLineas.cuentaId, cuentaId))
    .orderBy(asc(extractosLineas.fecha), asc(extractosLineas.orden))
  const libro = await movimientosCuenta(tx, cuentaId)
  const pendientesBanco = lineas.filter((l) => !l.conciliada)
  const pendientesSistema = libro.movimientos.filter((m) => !m.conciliado && m.tipo !== 'saldo_inicial')

  // Sugerencias: mismo importe y hasta 5 días de diferencia, la más cercana primero.
  const usados = new Set<string>()
  const sugerencias: Sugerencia[] = []
  const dias = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000
  for (const l of pendientesBanco) {
    const candidato = pendientesSistema
      .filter((m) => !usados.has(m.id) && monto(m.importe).eq(l.importe) && dias(m.fecha, l.fecha) <= 5)
      .sort((a, b) => dias(a.fecha, l.fecha) - dias(b.fecha, l.fecha))[0]
    if (candidato) {
      usados.add(candidato.id)
      sugerencias.push({ lineaId: l.id, movimientos: [{ origen: candidato.origen, id: candidato.id }] })
    }
  }
  const ultima = lineas.filter((l) => l.saldo !== null).at(-1)
  return {
    lineas,
    pendientesBanco,
    pendientesSistema,
    sugerencias,
    saldoSistema: libro.saldo,
    saldoBanco: ultima?.saldo ?? null,
    fechaSaldoBanco: ultima?.fecha ?? null,
  }
}

/** Concilia una línea del banco con uno o varios movimientos del sistema que suman lo mismo. */
export async function conciliar(
  tx: Transaccion,
  usuarioId: string,
  lineaId: string,
  movimientos: { origen: MovimientoCuenta['origen']; id: string }[],
) {
  const [linea] = await tx.select().from(extractosLineas).where(eq(extractosLineas.id, lineaId))
  if (!linea) return { ok: false as const, error: 'Esa línea del extracto ya no existe.' }
  if (!movimientos.length) return { ok: false as const, error: 'Elegí qué movimientos del sistema corresponden.' }
  const [ya] = await tx.select().from(conciliaciones).where(eq(conciliaciones.lineaId, lineaId))
  if (ya) return { ok: false as const, error: 'Esa línea ya está conciliada.' }
  const libro = await movimientosCuenta(tx, linea.cuentaId)
  const porClave = new Map(libro.movimientos.map((m) => [`${m.origen}|${m.id}`, m]))
  let suma = new D(0)
  for (const m of movimientos) {
    const encontrado = porClave.get(`${m.origen}|${m.id}`)
    if (!encontrado) return { ok: false as const, error: 'Uno de los movimientos no es de esta cuenta o fue anulado.' }
    if (encontrado.conciliado) return { ok: false as const, error: 'Uno de los movimientos ya está conciliado.' }
    suma = suma.plus(encontrado.importe)
  }
  if (!suma.eq(linea.importe)) {
    return { ok: false as const, error: `Los movimientos suman ${aImporte(suma)} y el banco dice ${aImporte(linea.importe)}.` }
  }
  await tx.insert(conciliaciones).values(movimientos.map((m) => ({ lineaId, origen: m.origen, origenId: m.id, usuarioId })))
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'conciliacion', entidadId: lineaId, despues: movimientos })
  return { ok: true as const }
}

/** Confirma de una vez las sugerencias que el usuario aceptó. */
export async function conciliarVarias(tx: Transaccion, usuarioId: string, sugerencias: Sugerencia[]) {
  let hechas = 0
  for (const s of sugerencias) {
    const r = await conciliar(tx, usuarioId, s.lineaId, s.movimientos)
    if (r.ok) hechas++
  }
  return hechas
}

export async function desconciliar(tx: Transaccion, usuarioId: string, lineaId: string) {
  await tx.delete(conciliaciones).where(eq(conciliaciones.lineaId, lineaId))
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'conciliacion', entidadId: lineaId })
  return { ok: true as const }
}
