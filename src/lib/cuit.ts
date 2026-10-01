/**
 * CUIT y CUIL: 11 dígitos, el último es verificador (módulo 11 con pesos
 * 5-4-3-2-7-6-5-4-3-2). Se guardan sin guiones y se muestran como
 * 20-12345678-6.
 */

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

export function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/** Dígito verificador que corresponde a los primeros 10 dígitos, o null si no hay ninguno válido. */
export function digitoVerificador(diezDigitos: string): number | null {
  const suma = PESOS.reduce((acc, peso, i) => acc + peso * Number(diezDigitos[i]), 0)
  const resto = 11 - (suma % 11)
  if (resto === 11) return 0
  if (resto === 10) return null
  return resto
}

export type ResultadoCuit = { valido: true; cuit: string } | { valido: false; error: string }

export function validarCuit(valor: string): ResultadoCuit {
  const cuit = soloDigitos(valor)
  if (cuit.length !== 11) {
    return { valido: false, error: `El CUIT tiene que tener 11 dígitos y tiene ${cuit.length}.` }
  }
  if (!/^(20|23|24|25|26|27|30|33|34)/.test(cuit)) {
    return { valido: false, error: `El CUIT no puede empezar con ${cuit.slice(0, 2)}.` }
  }
  const esperado = digitoVerificador(cuit.slice(0, 10))
  if (esperado === null) {
    return { valido: false, error: 'Ese CUIT no puede existir: ninguna terminación lo hace válido.' }
  }
  if (Number(cuit[10]) !== esperado) {
    return {
      valido: false,
      error: `El CUIT ${formatearCuit(cuit)} no es válido: el último dígito debería ser ${esperado}.`,
    }
  }
  return { valido: true, cuit }
}

export function formatearCuit(valor: string): string {
  const d = soloDigitos(valor)
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : valor
}
