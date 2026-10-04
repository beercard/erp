import { createPrivateKey, generateKeyPairSync, X509Certificate } from 'node:crypto'

import { sql } from 'drizzle-orm'
import forge from 'node-forge'

import type { Transaccion } from '../../db/conexion'
import { arcaConfiguracion, empresas } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { cifrar, descifrar } from './certificado'

/**
 * Pedido de certificado de ARCA hecho por el sistema, para que el cliente no
 * tenga que instalar OpenSSL ni manejar la clave privada: acá se genera la
 * clave RSA de 2048 bits (queda cifrada con ERP_CLAVE_MAESTRA y nunca sale del
 * servidor) y el CSR que ARCA pide, con el sujeto que exige su manual:
 * C=AR, O=<razón social>, CN=<alias> y serialNumber="CUIT <11 dígitos>".
 * El cliente sube el CSR en ARCA (WSASS o Administración de Certificados
 * Digitales), descarga el .crt y lo carga acá sin la clave.
 */

/** ARCA no acepta cualquier carácter en el sujeto: sin tildes ni símbolos raros. */
const textoSujeto = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,&()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)

/** Genera la clave y el CSR (sin base). */
export function armarPedido(razonSocial: string, cuit: string, alias = 'erp') {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const clavePem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
  const clave = forge.pki.privateKeyFromPem(clavePem)
  const csr = forge.pki.createCertificationRequest()
  csr.publicKey = forge.pki.setRsaPublicKey(clave.n, clave.e)
  csr.setSubject([
    { name: 'countryName', value: 'AR' },
    { name: 'organizationName', value: textoSujeto(razonSocial) || 'Empresa' },
    { name: 'commonName', value: alias },
    { type: '2.5.4.5', value: `CUIT ${cuit.replace(/\D/g, '')}` },
  ])
  csr.sign(clave, forge.md.sha256.create())
  return { clavePem, csrPem: forge.pki.certificationRequestToPem(csr) }
}

/** Genera un pedido nuevo para la empresa de la transacción (reemplaza el anterior, si lo había). */
export async function generarPedido(tx: Transaccion, usuarioId: string | null) {
  const [e] = await tx
    .select({ razonSocial: empresas.razonSocial, cuit: empresas.cuit })
    .from(empresas)
    .where(sql`${empresas.id} = nullif(current_setting('app.empresa_id', true), '')::uuid`)
  if (!e) return { ok: false as const, error: 'No se encontró la empresa.' }
  const { clavePem, csrPem } = armarPedido(e.razonSocial, e.cuit)
  let clavePendienteCifrada: string
  try {
    clavePendienteCifrada = cifrar(clavePem)
  } catch (err) {
    return { ok: false as const, error: (err as Error).message }
  }
  const valores = { clavePendienteCifrada, pedidoCsr: csrPem, pedidoCreado: new Date() }
  await tx.insert(arcaConfiguracion).values(valores).onConflictDoUpdate({ target: arcaConfiguracion.empresaId, set: valores })
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'arca_pedido_certificado', despues: { cuit: e.cuit } })
  return { ok: true as const, csr: csrPem }
}

/**
 * La clave que corresponde a un certificado que se sube sin clave: la del
 * pedido generado acá o, si se renovó con el mismo pedido, la vigente.
 */
export function claveDelCertificado(
  certificadoPem: string,
  config: { clavePendienteCifrada: string | null; claveCifrada: string | null } | undefined,
): { clavePem: string; dePedido: boolean } | null {
  let x509: X509Certificate
  try {
    x509 = new X509Certificate(certificadoPem)
  } catch {
    return null
  }
  for (const [cifrada, dePedido] of [
    [config?.clavePendienteCifrada, true],
    [config?.claveCifrada, false],
  ] as const) {
    if (!cifrada) continue
    try {
      const clavePem = descifrar(cifrada)
      if (x509.checkPrivateKey(createPrivateKey(clavePem))) return { clavePem, dePedido }
    } catch {
      // Una clave que no se puede descifrar no corresponde: se sigue con la otra.
    }
  }
  return null
}
