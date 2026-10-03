import { createHash } from 'node:crypto'

import { and, asc, eq, gte, inArray, lte, ne } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import {
  compras,
  comprasIva,
  comprasTributos,
  comprobantes,
  comprobantesIva,
  comprobantesTributos,
  terceros,
} from '../../db/schema'

/**
 * Libro IVA Digital (RG 4597): los cuatro archivos que se importan en el
 * Portal IVA de ARCA.
 *
 *   Ventas:  comprobantes (266 caracteres por línea) y alícuotas (62)
 *   Compras: comprobantes (325) y alícuotas (84)
 *
 * Campos de ancho fijo: los números van rellenos con ceros a la izquierda y
 * sin separador decimal (13 enteros y 2 decimales); los textos, con espacios
 * a la derecha y sin acentos. Los importes van en la moneda del comprobante,
 * con su tipo de cambio (4 enteros y 6 decimales). Las líneas terminan en
 * CRLF.
 */

export const LARGOS = { ventasCbte: 266, ventasAlicuotas: 62, comprasCbte: 325, comprasAlicuotas: 84 } as const

/** Primer y último día del período "AAAA-MM". */
export function limitesPeriodo(periodo: string) {
  const [a, m] = periodo.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(ultimo).padStart(2, '0')}` }
}

// ---------------------------------------------------------------- Formato

/** Texto sin acentos ni caracteres raros, recortado y relleno a la derecha. */
export function texto(v: string | null | undefined, largo: number) {
  const limpio = (v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
  return limpio.slice(0, largo).padEnd(largo, ' ')
}

/** Número entero relleno con ceros (los no numéricos se descartan). */
export function entero(v: string | number | null | undefined, largo: number) {
  const s = String(v ?? '').replace(/\D/g, '')
  return s.slice(-largo).padStart(largo, '0')
}

/** Importe con 2 decimales implícitos: 1234,5 → "000000000123450". Los negativos llevan el signo adelante. */
export function importe(v: string | number | null | undefined, largo = 15) {
  const n = Math.round(Number(v ?? 0) * 100)
  if (!Number.isFinite(n)) return '0'.repeat(largo)
  const s = String(Math.abs(n)).padStart(largo, '0')
  return n < 0 ? `-${s.slice(-(largo - 1))}` : s.slice(-largo)
}

/** Tipo de cambio: 4 enteros y 6 decimales. */
export const tipoCambio = (v: string | number) => entero(Math.round(Number(v) * 1_000_000), 10)

const fecha = (iso: string | null | undefined) => (iso ? iso.replace(/-/g, '') : '00000000')

/** Código de alícuota de ARCA en 4 dígitos. */
const alicuota = (codigo: number) => entero(codigo, 4)

// ---------------------------------------------------------------- Clasificación de tributos

/**
 * Códigos de tributo de ARCA (los del WSFE) agrupados como los pide el
 * libro de ventas.
 */
const TRIBUTOS_VENTAS = {
  nacionales: [1, 6, 9],
  iibb: [2, 5, 7],
  municipales: [3, 8],
  internos: [4],
  noCategorizados: [13],
} as const

/** Código de operación del libro: " " normal; "E" exenta; "N" no gravada; "X" exportación. */
function codigoOperacion(c: { letra: string; tipo: number; neto: string; iva: string; exento: string; noGravado: string }) {
  if (c.letra === 'E' || [19, 20, 21].includes(c.tipo)) return 'X'
  if (Number(c.neto) === 0 && Number(c.iva) === 0) {
    if (Number(c.exento) > 0) return 'E'
    if (Number(c.noGravado) > 0) return 'N'
  }
  return ' '
}

/** Comprobantes que discriminan IVA (llevan alícuotas en el libro). */
const discrimina = (letra: string) => letra === 'A' || letra === 'M'

// ---------------------------------------------------------------- Ventas

export type LineasLibro = { cbte: string[]; alicuotas: string[] }

/** Un renglón del subdiario (en pesos; las notas de crédito, en negativo). */
export type FilaSubdiario = {
  fecha: string
  comprobante: string
  tercero: string
  documento: string
  neto: number
  noGravado: number
  exento: number
  iva: number
  percepciones: number
  total: number
}
export type Advertencia = { comprobante: string; problema: string }

export type ResumenLibro = {
  cantidad: number
  neto: number
  iva: number
  exento: number
  noGravado: number
  percepciones: number
  total: number
  porAlicuota: Record<string, { base: number; iva: number }>
}

const vacioResumen = (): ResumenLibro => ({
  cantidad: 0,
  neto: 0,
  iva: 0,
  exento: 0,
  noGravado: 0,
  percepciones: 0,
  total: 0,
  porAlicuota: {},
})

const PORCENTAJE: Record<number, string> = { 3: '0', 4: '10,5', 5: '21', 6: '27', 8: '5', 9: '2,5' }

/**
 * Suma al resumen en pesos (importe × tipo de cambio). Las notas de crédito
 * restan.
 */
function acumular(
  r: ResumenLibro,
  signo: number,
  cot: number,
  c: { neto: string; iva: string; exento: string; noGravado: string; tributos: string; total: string },
  ivas: { alicuotaIva: number; base: string; importe: string }[],
) {
  const p = (v: string) => Math.round(Number(v) * cot * signo * 100) / 100
  r.cantidad++
  r.neto += p(c.neto)
  r.iva += p(c.iva)
  r.exento += p(c.exento)
  r.noGravado += p(c.noGravado)
  r.percepciones += p(c.tributos)
  r.total += p(c.total)
  for (const i of ivas) {
    const k = PORCENTAJE[i.alicuotaIva] ?? String(i.alicuotaIva)
    r.porAlicuota[k] ??= { base: 0, iva: 0 }
    r.porAlicuota[k].base += p(i.base)
    r.porAlicuota[k].iva += p(i.importe)
  }
}

const redondear = (r: ResumenLibro): ResumenLibro => {
  const d = (n: number) => Math.round(n * 100) / 100
  return {
    ...r,
    neto: d(r.neto),
    iva: d(r.iva),
    exento: d(r.exento),
    noGravado: d(r.noGravado),
    percepciones: d(r.percepciones),
    total: d(r.total),
    porAlicuota: Object.fromEntries(Object.entries(r.porAlicuota).map(([k, v]) => [k, { base: d(v.base), iva: d(v.iva) }])),
  }
}

const ABREVIATURA: Record<string, string> = { factura: 'FC', nota_debito: 'ND', nota_credito: 'NC' }

function fila(
  c: {
    fecha: string
    clase: string
    letra: string
    puntoVenta: number
    numero: number | null
    cotizacion: string
    neto: string
    noGravado: string
    exento: string
    iva: string
    tributos: string
    total: string
  },
  signo: number,
  tercero: string,
  documento: string,
): FilaSubdiario {
  const p = (v: string) => Math.round(Number(v) * Number(c.cotizacion) * signo * 100) / 100
  return {
    fecha: c.fecha,
    comprobante: `${ABREVIATURA[c.clase] ?? ''} ${nombreCbte(c)}`,
    tercero,
    documento,
    neto: p(c.neto),
    noGravado: p(c.noGravado),
    exento: p(c.exento),
    iva: p(c.iva),
    percepciones: p(c.tributos),
    total: p(c.total),
  }
}

const nombreCbte = (c: { letra: string; puntoVenta: number; numero: number | null }) =>
  `${c.letra} ${String(c.puntoVenta).padStart(5, '0')}-${String(c.numero ?? 0).padStart(8, '0')}`

export async function libroVentas(tx: Transaccion, periodo: string) {
  const { desde, hasta } = limitesPeriodo(periodo)
  const lista = await tx
    .select()
    .from(comprobantes)
    .where(
      and(
        eq(comprobantes.estado, 'autorizado'),
        ne(comprobantes.letra, 'X'),
        gte(comprobantes.fecha, desde),
        lte(comprobantes.fecha, hasta),
      ),
    )
    .orderBy(asc(comprobantes.fecha), asc(comprobantes.tipo), asc(comprobantes.puntoVenta), asc(comprobantes.numero))
  const ids = lista.map((c) => c.id)
  const [ivas, tributos, clientes] = await Promise.all([
    ids.length ? tx.select().from(comprobantesIva).where(inArray(comprobantesIva.comprobanteId, ids)) : [],
    ids.length ? tx.select().from(comprobantesTributos).where(inArray(comprobantesTributos.comprobanteId, ids)) : [],
    tx
      .select({
        id: terceros.id,
        tipoDocumento: terceros.tipoDocumento,
        numeroDocumento: terceros.numeroDocumento,
        razonSocial: terceros.razonSocial,
      })
      .from(terceros)
      .where(lista.length ? inArray(terceros.id, [...new Set(lista.map((c) => c.terceroId))]) : undefined),
  ])
  const lineas: LineasLibro = { cbte: [], alicuotas: [] }
  const advertencias: Advertencia[] = []
  const resumen = vacioResumen()
  const filas: FilaSubdiario[] = []
  for (const c of lista) {
    const cliente = clientes.find((x) => x.id === c.terceroId)
    const docTipo = c.receptorDocTipo ?? cliente?.tipoDocumento ?? 99
    const docNumero = c.receptorDocNumero ?? cliente?.numeroDocumento ?? '0'
    const nombre = c.receptorNombre ?? cliente?.razonSocial ?? ''
    if (c.letra === 'A' && docTipo !== 80)
      advertencias.push({ comprobante: nombreCbte(c), problema: 'Factura A a un cliente sin CUIT.' })
    let delCbte = ivas.filter((i) => i.comprobanteId === c.id).sort((x, y) => x.alicuotaIva - y.alicuotaIva)
    // A y B informan alícuotas; si no tiene IVA (exento), una de 0 % en cero.
    const informaAlicuotas = c.letra === 'A' || c.letra === 'B' || c.letra === 'M'
    if (informaAlicuotas && !delCbte.length)
      delCbte = [{ id: '', empresaId: '', comprobanteId: c.id, alicuotaIva: 3, base: '0', importe: '0' }]
    const tr = tributos.filter((t) => t.comprobanteId === c.id)
    const suma = (codigos: readonly number[]) =>
      tr.filter((t) => codigos.includes(t.tributo)).reduce((s, t) => s + Number(t.importe), 0)
    const conocidos = Object.values(TRIBUTOS_VENTAS).flat() as number[]
    const otros = tr.filter((t) => !conocidos.includes(t.tributo)).reduce((s, t) => s + Number(t.importe), 0)
    const linea =
      fecha(c.fecha) +
      entero(c.tipo, 3) +
      entero(c.puntoVenta, 5) +
      entero(c.numero, 20) +
      entero(c.numero, 20) +
      entero(docTipo, 2) +
      entero(docTipo === 99 ? 0 : docNumero, 20) +
      texto(docTipo === 99 && !nombre ? 'CONSUMIDOR FINAL' : nombre, 30) +
      importe(c.total) +
      importe(c.noGravado) +
      importe(suma(TRIBUTOS_VENTAS.noCategorizados)) +
      importe(c.exento) +
      importe(suma(TRIBUTOS_VENTAS.nacionales)) +
      importe(suma(TRIBUTOS_VENTAS.iibb)) +
      importe(suma(TRIBUTOS_VENTAS.municipales)) +
      importe(suma(TRIBUTOS_VENTAS.internos)) +
      texto(c.moneda, 3) +
      tipoCambio(c.cotizacion) +
      String(informaAlicuotas ? delCbte.length : 0) +
      codigoOperacion(c) +
      importe(otros) +
      (c.concepto === 1 ? '00000000' : fecha(c.vencimiento))
    lineas.cbte.push(linea)
    if (informaAlicuotas)
      for (const i of delCbte)
        lineas.alicuotas.push(
          entero(c.tipo, 3) +
            entero(c.puntoVenta, 5) +
            entero(c.numero, 20) +
            importe(i.base) +
            alicuota(i.alicuotaIva) +
            importe(i.importe),
        )
    acumular(resumen, c.clase === 'nota_credito' ? -1 : 1, Number(c.cotizacion), c, delCbte)
    filas.push(
      fila(c, c.clase === 'nota_credito' ? -1 : 1, nombre, `${docTipo === 80 ? 'CUIT ' : ''}${docTipo === 99 ? '' : docNumero}`),
    )
  }
  return { lineas, advertencias, resumen: redondear(resumen), filas }
}

// ---------------------------------------------------------------- Compras

const TRIBUTOS_COMPRAS = {
  iva: ['percepcion_iva'],
  nacionales: ['percepcion_ganancias'],
  iibb: ['percepcion_iibb'],
  municipales: ['impuesto_municipal'],
  internos: ['impuestos_internos'],
} as const

export async function libroCompras(tx: Transaccion, periodo: string) {
  const lista = await tx
    .select()
    .from(compras)
    .where(and(eq(compras.estado, 'registrado'), ne(compras.letra, 'X'), eq(compras.periodoIva, periodo)))
    .orderBy(asc(compras.fecha), asc(compras.tipo), asc(compras.puntoVenta), asc(compras.numero))
  const ids = lista.map((c) => c.id)
  const [ivas, tributos, proveedores] = await Promise.all([
    ids.length ? tx.select().from(comprasIva).where(inArray(comprasIva.compraId, ids)) : [],
    ids.length ? tx.select().from(comprasTributos).where(inArray(comprasTributos.compraId, ids)) : [],
    tx
      .select({
        id: terceros.id,
        tipoDocumento: terceros.tipoDocumento,
        numeroDocumento: terceros.numeroDocumento,
        razonSocial: terceros.razonSocial,
      })
      .from(terceros)
      .where(lista.length ? inArray(terceros.id, [...new Set(lista.map((c) => c.terceroId))]) : undefined),
  ])
  const lineas: LineasLibro = { cbte: [], alicuotas: [] }
  const advertencias: Advertencia[] = []
  const resumen = vacioResumen()
  const filas: FilaSubdiario[] = []
  for (const c of lista) {
    const p = proveedores.find((x) => x.id === c.terceroId)
    const docTipo = p?.tipoDocumento ?? 80
    const docNumero = p?.numeroDocumento ?? ''
    if (!docNumero || docTipo !== 80)
      advertencias.push({
        comprobante: `${p?.razonSocial ?? ''} ${nombreCbte(c)}`,
        problema: 'El proveedor no tiene CUIT cargado.',
      })
    let delCbte = discrimina(c.letra) ? ivas.filter((i) => i.compraId === c.id).sort((x, y) => x.alicuotaIva - y.alicuotaIva) : []
    if (discrimina(c.letra) && !delCbte.length)
      delCbte = [{ id: '', empresaId: '', compraId: c.id, alicuotaIva: 3, base: '0', importe: '0' }]
    const tr = tributos.filter((t) => t.compraId === c.id)
    const suma = (tipos: readonly string[]) => tr.filter((t) => tipos.includes(t.tipo)).reduce((s, t) => s + Number(t.importe), 0)
    const otros = tr.filter((t) => t.tipo === 'otro').reduce((s, t) => s + Number(t.importe), 0)
    const credito = discrimina(c.letra) ? c.iva : '0'
    const linea =
      fecha(c.fecha) +
      entero(c.tipo, 3) +
      entero(c.puntoVenta, 5) +
      entero(c.numero, 20) +
      ' '.repeat(16) +
      entero(docTipo, 2) +
      entero(docNumero, 20) +
      texto(p?.razonSocial, 30) +
      importe(c.total) +
      importe(c.noGravado) +
      importe(c.exento) +
      importe(suma(TRIBUTOS_COMPRAS.iva)) +
      importe(suma(TRIBUTOS_COMPRAS.nacionales)) +
      importe(suma(TRIBUTOS_COMPRAS.iibb)) +
      importe(suma(TRIBUTOS_COMPRAS.municipales)) +
      importe(suma(TRIBUTOS_COMPRAS.internos)) +
      texto(c.moneda, 3) +
      tipoCambio(c.cotizacion) +
      String(delCbte.length) +
      codigoOperacion({ ...c, neto: c.neto, iva: c.iva }) +
      importe(credito) +
      importe(otros) +
      entero(0, 11) +
      texto('', 30) +
      importe(0)
    lineas.cbte.push(linea)
    for (const i of delCbte)
      lineas.alicuotas.push(
        entero(c.tipo, 3) +
          entero(c.puntoVenta, 5) +
          entero(c.numero, 20) +
          entero(docTipo, 2) +
          entero(docNumero, 20) +
          importe(i.base) +
          alicuota(i.alicuotaIva) +
          importe(i.importe),
      )
    acumular(resumen, c.clase === 'nota_credito' ? -1 : 1, Number(c.cotizacion), { ...c, iva: credito }, delCbte)
    filas.push(
      fila(
        { ...c, iva: credito },
        c.clase === 'nota_credito' ? -1 : 1,
        p?.razonSocial ?? '',
        docNumero ? `CUIT ${docNumero}` : '',
      ),
    )
  }
  return { lineas, advertencias, resumen: redondear(resumen), filas }
}

// ---------------------------------------------------------------- Archivos

export const NOMBRES_LIBRO = (periodo: string) => {
  const p = periodo.replace('-', '')
  return {
    ventasCbte: `LIBRO_IVA_DIGITAL_VENTAS_CBTE_${p}.txt`,
    ventasAlicuotas: `LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS_${p}.txt`,
    comprasCbte: `LIBRO_IVA_DIGITAL_COMPRAS_CBTE_${p}.txt`,
    comprasAlicuotas: `LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS_${p}.txt`,
  }
}

/** Texto del archivo: líneas con CRLF, en ASCII (los acentos ya se sacaron). */
export const archivoTxt = (lineas: string[]) => new TextEncoder().encode(lineas.map((l) => `${l}\r\n`).join(''))

export async function libroIva(tx: Transaccion, periodo: string) {
  const [ventas, comprasLibro] = await Promise.all([libroVentas(tx, periodo), libroCompras(tx, periodo)])
  const nombres = NOMBRES_LIBRO(periodo)
  return {
    ventas,
    compras: comprasLibro,
    archivos: [
      { nombre: nombres.ventasCbte, datos: archivoTxt(ventas.lineas.cbte) },
      { nombre: nombres.ventasAlicuotas, datos: archivoTxt(ventas.lineas.alicuotas) },
      { nombre: nombres.comprasCbte, datos: archivoTxt(comprasLibro.lineas.cbte) },
      { nombre: nombres.comprasAlicuotas, datos: archivoTxt(comprasLibro.lineas.alicuotas) },
    ],
  }
}

/** Huella del contenido de los archivos (para saber si cambió algo desde que se bajó). */
export const huella = (archivos: { nombre: string; datos: Uint8Array }[]) => {
  const h = createHash('sha256')
  for (const a of archivos) h.update(a.nombre).update(a.datos)
  return h.digest('hex')
}
