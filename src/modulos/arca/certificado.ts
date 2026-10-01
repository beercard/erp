import { createCipheriv, createDecipheriv, createHash, createPrivateKey, randomBytes, X509Certificate } from 'node:crypto'

/**
 * Certificado de ARCA y su clave privada. La clave se guarda cifrada
 * (AES-256-GCM) con ERP_CLAVE_MAESTRA, una variable del servidor que nunca
 * está en la base: con un volcado de la base solo no se puede facturar en
 * nombre de la empresa.
 */

function claveMaestra(): Buffer {
  const secreto = process.env.ERP_CLAVE_MAESTRA
  if (!secreto || secreto.length < 32) {
    throw new Error('Falta ERP_CLAVE_MAESTRA en el servidor (al menos 32 caracteres): sin ella no se guardan claves de ARCA.')
  }
  return createHash('sha256').update(secreto).digest()
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', claveMaestra(), iv)
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), datos.toString('base64')].join(':')
}

export function descifrar(guardado: string): string {
  const [version, iv, etiqueta, datos] = guardado.split(':')
  if (version !== 'v1') throw new Error('Formato de clave cifrada desconocido.')
  const d = createDecipheriv('aes-256-gcm', claveMaestra(), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(etiqueta, 'base64'))
  return Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8')
}

export type DatosCertificado = { cuit: string | null; vence: Date; emisor: string; titular: string }

/**
 * Valida el par certificado/clave antes de guardarlo: que sean PEM, que la
 * clave corresponda al certificado y que no esté vencido.
 */
export function revisarCertificado(
  certificadoPem: string,
  clavePem: string,
  ahora: Date = new Date(),
): { ok: true; datos: DatosCertificado } | { ok: false; error: string } {
  let x509: X509Certificate
  try {
    x509 = new X509Certificate(certificadoPem)
  } catch {
    return { ok: false, error: 'El certificado no es válido. Tiene que ser el archivo .crt (o .pem) que descargaste de ARCA.' }
  }
  let clave
  try {
    clave = createPrivateKey(clavePem)
  } catch {
    return { ok: false, error: 'La clave privada no es válida. Tiene que ser el archivo .key con el que pediste el certificado.' }
  }
  if (!x509.checkPrivateKey(clave)) {
    return { ok: false, error: 'La clave privada no corresponde a este certificado.' }
  }
  const vence = new Date(x509.validTo)
  if (vence <= ahora) return { ok: false, error: `El certificado venció el ${vence.toLocaleDateString('es-AR')}.` }
  const cuit = /CUIT\s*(\d{11})/.exec(x509.subject)?.[1] ?? null
  return {
    ok: true,
    datos: { cuit, vence, emisor: x509.issuer.replace(/\n/g, ', '), titular: x509.subject.replace(/\n/g, ', ') },
  }
}
