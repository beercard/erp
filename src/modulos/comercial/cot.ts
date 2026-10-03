import { asc, eq, inArray } from 'drizzle-orm'

import { conEmpresa } from '../../db/empresa'
import { articulos, depositos, remitos, remitosItems, terceros, transportes } from '../../db/schema'
import { empresaEmisora } from '../facturacion/comprobantes'
import { credencialesArba, presentarCot } from '../impuestos/arba'

/**
 * COT (Código de Operación de Traslado) de ARBA: los bienes que viajan por
 * la Provincia de Buenos Aires van con un código que se pide presentando el
 * remito en un archivo de texto con campos separados por "|":
 *   01 cabecera (CUIT de la empresa), 02 el remito (origen, destino,
 *   transporte), 03 un renglón por producto (código del nomenclador, unidad
 *   de la tabla de ARBA, cantidad), 04 cierre (cantidad de remitos).
 * Se pide uno por remito, desde la pantalla del remito.
 */

type Fetch = typeof fetch

export type DatosCot = {
  cuitEmpresa: string
  planta: string
  puerta: string
  secuencia: number
  remito: {
    puntoVenta: number
    numero: number
    fecha: string
    salida: string
    hora: string
    importe: string
    patente: string | null
  }
  origen: { cuit: string; razonSocial: string; domicilio: string; localidad: string; codigoPostal: string; provincia: string }
  destino: {
    cuit: string | null
    documento: string | null
    razonSocial: string
    domicilio: string
    localidad: string
    codigoPostal: string
    provincia: string
  }
  transportista: string | null
  items: { codigo: string; unidad: number; cantidad: string; propio: string; descripcion: string; unidadPropia: string }[]
}

/** Calle y número de un domicilio escrito de corrido ("Av. Mitre 1234"). */
export function separarDomicilio(d: string) {
  const m = d.trim().match(/^(.*?)[\s,]+(?:n[°ºo.]?\s*)?(\d{1,6})\b(.*)$/i)
  return m
    ? { calle: m[1].trim(), numero: m[2], resto: m[3].replace(/^[\s,]+/, '').trim() }
    : { calle: d.trim(), numero: '0', resto: '' }
}

const limpio = (v: string | null | undefined, largo = 50) =>
  (v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[|\r\n]/g, ' ')
    .trim()
    .slice(0, largo)
/** Importes y cantidades sin separador, con dos decimales implícitos. */
const sinComa = (v: string) => Math.round(Number(v) * 100).toString()

export function archivoCot(d: DatosCot) {
  const codigoUnico = `091R${String(d.remito.puntoVenta).padStart(4, '0')}${String(d.remito.numero).padStart(8, '0')}`
  const o = separarDomicilio(d.origen.domicilio)
  const x = separarDomicilio(d.destino.domicilio)
  const ymd = (f: string) => f.replace(/-/g, '')
  const remito = [
    '02',
    ymd(d.remito.fecha),
    codigoUnico,
    ymd(d.remito.salida),
    d.remito.hora.replace(':', ''),
    'E', // sujeto generador: el emisor
    d.destino.cuit ? '0' : '1', // consumidor final
    d.destino.cuit ? '' : 'DNI',
    d.destino.cuit ? '' : (d.destino.documento ?? ''),
    d.destino.cuit ?? '',
    limpio(d.destino.razonSocial),
    '0', // destinatario tenedor
    limpio(x.calle, 40),
    x.numero,
    limpio(x.resto, 5),
    '',
    '',
    '',
    limpio(d.destino.codigoPostal, 8),
    limpio(d.destino.localidad),
    d.destino.provincia,
    '',
    'NO', // entrega en el domicilio de origen
    d.origen.cuit,
    limpio(d.origen.razonSocial),
    '1', // emisor tenedor
    limpio(o.calle, 40),
    o.numero,
    limpio(o.resto, 5),
    '',
    '',
    '',
    limpio(d.origen.codigoPostal, 8),
    limpio(d.origen.localidad),
    d.origen.provincia,
    d.transportista ?? '',
    '',
    '',
    '',
    '',
    limpio(d.remito.patente, 7).replace(/\s/g, '').toUpperCase(),
    '',
    '0', // producto no terminado / devolución
    sinComa(d.remito.importe),
  ]
  const contenido = [
    `01|${d.cuitEmpresa}`,
    remito.join('|'),
    ...d.items.map((i) =>
      [
        '03',
        i.codigo,
        String(i.unidad),
        sinComa(i.cantidad),
        limpio(i.propio, 25),
        limpio(i.descripcion, 40),
        limpio(i.unidadPropia, 20),
        sinComa(i.cantidad),
      ].join('|'),
    ),
    '04|1',
  ].join('\r\n')
  const nombre = `TB_${d.cuitEmpresa}_${d.planta}_${d.puerta}_${ymd(d.remito.fecha)}_${String(d.secuencia).padStart(6, '0')}.txt`
  return { nombre, contenido: `${contenido}\r\n` }
}

/** Arma los datos del COT de un remito, o dice qué falta cargar. */
async function datosDelRemito(empresaId: string, remitoId: string, o: { patente: string; salida: string; hora: string }) {
  return conEmpresa(empresaId, async (tx): Promise<{ datos: DatosCot } | { error: string }> => {
    const [r] = await tx.select().from(remitos).where(eq(remitos.id, remitoId))
    if (!r || r.estado === 'anulado') return { error: 'El remito no existe o está anulado.' }
    if (r.cot) return { error: `El remito ya tiene COT ${r.cot}.` }
    const cred = await credencialesArba(tx)
    if (!cred) return { error: 'Cargá el usuario y la CIT de ARBA en Configuración › Padrones de IIBB y ARBA.' }
    const empresa = await empresaEmisora(tx)
    const [cliente] = await tx.select().from(terceros).where(eq(terceros.id, r.terceroId))
    const [deposito] = await tx.select().from(depositos).where(eq(depositos.id, r.depositoId))
    const [transporte] = r.transporteId ? await tx.select().from(transportes).where(eq(transportes.id, r.transporteId)) : []
    const items = await tx.select().from(remitosItems).where(eq(remitosItems.remitoId, remitoId)).orderBy(asc(remitosItems.orden))
    const ids = items.flatMap((i) => (i.articuloId ? [i.articuloId] : []))
    const arts = ids.length ? await tx.select().from(articulos).where(inArray(articulos.id, ids)) : []
    const faltan = items.filter((i) => {
      const a = arts.find((x) => x.id === i.articuloId)
      return !a?.codigoCot || !a.unidadCot
    })
    if (faltan.length) {
      return {
        error: `Falta el código del nomenclador o la unidad de ARBA en: ${faltan.map((i) => i.descripcion).join(', ')}. Se cargan en la ficha del artículo.`,
      }
    }
    const domicilioOrigen = deposito?.domicilio || empresa?.domicilioFiscal
    if (!domicilioOrigen || !empresa?.provincia)
      return { error: 'Falta el domicilio de origen (del depósito o el fiscal de la empresa).' }
    if (!cliente.domicilio || !cliente.provincia)
      return { error: 'Falta el domicilio de entrega del cliente (calle, número y provincia).' }
    const esCuit = cliente.tipoDocumento === 80
    // El importe: lo que vale la mercadería a precio de costo (no se factura con el remito).
    const importe = items.reduce(
      (s, i) => s + Number(i.cantidad) * Number(arts.find((a) => a.id === i.articuloId)?.costo ?? 0),
      0,
    )
    return {
      datos: {
        cuitEmpresa: empresa.cuit,
        planta: cred.cotPlanta,
        puerta: cred.cotPuerta,
        secuencia: r.numero,
        remito: {
          puntoVenta: r.puntoVenta,
          numero: r.numero,
          fecha: r.fecha,
          salida: o.salida,
          hora: o.hora,
          importe: importe.toFixed(2),
          patente: o.patente || null,
        },
        origen: {
          cuit: empresa.cuit,
          razonSocial: empresa.razonSocial,
          domicilio: domicilioOrigen,
          localidad: empresa.localidad ?? '',
          codigoPostal: empresa.codigoPostal ?? '',
          provincia: empresa.provincia,
        },
        destino: {
          cuit: esCuit ? cliente.numeroDocumento : null,
          documento: esCuit ? null : cliente.numeroDocumento,
          razonSocial: cliente.razonSocial,
          domicilio: cliente.domicilio,
          localidad: cliente.localidad ?? '',
          codigoPostal: cliente.codigoPostal ?? '',
          provincia: cliente.provincia,
        },
        transportista: transporte?.cuit?.replace(/\D/g, '') || null,
        items: items.map((i) => {
          const a = arts.find((x) => x.id === i.articuloId)!
          return {
            codigo: a.codigoCot!,
            unidad: a.unidadCot!,
            cantidad: i.cantidad,
            propio: a.codigo,
            descripcion: i.descripcion,
            unidadPropia: a.unidad,
          }
        }),
      },
    }
  })
}

const datosEntrada = (o: { patente?: string; salida?: string; hora?: string }, hoy: string) => ({
  patente: (o.patente ?? '').replace(/[\s-]/g, '').toUpperCase(),
  salida: /^\d{4}-\d\d-\d\d$/.test(o.salida ?? '') ? o.salida! : hoy,
  hora: /^\d\d:\d\d$/.test(o.hora ?? '') ? o.hora! : '08:00',
})

/** El archivo para presentarlo a mano en la web de ARBA. */
export async function archivoCotDeRemito(
  empresaId: string,
  remitoId: string,
  o: { patente?: string; salida?: string; hora?: string },
  hoy: string,
) {
  const d = await datosDelRemito(empresaId, remitoId, datosEntrada(o, hoy))
  return 'error' in d ? d : archivoCot(d.datos)
}

/** Presenta el remito en ARBA y guarda el COT. La llamada va fuera de la transacción. */
export async function pedirCot(
  empresaId: string,
  remitoId: string,
  o: { patente?: string; salida?: string; hora?: string },
  hoy: string,
  f: Fetch = fetch,
) {
  const entrada = datosEntrada(o, hoy)
  if (entrada.patente && !/^[A-Z]{2,3}\d{3}[A-Z]{0,2}$/.test(entrada.patente)) {
    return { ok: false as const, error: 'La patente no es válida (AAA123 o AA123BB).' }
  }
  const d = await datosDelRemito(empresaId, remitoId, entrada)
  if ('error' in d) return { ok: false as const, error: d.error }
  const cred = await conEmpresa(empresaId, (tx) => credencialesArba(tx))
  const { nombre, contenido } = archivoCot(d.datos)
  const r = await presentarCot(cred!, nombre, contenido, f)
  if (!r.ok) return r
  await conEmpresa(empresaId, (tx) =>
    tx
      .update(remitos)
      .set({ cot: r.cot, cotIntegridad: r.integridad, cotPedido: new Date(), patente: entrada.patente || null })
      .where(eq(remitos.id, remitoId)),
  )
  return { ok: true as const, cot: r.cot }
}
