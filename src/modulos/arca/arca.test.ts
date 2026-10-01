import { generateKeyPairSync } from 'node:crypto'

import forge from 'node-forge'
import { describe, expect, it } from 'vitest'

import { cifrar, descifrar, revisarCertificado } from './certificado'
import { cuerpoSoap, ErrorArca } from './soap'
import { crearTra, firmarTra, leerLoginCms } from './wsaa'
import { leerConsulta, leerRespuestaCae, leerUltimoAutorizado, pedidoCae, type SolicitudCae } from './wsfe'

/** Certificado autofirmado de prueba, como el que da ARCA (CUIT en el sujeto). */
function certificadoDePrueba(cuit = '30715974823', vence = new Date(Date.now() + 365 * 86_400_000)) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const clavePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const cert = forge.pki.createCertificate()
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }).toString())
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date(Date.now() - 86_400_000)
  cert.validity.notAfter = vence
  const sujeto = [
    { name: 'commonName', value: 'erp' },
    { type: '2.5.4.5', value: `CUIT ${cuit}` },
  ]
  cert.setSubject(sujeto)
  cert.setIssuer(sujeto)
  cert.sign(forge.pki.privateKeyFromPem(clavePem), forge.md.sha256.create())
  return { certificado: forge.pki.certificateToPem(cert), clave: clavePem }
}

const RESPUESTA = (detalle: string, errores = '') =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECAESolicitarResult><FeCabResp><Cuit>30715974823</Cuit><PtoVta>5</PtoVta><CbteTipo>1</CbteTipo><Resultado>A</Resultado></FeCabResp><FeDetResp>${detalle}</FeDetResp>${errores}</FECAESolicitarResult></FECAESolicitarResponse></soap:Body></soap:Envelope>`

describe('WSAA', () => {
  it('arma el pedido de ticket con ventana de 10 minutos y el servicio', () => {
    const tra = crearTra('wsfe', new Date('2026-10-01T15:00:00Z'))
    expect(tra).toContain('<service>wsfe</service>')
    expect(tra).toContain('<generationTime>2026-10-01T14:50:00-00:00</generationTime>')
    expect(tra).toContain('<expirationTime>2026-10-01T15:10:00-00:00</expirationTime>')
  })

  it('firma el ticket en CMS con el contenido adentro y el certificado', () => {
    const { certificado, clave } = certificadoDePrueba()
    const tra = crearTra('wsfe')
    const cms = firmarTra(tra, certificado, clave)
    const mensaje = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(cms))) as unknown as {
      rawCapture: { content: forge.asn1.Asn1 }
      certificates: forge.pki.Certificate[]
    }
    expect(mensaje.certificates).toHaveLength(1)
    const contenido = forge.asn1.toDer(mensaje.rawCapture.content).getBytes()
    expect(contenido).toContain('<service>wsfe</service>')
  })

  it('lee el ticket de la respuesta de LoginCms', () => {
    const ticket = `<?xml version="1.0" encoding="UTF-8"?><loginTicketResponse version="1.0"><header><expirationTime>2026-10-02T03:00:00.000-03:00</expirationTime></header><credentials><token>TOK</token><sign>FIR</sign></credentials></loginTicketResponse>`
    const escapado = ticket.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const xml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><loginCmsResponse><loginCmsReturn>${escapado}</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>`
    const t = leerLoginCms(xml)
    expect([t.token, t.firma, t.vence.toISOString()]).toEqual(['TOK', 'FIR', '2026-10-02T06:00:00.000Z'])
  })

  it('convierte un SOAP Fault en ErrorArca con su código', () => {
    const xml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault><faultcode>ns1:coe.alreadyAuthenticated</faultcode><faultstring>El CEE ya posee un TA valido para el acceso al WSN solicitado</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>`
    expect(() => cuerpoSoap(xml)).toThrow(ErrorArca)
    try {
      cuerpoSoap(xml)
    } catch (e) {
      expect((e as ErrorArca).codigo).toContain('alreadyAuthenticated')
    }
  })
})

describe('WSFEv1', () => {
  const solicitud: SolicitudCae = {
    puntoVenta: 5,
    tipo: 3,
    numero: 12,
    concepto: 2,
    docTipo: 80,
    docNumero: '30999176522',
    fecha: '2026-10-01',
    total: '1240.30',
    noGravado: '0.00',
    neto: '1000.00',
    exento: '0.00',
    tributos: '30.30',
    iva: '210.00',
    servicioDesde: '2026-09-01',
    servicioHasta: '2026-09-30',
    vencimientoPago: '2026-10-10',
    moneda: 'PES',
    cotizacion: '1.000000',
    condicionIvaReceptor: 1,
    asociados: [{ tipo: 1, puntoVenta: 5, numero: 10, cuit: '30715974823', fecha: '2026-09-30' }],
    detalleTributos: [{ id: 7, descripcion: 'Percepción IIBB Chaco', base: '1000.00', alicuota: '3.03', importe: '30.30' }],
    detalleIva: [{ id: 5, base: '1000.00', importe: '210.00' }],
  }

  it('arma el pedido de CAE en el orden del esquema de ARCA', () => {
    const xml = pedidoCae({ token: 'T', firma: 'F', cuit: '30715974823' }, solicitud)
    const orden = [
      'Concepto',
      'DocTipo',
      'DocNro',
      'CbteDesde',
      'CbteHasta',
      'CbteFch',
      'ImpTotal',
      'ImpTotConc',
      'ImpNeto',
      'ImpOpEx',
      'ImpTrib',
      'ImpIVA',
      'FchServDesde',
      'FchServHasta',
      'FchVtoPago',
      'MonId',
      'MonCotiz',
      'CondicionIVAReceptorId',
      'CbtesAsoc',
      'Tributos',
      'Iva',
    ]
    const posiciones = orden.map((e) => xml.indexOf(`<ar:${e}>`))
    expect(posiciones.every((p) => p > 0)).toBe(true)
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones)
    expect(xml).toContain('<ar:CbteFch>20261001</ar:CbteFch>')
    expect(xml).toContain('<ar:CbteAsoc><ar:Tipo>1</ar:Tipo><ar:PtoVta>5</ar:PtoVta><ar:Nro>10</ar:Nro>')
    // En pesos no va CanMisMonExt.
    expect(xml).not.toContain('CanMisMonExt')
  })

  it('en productos no manda fechas de servicio, y en dólares pide CanMisMonExt', () => {
    const xml = pedidoCae(
      { token: 'T', firma: 'F', cuit: '1' },
      { ...solicitud, concepto: 1, vencimientoPago: null, moneda: 'DOL', cotizacion: '1450.000000' },
    )
    expect(xml).not.toContain('FchServDesde')
    expect(xml).not.toContain('FchVtoPago')
    expect(xml).toContain('<ar:MonId>DOL</ar:MonId><ar:MonCotiz>1450.000000</ar:MonCotiz><ar:CanMisMonExt>N</ar:CanMisMonExt>')
  })

  it('lee un CAE aprobado con observaciones', () => {
    const r = leerRespuestaCae(
      RESPUESTA(
        '<FECAEDetResponse><Concepto>1</Concepto><Resultado>A</Resultado><CAE>76401234567890</CAE><CAEFchVto>20261011</CAEFchVto><Observaciones><Obs><Code>10217</Code><Msg>Nota informativa</Msg></Obs></Observaciones></FECAEDetResponse>',
      ),
    )
    expect(r).toEqual({
      resultado: 'A',
      cae: '76401234567890',
      caeVence: '2026-10-11',
      observaciones: [{ codigo: '10217', mensaje: 'Nota informativa' }],
      errores: [],
    })
  })

  it('lee un rechazo con sus motivos', () => {
    const r = leerRespuestaCae(
      RESPUESTA(
        '<FECAEDetResponse><Resultado>R</Resultado><CAE></CAE><CAEFchVto></CAEFchVto><Observaciones><Obs><Code>10015</Code><Msg>DocNro invalido</Msg></Obs><Obs><Code>10016</Code><Msg>Fecha invalida</Msg></Obs></Observaciones></FECAEDetResponse>',
      ),
    )
    expect(r.resultado).toBe('R')
    expect(r.cae).toBeNull()
    expect(r.observaciones.map((o) => o.codigo)).toEqual(['10015', '10016'])
  })

  it('un rechazo de cabecera sin detalle viene como R con los errores', () => {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FECAESolicitarResponse><FECAESolicitarResult><Errors><Err><Code>10004</Code><Msg>Punto de venta no habilitado</Msg></Err></Errors></FECAESolicitarResult></FECAESolicitarResponse></soap:Body></soap:Envelope>`
    expect(leerRespuestaCae(xml)).toMatchObject({ resultado: 'R', errores: [{ codigo: '10004' }] })
  })

  it('lee el último autorizado y la consulta (602 = no existe)', () => {
    const ultimo = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><PtoVta>5</PtoVta><CbteTipo>1</CbteTipo><CbteNro>41</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse></soap:Body></soap:Envelope>`
    expect(leerUltimoAutorizado(ultimo)).toBe(41)
    const noExiste = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FECompConsultarResponse><FECompConsultarResult><Errors><Err><Code>602</Code><Msg>No existen datos</Msg></Err></Errors></FECompConsultarResult></FECompConsultarResponse></soap:Body></soap:Envelope>`
    expect(leerConsulta(noExiste)).toBeNull()
    const existe = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FECompConsultarResponse><FECompConsultarResult><ResultGet><CbteDesde>42</CbteDesde><CbteFch>20261001</CbteFch><ImpTotal>1210</ImpTotal><DocNro>30999176522</DocNro><CodAutorizacion>76401234567890</CodAutorizacion><FchVto>20261011</FchVto><Resultado>A</Resultado></ResultGet></FECompConsultarResult></FECompConsultarResponse></soap:Body></soap:Envelope>`
    expect(leerConsulta(existe)).toMatchObject({ numero: 42, total: '1210', cae: '76401234567890', caeVence: '2026-10-11' })
  })
})

describe('certificado y clave', () => {
  it('acepta el par correcto y lee el CUIT y el vencimiento', () => {
    const { certificado, clave } = certificadoDePrueba()
    const r = revisarCertificado(certificado, clave)
    expect(r.ok && r.datos.cuit).toBe('30715974823')
  })

  it('rechaza una clave que no corresponde, o un certificado vencido', () => {
    const a = certificadoDePrueba()
    const b = certificadoDePrueba()
    expect(revisarCertificado(a.certificado, b.clave)).toMatchObject({
      ok: false,
      error: expect.stringContaining('no corresponde'),
    })
    const viejo = certificadoDePrueba('30715974823', new Date(Date.now() - 3600_000))
    expect(revisarCertificado(viejo.certificado, viejo.clave)).toMatchObject({
      ok: false,
      error: expect.stringContaining('venció'),
    })
  })

  it('cifra y descifra la clave con la clave maestra; sin ella no anda', () => {
    process.env.ERP_CLAVE_MAESTRA = 'x'.repeat(40)
    const guardado = cifrar('-----BEGIN PRIVATE KEY-----')
    expect(guardado).not.toContain('PRIVATE')
    expect(descifrar(guardado)).toBe('-----BEGIN PRIVATE KEY-----')
    process.env.ERP_CLAVE_MAESTRA = 'y'.repeat(40)
    expect(() => descifrar(guardado)).toThrow()
    delete process.env.ERP_CLAVE_MAESTRA
    expect(() => cifrar('a')).toThrow(/ERP_CLAVE_MAESTRA/)
  })
})
