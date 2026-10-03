import { eq } from 'drizzle-orm'
import { z } from 'zod'

import type { Transaccion } from '../../db/conexion'
import { comprobantes, terceros } from '../../db/schema'
import { enlaceDeComprobante } from '../../lib/enlaces'
import { alicuotaDesdeTexto, EsquemaClienteExterno, type FacturaDeLote } from './automatica'

/**
 * Lo que se recibe de afuera (API o planilla) para facturar, en un formato
 * simple: el cliente por su CUIT o DNI y el IVA en porcentaje (21, 10.5…).
 */

const fecha = z.iso.date({ error: 'Las fechas van como AAAA-MM-DD.' })

export const EsquemaRenglonExterno = z.object({
  descripcion: z.string().trim().min(1, { error: 'Cada renglón necesita una descripción.' }).max(500),
  cantidad: z.coerce.number().positive({ error: 'La cantidad tiene que ser mayor que cero.' }),
  /** Sin IVA. */
  precioUnitario: z.coerce.number().min(0, { error: 'El precio no puede ser negativo.' }),
  /** Porcentaje de IVA: 0, 2.5, 5, 10.5, 21 o 27. */
  iva: z
    .union([z.number(), z.string()])
    .default(21)
    .transform((v, ctx) => {
      const c = alicuotaDesdeTexto(v)
      if (c == null) ctx.addIssue({ code: 'custom', message: `IVA ${v} %: va 0, 2.5, 5, 10.5, 21 o 27.` })
      return c ?? 5
    }),
  descuento: z.coerce.number().min(0).max(100).optional(),
  articuloId: z.uuid().optional().nullable(),
})

export const EsquemaFacturaExterna = z.object({
  referencia: z.string().trim().min(1).max(100).optional().nullable(),
  cliente: EsquemaClienteExterno,
  fecha: fecha.optional(),
  /** 1 productos, 2 servicios, 3 productos y servicios. */
  concepto: z.coerce.number().int().min(1).max(3).default(1),
  servicioDesde: fecha.optional().nullable(),
  servicioHasta: fecha.optional().nullable(),
  vencimiento: fecha.optional().nullable(),
  observaciones: z.string().trim().max(1000).optional().nullable(),
  renglones: z.array(EsquemaRenglonExterno).min(1, { error: 'Agregá al menos un renglón.' }).max(100),
})
export type FacturaExterna = z.infer<typeof EsquemaFacturaExterna>

export const aFacturaDeLote = (f: FacturaExterna): FacturaDeLote => ({
  ...f,
  renglones: f.renglones.map((r) => ({
    articuloId: r.articuloId ?? null,
    descripcion: r.descripcion,
    cantidad: String(r.cantidad),
    precioUnitario: String(r.precioUnitario),
    ...(r.descuento ? { descuento: String(r.descuento) } : {}),
    alicuotaIva: r.iva,
  })),
})

/** Cómo devuelve la API una factura. */
export async function facturaParaApi(tx: Transaccion, empresaId: string, id: string) {
  const [f] = await tx
    .select({
      id: comprobantes.id,
      referencia: comprobantes.referenciaExterna,
      estado: comprobantes.estado,
      clase: comprobantes.clase,
      tipo: comprobantes.tipo,
      letra: comprobantes.letra,
      puntoVenta: comprobantes.puntoVenta,
      numero: comprobantes.numero,
      fecha: comprobantes.fecha,
      concepto: comprobantes.concepto,
      vencimiento: comprobantes.vencimiento,
      cae: comprobantes.cae,
      caeVence: comprobantes.caeVence,
      neto: comprobantes.neto,
      iva: comprobantes.iva,
      total: comprobantes.total,
      clienteId: terceros.id,
      cliente: terceros.razonSocial,
      documento: terceros.numeroDocumento,
    })
    .from(comprobantes)
    .innerJoin(terceros, eq(terceros.id, comprobantes.terceroId))
    .where(eq(comprobantes.id, id))
  if (!f) return null
  const { clienteId, cliente, documento, ...resto } = f
  return {
    ...resto,
    cliente: { id: clienteId, razonSocial: cliente, documento },
    enlace: f.estado === 'autorizado' ? enlaceDeComprobante(empresaId, f.id) : null,
  }
}

/** El primer error de validación, con el campo, para la respuesta de la API. */
export const errorDeValidacion = (e: z.ZodError) => {
  const i = e.issues[0]
  return `${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}`
}

// ---------------------------------------------------------------- Planillas

/** Columnas que se reconocen (sin tildes, en minúscula) y su campo. */
const COLUMNAS: Record<string, string> = {
  factura: 'grupo',
  grupo: 'grupo',
  nro: 'grupo',
  numero: 'grupo',
  referencia: 'referencia',
  cuit: 'documento',
  dni: 'documento',
  cuit_dni: 'documento',
  documento: 'documento',
  razon_social: 'razonSocial',
  cliente: 'razonSocial',
  nombre: 'razonSocial',
  condicion_iva: 'condicionIva',
  condicion: 'condicionIva',
  iva_cliente: 'condicionIva',
  email: 'email',
  correo: 'email',
  domicilio: 'domicilio',
  fecha: 'fecha',
  concepto: 'concepto',
  servicio_desde: 'servicioDesde',
  desde: 'servicioDesde',
  servicio_hasta: 'servicioHasta',
  hasta: 'servicioHasta',
  vencimiento: 'vencimiento',
  observaciones: 'observaciones',
  descripcion: 'descripcion',
  detalle: 'descripcion',
  producto: 'descripcion',
  cantidad: 'cantidad',
  precio: 'precioUnitario',
  precio_unitario: 'precioUnitario',
  importe: 'precioUnitario',
  iva: 'iva',
  alicuota: 'iva',
  alicuota_iva: 'iva',
  descuento: 'descuento',
}

const clave = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

/** "1.234,56" o "1234.56" → "1234.56". */
export function numeroDePlanilla(v: string) {
  const t = v.replace(/[$\s]/g, '')
  if (t.includes(',') && t.includes('.')) return t.replace(/\./g, '').replace(',', '.')
  return t.replace(',', '.')
}

/** AAAA-MM-DD, DD/MM/AAAA o el número de serie de Excel → AAAA-MM-DD. */
export function fechaDePlanilla(v: string): string | undefined {
  const t = v.trim()
  if (!t) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000)
    return d.toISOString().slice(0, 10)
  }
  return t
}

function condicionDePlanilla(v: string): number | undefined {
  const t = clave(v)
  if (!t) return undefined
  if (['1', 'ri', 'responsable_inscripto', 'inscripto'].includes(t)) return 1
  if (['4', 'exento', 'iva_exento'].includes(t)) return 4
  if (['5', 'cf', 'consumidor_final', 'final'].includes(t)) return 5
  if (['6', 'monotributo', 'monotributista', 'mono', 'responsable_monotributo'].includes(t)) return 6
  return Number(t) || undefined
}

function conceptoDePlanilla(v: string): number | undefined {
  const t = clave(v)
  if (!t) return undefined
  if (t.startsWith('servicio') || t === '2') return 2
  if (t.includes('y') || t === '3') return 3
  return 1
}

/** Una planilla como lista de registros { columna: valor } a partir de filas (la primera es la cabecera). */
export function registrosDeFilas(filas: string[][]): Record<string, string>[] {
  const [cabecera, ...resto] = filas
  if (!cabecera) return []
  return resto
    .filter((f) => f.some((c) => String(c ?? '').trim()))
    .map((f) => Object.fromEntries(cabecera.map((n, i) => [n, String(f[i] ?? '')])))
}

/**
 * Lee una planilla de facturas: un renglón por fila. Las filas con el mismo
 * valor en "factura" (o en "referencia") van a la misma factura; sin esas
 * columnas, cada fila es una factura. Devuelve las facturas válidas y los
 * errores con el número de fila (contando la cabecera como la 1).
 */
export function leerPlanillaFacturas(registros: Record<string, string>[]) {
  const errores: { fila: number; error: string }[] = []
  if (!registros.length) return { facturas: [], errores: [{ fila: 1, error: 'La planilla está vacía.' }] }
  const campos = Object.keys(registros[0]).map((c) => COLUMNAS[clave(c)])
  if (!campos.includes('documento')) errores.push({ fila: 1, error: 'Falta la columna "cuit" (o "dni").' })
  if (!campos.includes('descripcion')) errores.push({ fila: 1, error: 'Falta la columna "descripcion".' })
  if (!campos.includes('precioUnitario')) errores.push({ fila: 1, error: 'Falta la columna "precio".' })
  if (errores.length) return { facturas: [], errores }

  const grupos = new Map<string, { fila: number; d: Record<string, string> }[]>()
  registros.forEach((r, i) => {
    const d: Record<string, string> = {}
    for (const [k, v] of Object.entries(r)) {
      const campo = COLUMNAS[clave(k)]
      if (campo && !d[campo]) d[campo] = String(v ?? '').trim()
    }
    const k = d.grupo || d.referencia || `#${i}`
    grupos.set(k, [...(grupos.get(k) ?? []), { fila: i + 2, d }])
  })

  const facturas: { filas: number[]; factura: FacturaExterna }[] = []
  for (const filas of grupos.values()) {
    const p0 = filas[0].d
    const p = EsquemaFacturaExterna.safeParse({
      referencia: p0.referencia || null,
      cliente: {
        documento: p0.documento ?? '',
        razonSocial: p0.razonSocial || null,
        condicionIva: condicionDePlanilla(p0.condicionIva ?? '') ?? null,
        email: p0.email || null,
        domicilio: p0.domicilio || null,
      },
      fecha: fechaDePlanilla(p0.fecha ?? ''),
      concepto: conceptoDePlanilla(p0.concepto ?? '') ?? 1,
      servicioDesde: fechaDePlanilla(p0.servicioDesde ?? '') ?? null,
      servicioHasta: fechaDePlanilla(p0.servicioHasta ?? '') ?? null,
      vencimiento: fechaDePlanilla(p0.vencimiento ?? '') ?? null,
      observaciones: p0.observaciones || null,
      renglones: filas.map(({ d }) => ({
        descripcion: d.descripcion ?? '',
        cantidad: d.cantidad ? numeroDePlanilla(d.cantidad) : 1,
        precioUnitario: numeroDePlanilla(d.precioUnitario ?? ''),
        iva: d.iva ? numeroDePlanilla(d.iva) : 21,
        descuento: d.descuento ? numeroDePlanilla(d.descuento) : undefined,
      })),
    })
    if (p.success) facturas.push({ filas: filas.map((f) => f.fila), factura: p.data })
    else errores.push({ fila: filas[0].fila, error: errorDeValidacion(p.error) })
  }
  return { facturas, errores }
}
