import { describe, expect, it } from 'vitest'

import { interpretarPersona, pedidoPersona } from './padron'
import { ErrorArca } from './soap'

const respuesta = (persona: string) =>
  `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:getPersona_v2Response xmlns:ns2="http://a5.soap.ws.server.puc.sr/"><personaReturn>${persona}</personaReturn></ns2:getPersona_v2Response></soap:Body></soap:Envelope>`

describe('Padrón de ARCA (constancia de inscripción)', () => {
  it('arma el pedido con el ticket y el CUIT consultado', () => {
    const xml = pedidoPersona({ token: 'T', firma: 'F', cuit: '30715974823' }, '20111111112')
    expect(xml).toContain(
      '<a5:getPersona_v2><token>T</token><sign>F</sign><cuitRepresentada>30715974823</cuitRepresentada><idPersona>20111111112</idPersona>',
    )
  })

  it('sociedad inscripta en IVA: razón social, condición y domicilio fiscal con su provincia', () => {
    const d = interpretarPersona(
      respuesta(`<datosGenerales><razonSocial>EJEMPLO SA</razonSocial><tipoPersona>JURIDICA</tipoPersona><estadoClave>ACTIVO</estadoClave>
        <domicilioFiscal><direccion>AV SIEMPRE VIVA 742</direccion><localidad>RESISTENCIA</localidad><codPostal>3500</codPostal><idProvincia>16</idProvincia><descripcionProvincia>CHACO</descripcionProvincia></domicilioFiscal></datosGenerales>
        <datosRegimenGeneral><impuesto><idImpuesto>30</idImpuesto><descripcionImpuesto>IVA</descripcionImpuesto></impuesto><impuesto><idImpuesto>10</idImpuesto><descripcionImpuesto>GANANCIAS SOCIEDADES</descripcionImpuesto></impuesto></datosRegimenGeneral>`),
      '30715974823',
    )
    expect(d).toMatchObject({
      razonSocial: 'EJEMPLO SA',
      condicionIva: 1,
      domicilio: 'AV SIEMPRE VIVA 742',
      localidad: 'RESISTENCIA',
      codigoPostal: '3500',
      provincia: 'H',
      activo: true,
      impuestos: ['IVA', 'GANANCIAS SOCIEDADES'],
    })
  })

  it('persona humana monotributista: apellido y nombre; la Ciudad de Buenos Aires es la provincia 0', () => {
    const d = interpretarPersona(
      respuesta(`<datosGenerales><apellido>GOMEZ</apellido><nombre>CARLA</nombre><tipoPersona>FISICA</tipoPersona>
        <domicilioFiscal><direccion>CORRIENTES 1234</direccion><codPostal>1043</codPostal><idProvincia>0</idProvincia><descripcionProvincia>CIUDAD AUTONOMA BUENOS AIRES</descripcionProvincia></domicilioFiscal></datosGenerales>
        <datosMonotributo><impuesto><idImpuesto>20</idImpuesto></impuesto><categoriaMonotributo><descripcionCategoria>A LOCACIONES DE SERVICIOS</descripcionCategoria></categoriaMonotributo></datosMonotributo>`),
      '27222222223',
    )
    expect(d).toMatchObject({
      razonSocial: 'GOMEZ, CARLA',
      condicionIva: 6,
      provincia: 'C',
      localidad: 'CIUDAD AUTONOMA BUENOS AIRES',
    })
  })

  it('exento y sin inscripción en IVA; sin datos, el error de ARCA', () => {
    const exento = interpretarPersona(
      respuesta(
        `<datosGenerales><razonSocial>FUNDACION</razonSocial><domicilioFiscal/></datosGenerales><datosRegimenGeneral><impuesto><idImpuesto>32</idImpuesto><descripcionImpuesto>IVA EXENTO</descripcionImpuesto></impuesto></datosRegimenGeneral>`,
      ),
      '30000000000',
    )
    expect(exento.condicionIva).toBe(4)
    const nada = interpretarPersona(respuesta(`<datosGenerales><razonSocial>X</razonSocial></datosGenerales>`), '20000000001')
    expect(nada.condicionIva).toBe(5)
    expect(() =>
      interpretarPersona(
        respuesta(`<errorConstancia><error>No existe persona con ese Id</error></errorConstancia>`),
        '20000000001',
      ),
    ).toThrow(ErrorArca)
  })
})
