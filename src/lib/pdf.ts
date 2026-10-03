/**
 * PDF de texto, sin dependencias: páginas A4 con texto en Helvetica (normal y
 * negrita), alineado a izquierda o derecha, y líneas. Alcanza para reportes
 * como el cierre de caja; no maneja imágenes ni fuentes propias.
 */

const ANCHO = 595.28
const ALTO = 841.89

// Anchos de Helvetica (1/1000 de punto) para los caracteres 32 a 126.
const ANCHOS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778,
  722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

/** Caracteres fuera de Latin-1 que sí tiene WinAnsi. */
const WIN: Record<string, number> = {
  '—': 0x97,
  '–': 0x96,
  '•': 0x95,
  '…': 0x85,
  '“': 0x93,
  '”': 0x94,
  '‘': 0x91,
  '’': 0x92,
  '€': 0x80,
}

function codigos(s: string): number[] {
  return [...s].map((c) => {
    if (WIN[c]) return WIN[c]
    const n = c.charCodeAt(0)
    return n >= 32 && n <= 255 && !(n >= 127 && n < 160) ? n : 63
  })
}

/** Ancho de un texto en puntos. */
export function anchoTexto(s: string, tam: number, negrita = false) {
  const base = codigos(s).reduce((t, n) => t + (n >= 32 && n <= 126 ? ANCHOS[n - 32] : 556), 0)
  return (base * tam * (negrita ? 1.04 : 1)) / 1000
}

const literal = (s: string) =>
  codigos(s)
    .map((n) =>
      n === 40 || n === 41 || n === 92
        ? `\\${String.fromCharCode(n)}`
        : n > 126
          ? `\\${n.toString(8).padStart(3, '0')}`
          : String.fromCharCode(n),
    )
    .join('')

export type OpcionesTexto = { tam?: number; negrita?: boolean; derecha?: boolean; gris?: boolean }

export class DocumentoPdf {
  readonly ancho = ANCHO
  readonly alto = ALTO
  private paginas: string[][] = []

  constructor() {
    this.nuevaPagina()
  }

  nuevaPagina() {
    this.paginas.push([])
  }

  private get actual() {
    return this.paginas[this.paginas.length - 1]
  }

  /** Texto en (x, y) medido desde arriba a la izquierda. Con derecha, x es el borde derecho. */
  texto(x: number, y: number, s: string, o: OpcionesTexto = {}) {
    const tam = o.tam ?? 10
    const px = o.derecha ? x - anchoTexto(s, tam, o.negrita) : x
    const color = o.gris ? '0.42 0.45 0.5 rg ' : '0 0 0 rg '
    this.actual.push(
      `BT ${color}/${o.negrita ? 'F2' : 'F1'} ${tam} Tf ${px.toFixed(2)} ${(ALTO - y).toFixed(2)} Td (${literal(s)}) Tj ET`,
    )
  }

  linea(x1: number, y: number, x2: number, grosor = 0.5) {
    this.actual.push(
      `0.8 0.82 0.85 RG ${grosor} w ${x1.toFixed(2)} ${(ALTO - y).toFixed(2)} m ${x2.toFixed(2)} ${(ALTO - y).toFixed(2)} l S`,
    )
  }

  bytes(): Uint8Array {
    const objetos: string[] = []
    const n = this.paginas.length
    // 1 catálogo, 2 páginas, 3 y 4 fuentes, después página y contenido de cada una.
    objetos.push('<< /Type /Catalog /Pages 2 0 R >>')
    const kids = this.paginas.map((_, i) => `${5 + i * 2} 0 R`).join(' ')
    objetos.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`)
    objetos.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    objetos.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    for (let i = 0; i < n; i++) {
      const contenido = this.paginas[i].join('\n')
      objetos.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO} ${ALTO}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`,
      )
      objetos.push(`<< /Length ${Buffer.byteLength(contenido, 'latin1')} >>\nstream\n${contenido}\nendstream`)
    }
    let salida = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
    const posiciones: number[] = []
    objetos.forEach((o, i) => {
      posiciones.push(Buffer.byteLength(salida, 'latin1'))
      salida += `${i + 1} 0 obj\n${o}\nendobj\n`
    })
    const xref = Buffer.byteLength(salida, 'latin1')
    salida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`
    salida += posiciones.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')
    salida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    return new Uint8Array(Buffer.from(salida, 'latin1'))
  }
}
