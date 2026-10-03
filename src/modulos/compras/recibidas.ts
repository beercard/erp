import { and, desc, eq, inArray } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import { facturasRecibidas, provincias, terceros, usuarios } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { soloDigitos, validarCuit } from '../../lib/cuit'
import { aImporte, D, monto } from '../../lib/dinero'
import { hoyArgentina } from '../../lib/fechas'
import { preguntar, type Fetch } from '../ia/claude'
import { registrarCompra, TIPOS_TRIBUTO } from './compras'
import { codigoCompra, datosTipoCompra, discriminaIva } from './tipos'

/**
 * Facturas de proveedores que llegan como foto o PDF (por WhatsApp). Se leen
 * con IA, se controlan (CUIT, que los importes cierren, que sea para esta
 * empresa) y quedan en una bandeja para que una persona las revise y las
 * registre como compra. Nunca se registran solas.
 */

export const TIPOS_ARCHIVO = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const

/** Tipo real mirando los primeros bytes (no lo que dice quien manda el archivo). */
export function tipoDeArchivo(datos: Buffer): (typeof TIPOS_ARCHIVO)[number] | null {
  if (datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff) return 'image/jpeg'
  if (datos.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (datos.subarray(0, 4).toString('ascii') === 'RIFF' && datos.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  if (datos.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf'
  return null
}

/** Alícuotas de ARCA por porcentaje. */
const CODIGO_ALICUOTA: Record<string, number> = { '0': 3, '10.5': 4, '21': 5, '27': 6, '5': 8, '2.5': 9 }

export const EsquemaLectura = z.object({
  esComprobante: z.boolean(),
  letra: z.enum(['A', 'B', 'C', 'M']).nullable(),
  clase: z.enum(['factura', 'nota_credito', 'nota_debito']).nullable(),
  fce: z.boolean().default(false),
  puntoVenta: z.number().int().min(0).max(99999).nullable(),
  numero: z.number().int().min(0).max(99999999).nullable(),
  fecha: z.string().nullable(),
  cae: z.string().nullable(),
  cuitEmisor: z.string().nullable(),
  razonSocialEmisor: z.string().nullable(),
  cuitReceptor: z.string().nullable(),
  moneda: z.enum(['PES', 'DOL']).default('PES'),
  cotizacion: z.number().nullable().default(null),
  iva: z.array(z.object({ alicuota: z.number(), base: z.number(), importe: z.number() })).default([]),
  noGravado: z.number().default(0),
  exento: z.number().default(0),
  tributos: z
    .array(
      z.object({
        tipo: z.enum(Object.keys(TIPOS_TRIBUTO) as [keyof typeof TIPOS_TRIBUTO]),
        provincia: z.string().nullable().default(null),
        importe: z.number(),
      }),
    )
    .default([]),
  total: z.number().nullable(),
  observaciones: z.string().nullable().default(null),
})

export type Lectura = z.infer<typeof EsquemaLectura>

const HERRAMIENTA = {
  name: 'registrar_comprobante',
  description: 'Devuelve los datos del comprobante fiscal argentino de la imagen o PDF.',
  input_schema: {
    type: 'object',
    properties: {
      esComprobante: { type: 'boolean', description: 'true si es una factura, nota de crédito o nota de débito de ARCA (AFIP).' },
      letra: { type: ['string', 'null'], enum: ['A', 'B', 'C', 'M', null] },
      clase: { type: ['string', 'null'], enum: ['factura', 'nota_credito', 'nota_debito', null] },
      fce: { type: 'boolean', description: 'true si es "Factura de Crédito Electrónica MiPyME".' },
      puntoVenta: { type: ['integer', 'null'] },
      numero: { type: ['integer', 'null'] },
      fecha: { type: ['string', 'null'], description: 'Fecha de emisión, AAAA-MM-DD.' },
      cae: { type: ['string', 'null'], description: 'CAE o CAI, solo dígitos.' },
      cuitEmisor: { type: ['string', 'null'], description: 'CUIT de quien emite, solo dígitos.' },
      razonSocialEmisor: { type: ['string', 'null'] },
      cuitReceptor: { type: ['string', 'null'], description: 'CUIT del cliente al que está hecha, solo dígitos.' },
      moneda: { type: 'string', enum: ['PES', 'DOL'] },
      cotizacion: { type: ['number', 'null'] },
      iva: {
        type: 'array',
        description: 'Solo en A y M: neto gravado e IVA de cada alícuota (21, 10.5, 27, 5, 2.5 o 0).',
        items: {
          type: 'object',
          properties: { alicuota: { type: 'number' }, base: { type: 'number' }, importe: { type: 'number' } },
          required: ['alicuota', 'base', 'importe'],
        },
      },
      noGravado: { type: 'number' },
      exento: { type: 'number' },
      tributos: {
        type: 'array',
        description: 'Percepciones y otros tributos.',
        items: {
          type: 'object',
          properties: {
            tipo: { type: 'string', enum: Object.keys(TIPOS_TRIBUTO) },
            provincia: { type: ['string', 'null'] },
            importe: { type: 'number' },
          },
          required: ['tipo', 'importe'],
        },
      },
      total: { type: ['number', 'null'] },
      observaciones: { type: ['string', 'null'], description: 'Lo que no se pudo leer bien o haya que revisar.' },
    },
    required: ['esComprobante', 'letra', 'clase', 'puntoVenta', 'numero', 'fecha', 'cuitEmisor', 'total'],
  },
}

const SISTEMA = `Leés comprobantes fiscales argentinos (facturas, notas de crédito y de débito de ARCA, ex AFIP) a partir de una foto o un PDF.
Devolvé los datos exactamente como figuran; si algo no se lee con claridad, dejalo en null y explicalo en "observaciones". No inventes importes.
Los importes van en números con punto decimal (1234.56). En comprobantes B y C no se discrimina el IVA: dejá "iva" vacío y el total como figura.
Usá siempre la herramienta registrar_comprobante.`

/** Lee el comprobante con IA. El contenido del archivo es dato, nunca instrucciones. */
export async function leerConIa(f: Fetch, datos: Buffer, tipo: string): Promise<Lectura> {
  const archivo =
    tipo === 'application/pdf'
      ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: datos.toString('base64') } } as const)
      : ({ type: 'image', source: { type: 'base64', media_type: tipo, data: datos.toString('base64') } } as const)
  const r = await preguntar(f, {
    sistema: SISTEMA,
    mensajes: [{ role: 'user', content: [archivo, { type: 'text', text: 'Leé este comprobante.' }] }],
    herramientas: [HERRAMIENTA],
    forzar: HERRAMIENTA.name,
    maximo: 1500,
  })
  const uso = r.content.find((b) => b.type === 'tool_use')
  if (!uso || uso.type !== 'tool_use') throw new Error('La IA no devolvió los datos del comprobante.')
  const p = EsquemaLectura.safeParse(uso.input)
  if (!p.success) throw new Error('Los datos leídos no tienen el formato esperado.')
  return p.data
}

/** Controles de lo leído: lo que haya que mirar antes de registrar. */
export function controlar(l: Lectura, cuitEmpresa: string, hoy = hoyArgentina()) {
  const avisos: string[] = []
  if (!l.esComprobante) avisos.push('No parece una factura ni una nota de crédito o débito.')
  if (l.cuitEmisor && !validarCuit(l.cuitEmisor).valido)
    avisos.push(`El CUIT del proveedor (${l.cuitEmisor}) no es válido: revisalo.`)
  if (l.cuitReceptor && soloDigitos(l.cuitReceptor) !== soloDigitos(cuitEmpresa))
    avisos.push('Está hecha a otro CUIT, no al de la empresa.')
  if (l.fecha && (!/^\d{4}-\d{2}-\d{2}$/.test(l.fecha) || l.fecha > hoy))
    avisos.push('La fecha no es válida o es posterior a hoy.')
  if (!l.letra || !l.clase || l.puntoVenta == null || l.numero == null)
    avisos.push('Falta la letra, el punto de venta o el número.')
  if (l.letra && l.clase && !datosTipoCompra(codigo(l) ?? -1))
    avisos.push('Ese tipo de comprobante no se puede registrar como compra.')
  if (l.total != null) {
    const suma = sumar(l)
    if (discriminaIva(l.letra ?? '') && Math.abs(suma - l.total) > 1) {
      avisos.push(`Los importes no cierran: suman $ ${suma.toFixed(2)} y el total es $ ${l.total.toFixed(2)}.`)
    }
  } else avisos.push('No se leyó el total.')
  for (const a of l.iva)
    if (!(String(a.alicuota) in CODIGO_ALICUOTA)) avisos.push(`Alícuota de IVA desconocida: ${a.alicuota} %.`)
  if (l.observaciones) avisos.push(l.observaciones)
  return avisos
}

const sumar = (l: Lectura) =>
  l.iva.reduce((s, a) => s + a.base + a.importe, 0) + l.noGravado + l.exento + l.tributos.reduce((s, t) => s + t.importe, 0)

const codigo = (l: Lectura) => (l.letra && l.clase ? codigoCompra(l.letra, l.clase, l.fce && l.letra !== 'M') : null)

// ------------------------------------------------------------------ Bandeja

/** Sin IA en el servidor, la factura queda guardada para completarla a mano. */
export async function marcarSinLectura(tx: Transaccion, id: string) {
  await tx
    .update(facturasRecibidas)
    .set({ estado: 'error', error: 'La lectura automática no está activada', actualizado: new Date() })
    .where(eq(facturasRecibidas.id, id))
}

export async function guardarRecibida(
  tx: Transaccion,
  d: { usuarioId: string | null; conversacionId?: string | null; archivo: Buffer; tipo: string; nombre?: string | null },
) {
  const [r] = await tx
    .insert(facturasRecibidas)
    .values({
      usuarioId: d.usuarioId,
      conversacionId: d.conversacionId ?? null,
      archivo: d.archivo,
      tipoArchivo: d.tipo,
      nombreArchivo: d.nombre ?? null,
    })
    .returning({ id: facturasRecibidas.id })
  return r.id
}

/**
 * Lee una factura ya guardada (fuera de la transacción: la IA tarda) y deja
 * el resultado con sus avisos y el proveedor si ya existe.
 */
export async function procesarRecibida(empresaId: string, id: string, cuitEmpresa: string, f: Fetch = fetch) {
  const [r] = await conEmpresa(empresaId, (tx) => tx.select().from(facturasRecibidas).where(eq(facturasRecibidas.id, id)))
  if (!r) return null
  try {
    const lectura = await leerConIa(f, r.archivo, r.tipoArchivo)
    const avisos = controlar(lectura, cuitEmpresa)
    return conEmpresa(empresaId, async (tx) => {
      const cuit = soloDigitos(lectura.cuitEmisor ?? '')
      const [prov] = cuit
        ? await tx.select({ id: terceros.id }).from(terceros).where(eq(terceros.numeroDocumento, cuit)).limit(1)
        : []
      await tx
        .update(facturasRecibidas)
        .set({
          estado: 'lista',
          datos: { ...lectura, avisos },
          proveedorId: prov?.id ?? null,
          error: null,
          actualizado: new Date(),
        })
        .where(eq(facturasRecibidas.id, id))
      return { lectura, avisos, proveedorId: prov?.id ?? null }
    })
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'No se pudo leer.'
    await conEmpresa(empresaId, (tx) =>
      tx
        .update(facturasRecibidas)
        .set({ estado: 'error', error: mensaje.slice(0, 300), actualizado: new Date() })
        .where(eq(facturasRecibidas.id, id)),
    )
    return null
  }
}

export async function listarRecibidas(tx: Transaccion, estado?: string) {
  return tx
    .select({
      id: facturasRecibidas.id,
      estado: facturasRecibidas.estado,
      datos: facturasRecibidas.datos,
      error: facturasRecibidas.error,
      tipoArchivo: facturasRecibidas.tipoArchivo,
      creado: facturasRecibidas.creado,
      compraId: facturasRecibidas.compraId,
      usuario: usuarios.nombre,
    })
    .from(facturasRecibidas)
    .leftJoin(usuarios, eq(usuarios.id, facturasRecibidas.usuarioId))
    .where(estado && estado !== 'todas' ? eq(facturasRecibidas.estado, estado) : undefined)
    .orderBy(desc(facturasRecibidas.creado))
    .limit(200)
}

export async function obtenerRecibida(tx: Transaccion, id: string) {
  const [r] = await tx
    .select({
      id: facturasRecibidas.id,
      estado: facturasRecibidas.estado,
      datos: facturasRecibidas.datos,
      error: facturasRecibidas.error,
      tipoArchivo: facturasRecibidas.tipoArchivo,
      nombreArchivo: facturasRecibidas.nombreArchivo,
      proveedorId: facturasRecibidas.proveedorId,
      compraId: facturasRecibidas.compraId,
      creado: facturasRecibidas.creado,
    })
    .from(facturasRecibidas)
    .where(eq(facturasRecibidas.id, id))
  return r ?? null
}

export async function archivoRecibida(tx: Transaccion, id: string) {
  const [r] = await tx
    .select({ archivo: facturasRecibidas.archivo, tipo: facturasRecibidas.tipoArchivo })
    .from(facturasRecibidas)
    .where(eq(facturasRecibidas.id, id))
  return r ?? null
}

export async function descartarRecibida(tx: Transaccion, usuarioId: string, id: string) {
  await tx
    .update(facturasRecibidas)
    .set({ estado: 'descartada', actualizado: new Date() })
    .where(and(eq(facturasRecibidas.id, id), inArray(facturasRecibidas.estado, ['lista', 'error', 'leyendo'])))
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'factura_recibida', entidadId: id })
  return { ok: true as const }
}

/**
 * Registra la compra con lo revisado por la persona (lo leído, corregido en
 * la pantalla). Si el proveedor no existe, se da de alta con el CUIT.
 */
export async function registrarRecibida(tx: Transaccion, usuarioId: string, id: string, entrada: unknown) {
  const [r] = await tx.select().from(facturasRecibidas).where(eq(facturasRecibidas.id, id)).for('update')
  // También las que no se pudieron leer: se completan a mano.
  if (!r || !['lista', 'error'].includes(r.estado))
    return { ok: false as const, error: 'Esa factura ya se registró o se descartó.' }
  const p = EsquemaLectura.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: 'Revisá los datos.' }
  const l = p.data
  const tipo = codigo(l)
  const datos = tipo ? datosTipoCompra(tipo) : null
  if (!datos || l.puntoVenta == null || l.numero == null || !l.fecha)
    return { ok: false as const, error: 'Completá la letra, el número y la fecha.' }
  const cuit = soloDigitos(l.cuitEmisor ?? '')
  if (!validarCuit(cuit).valido) return { ok: false as const, error: 'El CUIT del proveedor no es válido.' }
  let [prov] = await tx.select().from(terceros).where(eq(terceros.numeroDocumento, cuit)).limit(1)
  if (!prov) {
    ;[prov] = await tx
      .insert(terceros)
      .values({
        codigo: `PRV-${cuit}`,
        razonSocial: l.razonSocialEmisor?.trim() || `Proveedor ${cuit}`,
        esCliente: false,
        esProveedor: true,
        tipoDocumento: 80,
        numeroDocumento: cuit,
        condicionIva: datos.letra === 'A' || datos.letra === 'M' ? 1 : 6,
      })
      .returning()
    await auditar(tx, {
      usuarioId,
      accion: 'alta',
      entidad: 'tercero',
      entidadId: prov.id,
      despues: { origen: 'factura_recibida', cuit },
    })
  } else if (!prov.esProveedor) {
    await tx.update(terceros).set({ esProveedor: true }).where(eq(terceros.id, prov.id))
  }
  const precioFinal = !discriminaIva(datos.letra)
  // La IA lee el nombre de la provincia ("Buenos Aires", "CABA"); se guarda su código.
  const lista = await tx.select({ codigo: provincias.codigo, nombre: provincias.nombre }).from(provincias)
  const normal = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/^provincia de /, '')
      .trim()
  const provincia = (t: string | null) => {
    if (!t) return null
    const n = normal(t)
    if (['caba', 'capital federal', 'ciudad de buenos aires', 'ciudad autonoma de buenos aires'].includes(n))
      return lista.find((x) => x.codigo === 'C')?.codigo ?? null
    return lista.find((x) => x.codigo.toLowerCase() === n || normal(x.nombre) === n)?.codigo ?? null
  }
  const tributos = l.tributos.filter((t) => t.importe > 0).map((t) => ({ ...t, provincia: provincia(t.provincia) }))
  const totalTributos = tributos.reduce((s, t) => s.plus(String(t.importe)), new D(0))
  const res = await registrarCompra(tx, usuarioId, {
    terceroId: prov.id,
    clase: datos.clase,
    letra: datos.letra,
    fce: datos.fce,
    puntoVenta: l.puntoVenta,
    numero: l.numero,
    fecha: l.fecha,
    cae: l.cae ? soloDigitos(l.cae) || null : null,
    moneda: l.moneda,
    cotizacion: l.moneda === 'DOL' ? String(l.cotizacion ?? 0) : '1',
    iva: precioFinal
      ? [{ alicuotaIva: 3, base: aImporte(monto(String(l.total ?? 0)).minus(totalTributos)) }]
      : l.iva.map((a) => ({
          alicuotaIva: CODIGO_ALICUOTA[String(a.alicuota)] ?? 5,
          base: String(a.base),
          importe: String(a.importe),
        })),
    noGravado: precioFinal ? '0' : String(l.noGravado),
    exento: precioFinal ? '0' : String(l.exento),
    tributos: tributos.map((t) => ({ tipo: t.tipo, provincia: t.provincia, importe: String(t.importe) })),
    observaciones: 'Recibida por WhatsApp y leída con IA; revisada antes de registrar.',
  })
  if (!res.ok) return res
  await tx
    .update(facturasRecibidas)
    .set({ estado: 'registrada', compraId: res.id, proveedorId: prov.id, datos: { ...l }, actualizado: new Date() })
    .where(eq(facturasRecibidas.id, id))
  return { ok: true as const, id: res.id }
}
