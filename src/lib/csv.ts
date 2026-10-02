/**
 * Lector de CSV (RFC 4180): comillas dobles, comillas escapadas ("") y saltos
 * de línea dentro de un campo entre comillas. Lo usan las importaciones; un
 * nombre de cliente con un Enter adentro no puede partir el registro.
 */
export function leerCsv(texto: string, separador = ','): Record<string, string>[] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let entreComillas = false
  const t = texto.replace(/^﻿/, '')

  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (entreComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"'
          i++
        } else entreComillas = false
      } else campo += c
    } else if (c === '"') entreComillas = true
    else if (c === separador) {
      fila.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      fila.push(campo)
      if (fila.length > 1 || fila[0] !== '') filas.push(fila)
      fila = []
      campo = ''
    } else campo += c
  }
  if (campo !== '' || fila.length) {
    fila.push(campo)
    filas.push(fila)
  }
  const [cabecera, ...resto] = filas
  if (!cabecera) return []
  return resto.map((f) => Object.fromEntries(cabecera.map((nombre, i) => [nombre, f[i] ?? ''])))
}
