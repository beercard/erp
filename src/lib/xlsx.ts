import { XMLParser } from 'fast-xml-parser'

import { leerZip } from './zip'

/**
 * Lee la primera hoja de una planilla .xlsx como una tabla de textos. Las
 * celdas numéricas quedan con punto decimal; las fechas, como número de
 * serie de Excel (ver serialAFecha).
 */
export async function leerXlsx(datos: Uint8Array): Promise<string[][]> {
  const archivos = await leerZip(datos)
  const texto = (n: string) => (archivos.has(n) ? new TextDecoder().decode(archivos.get(n)) : null)
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (n) => ['si', 'r', 'row', 'c'].includes(n),
  })
  const comoTexto = (v: unknown): string => {
    if (v === undefined || v === null) return ''
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>
      if ('#text' in o) return String(o['#text'])
      if ('t' in o) return comoTexto(o.t)
      if ('r' in o) return (o.r as unknown[]).map((x) => comoTexto((x as Record<string, unknown>).t)).join('')
      return ''
    }
    return String(v)
  }
  const compartidos: string[] = []
  const ss = texto('xl/sharedStrings.xml')
  if (ss) for (const si of parser.parse(ss).sst?.si ?? []) compartidos.push(comoTexto(si))
  const nombreHoja = [...archivos.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0]
  if (!nombreHoja) throw new Error('La planilla no tiene hojas.')
  const hoja = parser.parse(texto(nombreHoja)!)
  const filas: string[][] = []
  for (const row of hoja.worksheet?.sheetData?.row ?? []) {
    const fila: string[] = []
    for (const c of row.c ?? []) {
      const col = columna(String(c.r ?? ''))
      const valor = c.t === 's' ? (compartidos[Number(c.v)] ?? '') : c.t === 'inlineStr' ? comoTexto(c.is) : comoTexto(c.v)
      fila[col >= 0 ? col : fila.length] = valor
    }
    filas.push(Array.from(fila, (v) => v ?? ''))
  }
  return filas
}

/** "AD12" → 29 */
function columna(ref: string): number {
  const letras = ref.match(/^[A-Z]+/)?.[0]
  if (!letras) return -1
  return [...letras].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0) - 1
}

/** Número de serie de Excel → "AAAA-MM-DD". */
export function serialAFecha(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000).toISOString().slice(0, 10)
}
