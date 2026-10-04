import { leerCsv } from './csv'
import { leerXlsx } from './xlsx'

/** Registros de la primera hoja: { columna: valor } con la primera fila como cabecera. */
export function registrosDeFilas(filas: string[][]): Record<string, string>[] {
  const [cabecera, ...resto] = filas
  if (!cabecera) return []
  return resto
    .filter((f) => f.some((c) => String(c ?? '').trim()))
    .map((f) => Object.fromEntries(cabecera.map((n, i) => [n, String(f[i] ?? '')])))
}

/**
 * Lee una planilla subida (.xlsx o .csv con ; , o tabulación) como registros.
 * Con topes: 5 MB y 2.000 filas.
 */
export async function leerPlanillaSubida(
  archivo: FormDataEntryValue | null,
): Promise<{ ok: true; nombre: string; registros: Record<string, string>[] } | { ok: false; error: string }> {
  if (!(archivo instanceof File) || !archivo.size) return { ok: false, error: 'Elegí la planilla (.xlsx o .csv).' }
  if (archivo.size > 5 * 1024 * 1024) return { ok: false, error: 'La planilla pesa más de 5 MB.' }
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  let registros: Record<string, string>[]
  try {
    if (/\.xlsx$/i.test(archivo.name)) registros = registrosDeFilas(await leerXlsx(bytes))
    else {
      const texto = new TextDecoder().decode(bytes)
      const primera = texto.split(/\r?\n/, 1)[0] ?? ''
      registros = leerCsv(texto, primera.includes(';') ? ';' : primera.includes('\t') ? '\t' : ',')
    }
  } catch {
    return { ok: false, error: 'No se pudo leer la planilla: guardala como .xlsx o .csv y probá de nuevo.' }
  }
  if (!registros.length)
    return { ok: false, error: 'La planilla no tiene filas (la primera fila son los títulos de las columnas).' }
  if (registros.length > 2000) return { ok: false, error: 'Van hasta 2.000 filas por planilla: partila en varias.' }
  return { ok: true, nombre: archivo.name, registros }
}
