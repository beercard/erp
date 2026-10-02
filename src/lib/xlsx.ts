import { XMLParser } from 'fast-xml-parser'

import { escribirZip, leerZip } from './zip'

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

// ------------------------------------------------------------------ Escritura

export type Celda = string | number | null | undefined
export type Hoja = { nombre: string; filas: Celda[][] }

const xml = (v: string) =>
  v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Caracteres de control que Excel no acepta.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

const letra = (n: number) => {
  let s = ''
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/**
 * Planilla .xlsx con una o más hojas: la primera fila va en negrita (los
 * títulos). Números como números; todo lo demás, como texto.
 */
export function escribirXlsx(hojas: Hoja[]): Uint8Array {
  const enc = (s: string) => new TextEncoder().encode(s)
  const nombres = hojas.map((h, i) => h.nombre.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Hoja ${i + 1}`)
  const archivos = [
    {
      nombre: '[Content_Types].xml',
      datos: enc(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
      ),
    },
    {
      nombre: '_rels/.rels',
      datos: enc(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      nombre: 'xl/workbook.xml',
      datos: enc(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
      ),
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      datos: enc(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    {
      nombre: 'xl/styles.xml',
      datos: enc(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`,
      ),
    },
    ...hojas.map((h, i) => ({
      nombre: `xl/worksheets/sheet${i + 1}.xml`,
      datos: enc(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${h.filas
          .map(
            (fila, r) =>
              `<row r="${r + 1}">${fila
                .map((v, c) => {
                  if (v === null || v === undefined || v === '') return ''
                  const ref = `${letra(c)}${r + 1}`
                  const estilo = r === 0 ? ' s="1"' : ''
                  return typeof v === 'number' && Number.isFinite(v)
                    ? `<c r="${ref}"${estilo}><v>${v}</v></c>`
                    : `<c r="${ref}" t="inlineStr"${estilo}><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`
                })
                .join('')}</row>`,
          )
          .join('')}</sheetData></worksheet>`,
      ),
    })),
  ]
  return escribirZip(archivos)
}

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
