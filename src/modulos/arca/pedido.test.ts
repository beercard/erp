import forge from 'node-forge'
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { arcaConfiguracion, empresas } from '../../db/schema'
import { descifrar } from './certificado'
import { armarPedido, claveDelCertificado, generarPedido } from './pedido'

process.env.ERP_CLAVE_MAESTRA ??= 'clave-maestra-solo-para-pruebas-000000000000'

/** Lo que haría ARCA: firmar un certificado para el CSR (acá, con una CA de mentira). */
function emitirComoArca(csrPem: string) {
  const csr = forge.pki.certificationRequestFromPem(csrPem)
  const ca = forge.pki.rsa.generateKeyPair(1024)
  const cert = forge.pki.createCertificate()
  cert.publicKey = csr.publicKey!
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date(Date.now() - 86_400_000)
  cert.validity.notAfter = new Date(Date.now() + 730 * 86_400_000)
  cert.setSubject(csr.subject.attributes)
  cert.setIssuer([{ name: 'commonName', value: 'AC de prueba' }])
  cert.sign(ca.privateKey, forge.md.sha256.create())
  return forge.pki.certificateToPem(cert)
}

describe('pedido de certificado de ARCA', () => {
  it('arma un CSR firmado con el sujeto que pide ARCA', () => {
    const { clavePem, csrPem } = armarPedido('Construcciones Ñandú & Cía. S.R.L.', '30-71955290-7')
    expect(clavePem).toContain('BEGIN RSA PRIVATE KEY')
    const csr = forge.pki.certificationRequestFromPem(csrPem)
    expect(csr.verify()).toBe(true)
    const campo = (k: string) => csr.subject.attributes.find((a) => a.name === k || a.type === k)?.value
    expect(campo('countryName')).toBe('AR')
    expect(campo('organizationName')).toBe('Construcciones Nandu & Cia. S.R.L.')
    expect(campo('commonName')).toBe('erp')
    expect(campo('2.5.4.5')).toBe('CUIT 30719552907')
    expect((csr.publicKey as forge.pki.rsa.PublicKey).n.bitLength()).toBe(2048)
  })

  it('guarda la clave cifrada y reconoce el certificado que devuelve ARCA sin pedir la clave', async () => {
    const db = await baseDePrueba()
    const [e] = await db.insert(empresas).values({ razonSocial: 'Alfa S.A.', cuit: '30111111118', condicionIva: 1 }).returning()
    const r = await conEmpresa(e.id, (tx) => generarPedido(tx, null))
    expect(r.ok).toBe(true)
    const [config] = await conEmpresa(e.id, (tx) => tx.select().from(arcaConfiguracion))
    expect(config.clavePendienteCifrada).not.toContain('PRIVATE KEY')
    expect(descifrar(config.clavePendienteCifrada!)).toContain('PRIVATE KEY')

    const crt = emitirComoArca(config.pedidoCsr!)
    const clave = claveDelCertificado(crt, config)
    expect(clave?.dePedido).toBe(true)
    expect(clave?.clavePem).toBe(descifrar(config.clavePendienteCifrada!))

    // Un certificado de otro pedido no corresponde.
    const otro = emitirComoArca(armarPedido('Beta', '30222222226').csrPem)
    expect(claveDelCertificado(otro, config)).toBeNull()
    // Renovación con la clave ya vigente.
    expect(claveDelCertificado(crt, { clavePendienteCifrada: null, claveCifrada: config.clavePendienteCifrada })?.dePedido).toBe(
      false,
    )
  })
})
