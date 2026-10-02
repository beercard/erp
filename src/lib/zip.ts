/**
 * Lector mínimo de ZIP (sin dependencias): alcanza para los archivos que
 * descarga ARCA (un CSV dentro de un ZIP) y para leer planillas .xlsx, que
 * son ZIP con XML adentro. Soporta archivos guardados sin comprimir y con
 * deflate, que son los únicos que usan.
 */

async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  const flujo = new Blob([datos as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(flujo).arrayBuffer())
}

/** Archivos del ZIP: nombre → contenido. */
export async function leerZip(zip: Uint8Array): Promise<Map<string, Uint8Array>> {
  const vista = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  // Fin del directorio central: firma 0x06054b50, buscada desde el final.
  let fin = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (vista.getUint32(i, true) === 0x06054b50) {
      fin = i
      break
    }
  }
  if (fin < 0) throw new Error('El archivo no es un ZIP válido.')
  const cantidad = vista.getUint16(fin + 10, true)
  let pos = vista.getUint32(fin + 16, true)
  const archivos = new Map<string, Uint8Array>()
  const texto = new TextDecoder()
  for (let n = 0; n < cantidad; n++) {
    if (vista.getUint32(pos, true) !== 0x02014b50) throw new Error('ZIP dañado.')
    const metodo = vista.getUint16(pos + 10, true)
    const comprimido = vista.getUint32(pos + 20, true)
    const largoNombre = vista.getUint16(pos + 28, true)
    const largoExtra = vista.getUint16(pos + 30, true)
    const largoComentario = vista.getUint16(pos + 32, true)
    const local = vista.getUint32(pos + 42, true)
    const nombre = texto.decode(zip.subarray(pos + 46, pos + 46 + largoNombre))
    pos += 46 + largoNombre + largoExtra + largoComentario
    if (nombre.endsWith('/')) continue
    const inicio = local + 30 + vista.getUint16(local + 26, true) + vista.getUint16(local + 28, true)
    const datos = zip.subarray(inicio, inicio + comprimido)
    if (metodo === 0) archivos.set(nombre, datos)
    else if (metodo === 8) archivos.set(nombre, await inflar(datos))
    else throw new Error(`Compresión ${metodo} no soportada en ${nombre}.`)
  }
  return archivos
}

export const esZip = (datos: Uint8Array) => datos[0] === 0x50 && datos[1] === 0x4b && datos[2] === 0x03 && datos[3] === 0x04

// ------------------------------------------------------------------ Escritura

const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(datos: Uint8Array) {
  let c = 0xffffffff
  for (const b of datos) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Arma un .zip sin comprimir (alcanza para un .xlsx chico y no necesita dependencias). */
export function escribirZip(archivos: { nombre: string; datos: Uint8Array }[], fecha = new Date()): Uint8Array {
  // Fecha y hora en el formato de MS-DOS (las que muestra el explorador de archivos).
  const hora = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | Math.floor(fecha.getSeconds() / 2)
  const dia = ((fecha.getFullYear() - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate()
  const locales: Uint8Array[] = []
  const centrales: Uint8Array[] = []
  let desplazamiento = 0
  for (const a of archivos) {
    const nombre = new TextEncoder().encode(a.nombre)
    const crc = crc32(a.datos)
    const local = new Uint8Array(30 + nombre.length)
    const v = new DataView(local.buffer)
    v.setUint32(0, 0x04034b50, true)
    v.setUint16(4, 20, true)
    v.setUint16(6, 0x0800, true) // nombres en UTF-8
    v.setUint16(8, 0, true) // sin comprimir
    v.setUint16(10, hora, true)
    v.setUint16(12, dia, true)
    v.setUint32(14, crc, true)
    v.setUint32(18, a.datos.length, true)
    v.setUint32(22, a.datos.length, true)
    v.setUint16(26, nombre.length, true)
    local.set(nombre, 30)
    const central = new Uint8Array(46 + nombre.length)
    const w = new DataView(central.buffer)
    w.setUint32(0, 0x02014b50, true)
    w.setUint16(4, 20, true)
    w.setUint16(6, 20, true)
    w.setUint16(8, 0x0800, true)
    w.setUint16(10, 0, true)
    w.setUint16(12, hora, true)
    w.setUint16(14, dia, true)
    w.setUint32(16, crc, true)
    w.setUint32(20, a.datos.length, true)
    w.setUint32(24, a.datos.length, true)
    w.setUint16(28, nombre.length, true)
    w.setUint32(42, desplazamiento, true)
    central.set(nombre, 46)
    locales.push(local, a.datos)
    centrales.push(central)
    desplazamiento += local.length + a.datos.length
  }
  const tamCentral = centrales.reduce((s, c) => s + c.length, 0)
  const fin = new Uint8Array(22)
  const f = new DataView(fin.buffer)
  f.setUint32(0, 0x06054b50, true)
  f.setUint16(8, archivos.length, true)
  f.setUint16(10, archivos.length, true)
  f.setUint32(12, tamCentral, true)
  f.setUint32(16, desplazamiento, true)
  const todo = new Uint8Array(desplazamiento + tamCentral + 22)
  let p = 0
  for (const parte of [...locales, ...centrales, fin]) {
    todo.set(parte, p)
    p += parte.length
  }
  return todo
}
