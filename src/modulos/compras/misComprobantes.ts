import { and, eq, gte, inArray, lte } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { compras, terceros } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { validarCuit } from '../../lib/cuit'
import { leerCsv } from '../../lib/csv'
import { aImporte, D, monto, normalizarNumero } from '../../lib/dinero'
import { leerXlsx, serialAFecha } from '../../lib/xlsx'
import { esZip, leerZip } from '../../lib/zip'
import { TASAS_IVA } from '../comercial/calculo'
import { registrarCompra } from './compras'
import { datosTipoCompra, discriminaIva } from './tipos'

/**
 * Importación de "Mis Comprobantes" de ARCA (comprobantes recibidos). Sirve
 * para controlar que estén cargadas todas las compras del período y para
 * registrar de una vez las que faltan (gastos y servicios, sin artículos).
 *
 * Acepta el Excel, el CSV o el ZIP que baja ARCA, en el formato anterior a
 * septiembre de 2025 (un solo neto gravado) y en el nuevo (neto e IVA por
 * alícuota). Las columnas se buscan por nombre. Las notas de crédito vienen
 * con importes positivos: el signo sale del tipo de comprobante.
 */

export type FilaArca = {
  fila: number
  fecha: string
  tipo: number
  puntoVenta: number
  numero: number
  cae: string | null
  cuit: string
  nombre: string
  moneda: 'PES' | 'DOL'
  cotizacion: string
  /** Base e IVA por alícuota de ARCA (5 = 21 %, 4 = 10,5 %…). */
  alicuotas: { alicuotaIva: number; base: string; importe: string }[]
  noGravado: string
  exento: string
  otrosTributos: string
  iva: string
  total: string
  /** Problemas para registrarla sola (tipo desconocido, IVA que no cierra…). */
  avisos: string[]
}

const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^imp\.\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Nombre normalizado de columna → campo. Los de alícuota se resuelven aparte. */
const COLUMNAS: Record<string, string> = {
  fecha: 'fecha',
  'fecha de emision': 'fecha',
  tipo: 'tipo',
  'tipo de comprobante': 'tipo',
  'punto de venta': 'puntoVenta',
  'numero desde': 'numero',
  'cod. autorizacion': 'cae',
  'nro. doc. emisor': 'cuit',
  'denominacion emisor': 'nombre',
  'tipo cambio': 'cotizacion',
  moneda: 'moneda',
  'neto gravado': 'netoTotal',
  'neto gravado total': 'netoTotal',
  'neto no gravado': 'noGravado',
  'op. exentas': 'exento',
  'otros tributos': 'otrosTributos',
  iva: 'iva',
  'total iva': 'iva',
  total: 'total',
}

/** "21%" → 5, "10,5%" → 4… */
const ALICUOTA_POR_TASA: Record<string, number> = Object.fromEntries(
  Object.entries(TASAS_IVA).map(([codigo, tasa]) => [tasa.replace('.', ','), Number(codigo)]),
)

function numero(v: string | undefined): string {
  const t = (v ?? '').trim()
  if (!t) return '0'
  const n = normalizarNumero(t.replace(/^\$\s*/, ''))
  return /^-?\d+(\.\d+)?$/.test(n) ? String(Math.abs(Number(n))) : '0'
}

function fecha(v: string): string | null {
  const t = v.trim()
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  if (/^\d{5}(\.\d+)?$/.test(t)) return serialAFecha(Number(t))
  return null
}

/** Convierte la tabla (encabezado incluido en alguna de las primeras filas) en comprobantes. */
export function interpretarTabla(tabla: string[][]): { filas: FilaArca[]; errores: string[] } {
  const inicio = tabla.findIndex((f) => f.some((c) => ['fecha', 'fecha de emision'].includes(normal(c))))
  if (inicio < 0)
    return { filas: [], errores: ['No encontré el encabezado (la columna "Fecha"). ¿Es el archivo de Mis Comprobantes?'] }
  const cabecera = tabla[inicio].map(normal)
  const campo = new Map<number, string>()
  const netos = new Map<number, number>()
  const ivas = new Map<number, number>()
  cabecera.forEach((c, i) => {
    const neto = c.match(/^neto grav(?:\.|ado) iva ([\d,]+)%$/)
    const iva = c.match(/^iva ([\d,]+)%$/)
    if (neto && ALICUOTA_POR_TASA[neto[1]]) netos.set(i, ALICUOTA_POR_TASA[neto[1]])
    else if (iva && ALICUOTA_POR_TASA[iva[1]]) ivas.set(i, ALICUOTA_POR_TASA[iva[1]])
    else if (COLUMNAS[c] && ![...campo.values()].includes(COLUMNAS[c])) campo.set(i, COLUMNAS[c])
  })
  const faltan = ['fecha', 'tipo', 'puntoVenta', 'numero', 'cuit', 'total'].filter((c) => ![...campo.values()].includes(c))
  if (faltan.length) return { filas: [], errores: [`Faltan columnas en el archivo: ${faltan.join(', ')}.`] }

  const filas: FilaArca[] = []
  const errores: string[] = []
  for (let n = inicio + 1; n < tabla.length; n++) {
    const fila = tabla[n]
    if (!fila.some((c) => c.trim())) continue
    const v: Record<string, string> = {}
    campo.forEach((nombre, i) => (v[nombre] = fila[i] ?? ''))
    const f = fecha(v.fecha)
    const tipo = parseInt(v.tipo, 10)
    // "00002-00001201" en una sola columna (formato que anunció ARCA en 2025).
    let pv = v.puntoVenta
    let nro = v.numero
    const junto = pv.match(/^(\d+)-(\d+)$/)
    if (junto) [pv, nro] = [junto[1], nro || junto[2]]
    if (!f || !Number.isFinite(tipo) || !/^\d+$/.test(pv.trim()) || !/^\d+$/.test((nro ?? '').trim())) {
      errores.push(`Fila ${n + 1}: no se pudo leer fecha, tipo o número.`)
      continue
    }
    const avisos: string[] = []
    if (!datosTipoCompra(tipo)) avisos.push(`Tipo de comprobante ${tipo} no se registra automáticamente.`)
    const alicuotas: FilaArca['alicuotas'] = []
    for (const [i, codigo] of netos) {
      const base = numero(fila[i])
      if (monto(base).gt(0)) {
        const ivaCol = [...ivas].find(([, c]) => c === codigo)?.[0]
        alicuotas.push({ alicuotaIva: codigo, base, importe: ivaCol === undefined ? '0' : numero(fila[ivaCol]) })
      }
    }
    const iva = numero(v.iva)
    const netoTotal = numero(v.netoTotal)
    if (!alicuotas.length && monto(netoTotal).gt(0)) {
      // Formato viejo: un solo neto. Se deduce la alícuota del IVA, si cierra.
      const tasa = monto(netoTotal).gt(0) ? monto(iva).dividedBy(netoTotal).times(100) : new D(0)
      const codigo = Object.entries(TASAS_IVA).find(([, t]) => tasa.minus(t).abs().lt('0.05'))?.[0]
      if (codigo) alicuotas.push({ alicuotaIva: Number(codigo), base: netoTotal, importe: iva })
      else avisos.push('Tiene más de una alícuota de IVA: cargalo a mano.')
    }
    const moneda = /^(usd|dol|u\$s)/i.test(v.moneda?.trim() ?? '') ? 'DOL' : 'PES'
    filas.push({
      fila: n + 1,
      fecha: f,
      tipo,
      puntoVenta: Number(pv),
      numero: Number(nro),
      cae: v.cae?.trim() || null,
      cuit: (v.cuit ?? '').replace(/\D/g, ''),
      nombre: (v.nombre ?? '').trim(),
      moneda,
      cotizacion: moneda === 'PES' ? '1' : numero(v.cotizacion),
      alicuotas,
      noGravado: numero(v.noGravado),
      exento: numero(v.exento),
      otrosTributos: numero(v.otrosTributos),
      iva,
      total: numero(v.total),
      avisos,
    })
  }
  return { filas, errores }
}

/** Lee el archivo como venga (Excel, ZIP con CSV o CSV suelto). */
export async function leerMisComprobantes(datos: Uint8Array) {
  if (esZip(datos)) {
    const archivos = await leerZip(datos)
    if ([...archivos.keys()].some((n) => n.startsWith('xl/'))) return interpretarTabla(await leerXlsx(datos))
    const csv = [...archivos].find(([n]) => n.toLowerCase().endsWith('.csv'))
    if (!csv) return { filas: [], errores: ['El ZIP no tiene un CSV adentro.'] }
    return interpretarCsv(new TextDecoder().decode(csv[1]))
  }
  return interpretarCsv(new TextDecoder().decode(datos))
}

function interpretarCsv(texto: string) {
  const primera = texto.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? ''
  const separador = (primera.match(/;/g)?.length ?? 0) >= (primera.match(/,/g)?.length ?? 0) ? ';' : ','
  const registros = leerCsv(texto, separador)
  if (!registros.length) return { filas: [], errores: ['El archivo está vacío.'] }
  const cabecera = Object.keys(registros[0])
  return interpretarTabla([cabecera, ...registros.map((r) => cabecera.map((c) => r[c] ?? ''))])
}

export type Conciliacion = {
  filas: (FilaArca & {
    estado: 'registrado' | 'falta' | 'proveedor_nuevo' | 'no_registrable'
    terceroId: string | null
    compraId: string | null
  })[]
  /** Comprobantes cargados en el ERP en esas fechas que ARCA no informa. */
  soloEnErp: { id: string; tipo: number; puntoVenta: number; numero: number; fecha: string; proveedor: string; total: string }[]
}

/** Cruza el archivo con lo registrado. */
export async function conciliar(tx: Transaccion, filas: FilaArca[]): Promise<Conciliacion> {
  const cuits = [...new Set(filas.map((f) => f.cuit))]
  const provs = cuits.length ? await tx.select().from(terceros).where(inArray(terceros.numeroDocumento, cuits)) : []
  const porCuit = new Map(provs.map((p) => [p.numeroDocumento!, p]))
  const fechas = filas.map((f) => f.fecha).sort()
  const registradas = fechas.length
    ? await tx
        .select({
          id: compras.id,
          terceroId: compras.terceroId,
          tipo: compras.tipo,
          puntoVenta: compras.puntoVenta,
          numero: compras.numero,
          fecha: compras.fecha,
          total: compras.total,
          proveedor: terceros.razonSocial,
          cuit: terceros.numeroDocumento,
        })
        .from(compras)
        .innerJoin(terceros, eq(terceros.id, compras.terceroId))
        .where(and(eq(compras.estado, 'registrado'), gte(compras.fecha, fechas[0]), lte(compras.fecha, fechas.at(-1)!)))
    : []
  const clave = (cuit: string | null, tipo: number, pv: number, nro: number) => `${cuit}|${tipo}|${pv}|${nro}`
  const enErp = new Map(registradas.map((r) => [clave(r.cuit, r.tipo, r.puntoVenta, r.numero), r]))
  const vistos = new Set<string>()
  const resultado: Conciliacion['filas'] = filas.map((f) => {
    const k = clave(f.cuit, f.tipo, f.puntoVenta, f.numero)
    vistos.add(k)
    const c = enErp.get(k)
    const prov = porCuit.get(f.cuit)
    const estado = c ? 'registrado' : f.avisos.length ? 'no_registrable' : prov ? 'falta' : 'proveedor_nuevo'
    return { ...f, estado, terceroId: prov?.id ?? null, compraId: c?.id ?? null }
  })
  const soloEnErp = registradas
    .filter((r) => !vistos.has(clave(r.cuit, r.tipo, r.puntoVenta, r.numero)))
    .map(({ terceroId: _t, cuit: _c, ...r }) => r)
  return { filas: resultado, soloEnErp }
}

/**
 * Registra los comprobantes que faltan, sin artículos. Si el proveedor no
 * existe se crea con los datos de ARCA. Devuelve cuántos se registraron y
 * los que no se pudieron (con el motivo).
 */
export async function registrarFaltantes(tx: Transaccion, usuarioId: string, filas: FilaArca[]) {
  const conciliacion = await conciliar(tx, filas)
  let registrados = 0
  const errores: string[] = []
  for (const f of conciliacion.filas.filter((x) => x.estado === 'falta' || x.estado === 'proveedor_nuevo')) {
    const datos = datosTipoCompra(f.tipo)!
    let terceroId = f.terceroId
    if (!terceroId) {
      const valido = validarCuit(f.cuit).valido
      const [existente] = await tx.select().from(terceros).where(eq(terceros.numeroDocumento, f.cuit))
      if (existente) terceroId = existente.id
      else {
        const [nuevo] = await tx
          .insert(terceros)
          .values({
            codigo: `ARCA-${f.cuit}`,
            razonSocial: f.nombre || `Proveedor ${f.cuit}`,
            esCliente: false,
            esProveedor: true,
            tipoDocumento: valido ? 80 : 99,
            numeroDocumento: valido ? f.cuit : null,
            // Quien emite A es inscripto; quien emite C, monotributista o exento.
            condicionIva: datos.letra === 'A' || datos.letra === 'M' ? 1 : 6,
          })
          .onConflictDoNothing()
          .returning()
        if (!nuevo) {
          errores.push(`Fila ${f.fila}: no se pudo crear el proveedor ${f.cuit}.`)
          continue
        }
        terceroId = nuevo.id
        await auditar(tx, {
          usuarioId,
          accion: 'alta',
          entidad: 'tercero',
          entidadId: nuevo.id,
          despues: { origen: 'mis_comprobantes', cuit: f.cuit },
        })
      }
    } else {
      await tx
        .update(terceros)
        .set({ esProveedor: true })
        .where(and(eq(terceros.id, terceroId), eq(terceros.esProveedor, false)))
    }
    // B y C no discriminan IVA: el total (sin otros tributos) es el precio final.
    const precioFinal = !discriminaIva(datos.letra)
    const r = await registrarCompra(
      tx,
      usuarioId,
      {
        terceroId,
        clase: datos.clase,
        letra: datos.letra,
        fce: datos.fce,
        puntoVenta: f.puntoVenta,
        numero: f.numero,
        fecha: f.fecha,
        cae: f.cae,
        moneda: f.moneda,
        cotizacion: f.cotizacion,
        iva: precioFinal
          ? [{ alicuotaIva: 3, base: aImporte(monto(f.total).minus(f.otrosTributos)) }]
          : f.alicuotas.map((a) => ({ alicuotaIva: a.alicuotaIva, base: a.base, importe: a.importe })),
        noGravado: precioFinal ? '0' : f.noGravado,
        exento: precioFinal ? '0' : f.exento,
        // ARCA no dice qué son los "otros tributos": quedan como tal para revisar.
        tributos: monto(f.otrosTributos).gt(0) ? [{ tipo: 'otro', importe: f.otrosTributos }] : [],
        observaciones: 'Registrado desde Mis Comprobantes de ARCA.',
      },
      'mis_comprobantes',
    )
    if (!r.ok) {
      errores.push(`Fila ${f.fila} (${f.nombre} ${f.puntoVenta}-${f.numero}): ${r.error}`)
      continue
    }
    // El total registrado tiene que ser el de ARCA.
    const [c] = await tx.select({ total: compras.total }).from(compras).where(eq(compras.id, r.id))
    if (monto(c.total).minus(f.total).abs().gt('0.05'))
      errores.push(`Fila ${f.fila}: se registró por ${aImporte(c.total)} y ARCA informa ${aImporte(f.total)}; revisalo.`)
    registrados++
  }
  return { registrados, errores }
}
