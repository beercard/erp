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
