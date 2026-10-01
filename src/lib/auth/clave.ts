import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

/**
 * Contraseñas con scrypt (viene con Node, no hay dependencias nativas).
 * Formato guardado: "scrypt$N$r$p$sal$hash" en base64url, así se pueden
 * subir los parámetros más adelante sin invalidar las claves viejas.
 */
const N = 2 ** 15
const R = 8
const P = 1
const LARGO = 64

function derivar(clave: string, sal: Buffer, opciones: ScryptOptions): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    scrypt(clave.normalize('NFKC'), sal, LARGO, { ...opciones, maxmem: 128 * N * R * 2 }, (error, clave) =>
      error ? rechazar(error) : resolver(clave),
    )
  })
}

export async function hashearClave(clave: string): Promise<string> {
  const sal = randomBytes(16)
  const hash = await derivar(clave, sal, { N, r: R, p: P })
  return ['scrypt', N, R, P, sal.toString('base64url'), hash.toString('base64url')].join('$')
}

export async function verificarClave(clave: string, guardado: string): Promise<boolean> {
  const [algoritmo, n, r, p, sal, hash] = guardado.split('$')
  if (algoritmo !== 'scrypt' || !sal || !hash) return false
  const esperado = Buffer.from(hash, 'base64url')
  const calculado = await derivar(clave, Buffer.from(sal, 'base64url'), { N: Number(n), r: Number(r), p: Number(p) })
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado)
}

/** Reglas mínimas, con el mensaje que ve el usuario. */
export function problemaDeClave(clave: string): string | null {
  if (clave.length < 10) return 'La contraseña tiene que tener al menos 10 caracteres.'
  if (!/[a-zA-Z]/.test(clave) || !/\d/.test(clave)) return 'La contraseña tiene que tener letras y números.'
  return null
}
