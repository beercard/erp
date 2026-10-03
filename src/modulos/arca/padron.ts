import type { Transaccion } from '../../db/conexion'
import { validarCuit } from '../../lib/cuit'
import { credenciales } from './cliente'
import { cuerpoSoap, ErrorArca, escapar, sobre, transporteHttp, type Transporte } from './soap'

/**
 * Padrón de ARCA: datos de la constancia de inscripción de un CUIT
 * (servicio ws_sr_constancia_inscripcion, método getPersona_v2). Con eso se
 * completa la ficha de un cliente o proveedor: razón social, condición frente
 * al IVA y domicilio fiscal.
 *
 * El certificado de la empresa tiene que tener asociado este servicio en ARCA
 * (Administrador de relaciones de clave fiscal → nueva relación →
 * "ws_sr_constancia_inscripcion"), además del de factura electrónica.
 */

export const SERVICIO_PADRON = 'ws_sr_constancia_inscripcion'

export const URL_PADRON = {
  homologacion: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
  produccion: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5',
} as const

const NS = 'http://a5.soap.ws.server.puc.sr/'

/** Provincia de ARCA (idProvincia) → código de provincia del sistema (ISO 3166-2:AR). */
export const PROVINCIA_ARCA: Record<number, string> = {
  0: 'C',
  1: 'B',
  2: 'K',
  3: 'X',
  4: 'W',
  5: 'E',
  6: 'Y',
  7: 'M',
  8: 'F',
  9: 'A',
  10: 'J',
  11: 'D',
  12: 'S',
  13: 'G',
  14: 'T',
  16: 'H',
  17: 'U',
  18: 'P',
  19: 'N',
  20: 'Q',
  21: 'L',
  22: 'R',
  23: 'Z',
  24: 'V',
}

/** Condiciones frente al IVA (las del receptor de ARCA). */
export const CONDICION = { inscripto: 1, exento: 4, consumidorFinal: 5, monotributo: 6 } as const

export type DatosPadron = {
  cuit: string
  razonSocial: string
  tipoPersona: 'FISICA' | 'JURIDICA' | null
  activo: boolean
  condicionIva: number
  condicionTexto: string
  domicilio: string | null
  localidad: string | null
  codigoPostal: string | null
  provincia: string | null
  /** Impuestos en los que está inscripto (para mostrar). */
  impuestos: string[]
  /** Lo que ARCA dice que no puede informar (constancia con errores, por ejemplo). */
  avisos: string[]
}

export function pedidoPersona(c: { token: string; firma: string; cuit: string }, cuit: string) {
  return sobre(
    `<a5:getPersona_v2><token>${escapar(c.token)}</token><sign>${escapar(c.firma)}</sign><cuitRepresentada>${escapar(c.cuit)}</cuitRepresentada><idPersona>${escapar(cuit)}</idPersona></a5:getPersona_v2>`,
    { a5: NS },
  )
}

type Nodo = Record<string, unknown>
const lista = (v: unknown): Nodo[] => (Array.isArray(v) ? (v as Nodo[]) : v ? [v as Nodo] : [])
const texto = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v).trim())
const errores = (v: unknown) =>
  lista(v).flatMap((e) => (Array.isArray(e.error) ? e.error : [e.error]).filter(Boolean).map(String))

/** Lee la respuesta de getPersona_v2. */
export function interpretarPersona(xml: string, cuit: string): DatosPadron {
  const body = cuerpoSoap(xml)
  const r = ((body.getPersona_v2Response as Nodo | undefined)?.personaReturn ?? {}) as Nodo
  const general = (r.datosGenerales ?? null) as Nodo | null
  const avisos = [...errores(r.errorConstancia), ...errores(r.errorRegimenGeneral), ...errores(r.errorMonotributo)]
  if (!general) {
    throw new ErrorArca(avisos[0] ?? 'ARCA no tiene datos de ese CUIT.')
  }
  const razonSocial = texto(general.razonSocial) ?? [texto(general.apellido), texto(general.nombre)].filter(Boolean).join(', ')
  const domicilio = (general.domicilioFiscal ?? {}) as Nodo
  const regimen = lista((r.datosRegimenGeneral as Nodo | undefined)?.impuesto)
  const monotributo = r.datosMonotributo as Nodo | undefined
  const ids = new Set(regimen.map((i) => Number(i.idImpuesto)))
  const [condicionIva, condicionTexto] = monotributo
    ? [CONDICION.monotributo, 'Responsable Monotributo']
    : ids.has(30)
      ? [CONDICION.inscripto, 'IVA Responsable Inscripto']
      : ids.has(32)
        ? [CONDICION.exento, 'IVA Sujeto Exento']
        : [CONDICION.consumidorFinal, 'Consumidor Final (sin inscripción en IVA)']
  const idProvincia = texto(domicilio.idProvincia)
  return {
    cuit,
    razonSocial,
    tipoPersona: (texto(general.tipoPersona) as DatosPadron['tipoPersona']) ?? null,
    activo: (texto(general.estadoClave) ?? 'ACTIVO').toUpperCase() === 'ACTIVO',
    condicionIva,
    condicionTexto,
    domicilio: texto(domicilio.direccion),
    localidad: texto(domicilio.localidad) ?? texto(domicilio.descripcionProvincia),
    codigoPostal: texto(domicilio.codPostal),
    provincia: idProvincia !== null ? (PROVINCIA_ARCA[Number(idProvincia)] ?? null) : null,
    impuestos: [
      ...regimen.map((i) => texto(i.descripcionImpuesto)).filter((x): x is string => !!x),
      ...(monotributo ? ['MONOTRIBUTO'] : []),
    ],
    avisos,
  }
}

/** Consulta un CUIT con el certificado de la empresa de la transacción. */
export async function consultarPadron(
  tx: Transaccion,
  cuitEmpresa: string,
  cuit: string,
  transporte: Transporte = transporteHttp(15_000),
): Promise<{ ok: true; datos: DatosPadron } | { ok: false; error: string }> {
  const limpio = cuit.replace(/\D/g, '')
  if (!validarCuit(limpio).valido) return { ok: false, error: 'El CUIT no es válido (revisá el dígito verificador).' }
  try {
    const { ambiente, c } = await credenciales(tx, cuitEmpresa, transporte, SERVICIO_PADRON)
    const xml = await transporte(URL_PADRON[ambiente], '', pedidoPersona(c, limpio))
    return { ok: true, datos: interpretarPersona(xml, limpio) }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    if (/notAuthorized|no autorizado|Computador no autorizado|servicio/i.test(mensaje) && /ws_sr|autoriz/i.test(mensaje)) {
      return {
        ok: false,
        error: `El certificado de ARCA no tiene autorizado el servicio de padrón. En ARCA: Administrador de relaciones → nueva relación → ${SERVICIO_PADRON}.`,
      }
    }
    return { ok: false, error: `ARCA: ${mensaje}` }
  }
}
