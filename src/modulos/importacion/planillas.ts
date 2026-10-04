import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { articulos, compras, comprobantes, depositos, listasPrecios, marcas, provincias, rubros, terceros } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { validarCuit } from '../../lib/cuit'
import { aImporte, monto } from '../../lib/dinero'
import { hoyArgentina } from '../../lib/fechas'
import { ajustarStock } from '../comercial/stock'
import { alicuotaDesdeTexto } from '../facturacion/automatica'
import { clave, fechaDePlanilla, numeroDePlanilla } from '../facturacion/externa'
import { fijarPrecio, guardarArticulo } from '../maestros/articulo'
import { guardarTercero, obtenerTercero } from '../maestros/terceros'

/**
 * Importación desde planillas (xlsx o csv) para arrancar con el sistema:
 * clientes y proveedores, artículos con precio y stock inicial, y saldos
 * iniciales de cuentas corrientes. Cada importación tiene dos pasos: leer
 * (valida fila por fila y dice qué se da de alta y qué se actualiza, sin
 * tocar nada) e importar (aplica lo válido; cada fila en su propio punto de
 * guardado, así una que falla no frena al resto).
 */

export type ErrorFila = { fila: number; error: string }
export type Lectura<T> = { filas: { fila: number; datos: T }[]; errores: ErrorFila[] }
export type Resultado = { altas: number; actualizados: number; errores: ErrorFila[] }

/** Toma el valor de la primera columna que coincida con alguno de los nombres. */
function campo(r: Record<string, string>, ...nombres: string[]) {
  for (const [k, v] of Object.entries(r)) if (nombres.includes(clave(k))) return String(v ?? '').trim()
  return ''
}

const soloDigitos = (v: string) => v.replace(/\D/g, '')

/**
 * Los esquemas de cliente y de artículo son los de los formularios: un campo
 * vacío llega como texto vacío o no llega, nunca como null. Sin los null, en
 * una actualización lo que no viene conserva lo que había.
 */
const sinNulos = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined))

/**
 * Corre una fila en su propio punto de guardado: si falla algo inesperado, se
 * deshace solo esa fila y la importación sigue con las demás.
 */
async function enFila(tx: Transaccion, fila: number, r: Resultado, trabajo: (tx: Transaccion) => Promise<void>) {
  try {
    await tx.transaction(trabajo)
  } catch (e) {
    r.errores.push({ fila, error: `No se pudo guardar: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}` })
  }
}

function condicionIva(v: string): number | null {
  const t = clave(v)
  if (!t) return null
  if (['1', 'ri', 'responsable_inscripto', 'inscripto'].includes(t)) return 1
  if (['4', 'exento', 'iva_exento'].includes(t)) return 4
  if (['5', 'cf', 'consumidor_final', 'final'].includes(t)) return 5
  if (['6', 'monotributo', 'monotributista', 'mono', 'responsable_monotributo'].includes(t)) return 6
  return -1
}

// ------------------------------------------------------- Clientes y proveedores

export type TerceroPlanilla = {
  codigo: string | null
  razonSocial: string
  documento: string | null
  condicionIva: number
  esCliente: boolean
  esProveedor: boolean
  email: string | null
  telefono: string | null
  domicilio: string | null
  localidad: string | null
  codigoPostal: string | null
  provincia: string | null
}

export function leerTerceros(registros: Record<string, string>[]): Lectura<TerceroPlanilla> {
  const filas: Lectura<TerceroPlanilla>['filas'] = []
  const errores: ErrorFila[] = []
  const vistos = new Set<string>()
  registros.forEach((r, i) => {
    const fila = i + 2
    const razonSocial = campo(r, 'razon_social', 'nombre', 'cliente', 'proveedor')
    const documento = soloDigitos(campo(r, 'cuit', 'dni', 'cuit_dni', 'documento')) || null
    const condicion = condicionIva(campo(r, 'condicion_iva', 'condicion', 'iva'))
    const tipo = clave(campo(r, 'tipo', 'es'))
    if (!razonSocial) return errores.push({ fila, error: 'Falta la razón social.' })
    if (documento && documento.length !== 11 && (documento.length < 7 || documento.length > 8))
      return errores.push({ fila, error: `El documento ${documento} no es un CUIT (11 dígitos) ni un DNI.` })
    if (documento?.length === 11 && !validarCuit(documento).valido)
      return errores.push({ fila, error: `El CUIT ${documento} no es válido (revisá el dígito verificador).` })
    if (condicion === -1)
      return errores.push({ fila, error: 'Condición de IVA desconocida: RI, Monotributo, Exento o Consumidor final.' })
    if (documento && vistos.has(documento))
      return errores.push({ fila, error: `El documento ${documento} está repetido en la planilla.` })
    if (documento) vistos.add(documento)
    const email = campo(r, 'email', 'correo') || null
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return errores.push({ fila, error: `El email ${email} no es válido.` })
    filas.push({
      fila,
      datos: {
        codigo: campo(r, 'codigo') || null,
        razonSocial,
        documento,
        condicionIva: condicion ?? (documento?.length === 11 ? 1 : 5),
        esCliente: tipo !== 'proveedor',
        esProveedor: tipo === 'proveedor' || tipo === 'ambos' || tipo === 'cliente_y_proveedor',
        email,
        telefono: campo(r, 'telefono', 'celular') || null,
        domicilio: campo(r, 'domicilio', 'direccion') || null,
        localidad: campo(r, 'localidad', 'ciudad') || null,
        codigoPostal: campo(r, 'codigo_postal', 'cp') || null,
        provincia: campo(r, 'provincia') || null,
      },
    })
  })
  return { filas, errores }
}

/** El tercero ya cargado con ese documento (o código), para saber si es alta o actualización. */
async function terceroExistente(tx: Transaccion, d: { documento: string | null; codigo: string | null }) {
  if (d.documento) {
    const [t] = await tx.select({ id: terceros.id }).from(terceros).where(eq(terceros.numeroDocumento, d.documento)).limit(1)
    if (t) return t.id
  }
  if (d.codigo) {
    const [t] = await tx.select({ id: terceros.id }).from(terceros).where(eq(terceros.codigo, d.codigo)).limit(1)
    if (t) return t.id
  }
  return null
}

/** Cuántas filas son altas y cuántas actualizaciones (para la vista previa). */
export async function contarTerceros(tx: Transaccion, l: Lectura<TerceroPlanilla>) {
  let actualizaciones = 0
  for (const f of l.filas) if (await terceroExistente(tx, f.datos)) actualizaciones++
  return { altas: l.filas.length - actualizaciones, actualizaciones }
}

export async function importarTerceros(tx: Transaccion, usuarioId: string, l: Lectura<TerceroPlanilla>): Promise<Resultado> {
  const provs = await tx.select().from(provincias)
  const provincia = (v: string | null) =>
    v ? (provs.find((p) => p.codigo === v.toUpperCase() || clave(p.nombre) === clave(v))?.codigo ?? null) : null
  const r: Resultado = { altas: 0, actualizados: 0, errores: [...l.errores] }
  for (const { fila, datos: d } of l.filas)
    await enFila(tx, fila, r, async (tx) => {
      const id = await terceroExistente(tx, d)
      const anterior = id ? await obtenerTercero(tx, id) : null
      // Lo que trae la planilla pisa lo cargado; lo que viene vacío, se conserva.
      const base = anterior ? { ...anterior } : {}
      const entrada = {
        ...base,
        codigo: d.codigo ?? anterior?.codigo ?? undefined,
        razonSocial: d.razonSocial,
        esCliente: anterior ? anterior.esCliente || d.esCliente : d.esCliente,
        esProveedor: anterior ? anterior.esProveedor || d.esProveedor : d.esProveedor,
        tipoDocumento: d.documento ? (d.documento.length === 11 ? 80 : 96) : (anterior?.tipoDocumento ?? 99),
        numeroDocumento: d.documento ?? anterior?.numeroDocumento ?? null,
        condicionIva: d.condicionIva,
        email: d.email ?? anterior?.email ?? '',
        telefono: d.telefono ?? anterior?.telefono ?? null,
        domicilio: d.domicilio ?? anterior?.domicilio ?? null,
        localidad: d.localidad ?? anterior?.localidad ?? null,
        codigoPostal: d.codigoPostal ?? anterior?.codigoPostal ?? null,
        provincia: provincia(d.provincia) ?? anterior?.provincia ?? null,
      }
      const g = await guardarTercero(tx, usuarioId, sinNulos(entrada), id ?? undefined)
      if (g.ok) {
        if (id) r.actualizados++
        else r.altas++
      } else
        r.errores.push({
          fila,
          error:
            g.mensaje ??
            Object.entries(g.errores)
              .map(([k, v]) => k + ': ' + v)
              .join(' | '),
        })
    })
  r.errores.sort((a, b) => a.fila - b.fila)
  return r
}

// ------------------------------------------------------------------ Artículos

export type ArticuloPlanilla = {
  codigo: string
  nombre: string
  tipo: 'producto' | 'servicio'
  unidad: string | null
  alicuotaIva: number | null
  costo: string | null
  monedaCosto: 'PES' | 'DOL' | null
  precio: string | null
  rubro: string | null
  marca: string | null
  codigoBarras: string | null
  stockMinimo: string | null
  stock: string | null
  descripcion: string | null
}

const decimalValido = (v: string) => /^-?\d+(\.\d{1,4})?$/.test(v)

export function leerArticulos(registros: Record<string, string>[]): Lectura<ArticuloPlanilla> {
  const filas: Lectura<ArticuloPlanilla>['filas'] = []
  const errores: ErrorFila[] = []
  const vistos = new Set<string>()
  registros.forEach((r, i) => {
    const fila = i + 2
    const codigo = campo(r, 'codigo', 'sku')
    const nombre = campo(r, 'nombre', 'descripcion_corta', 'articulo', 'producto')
    if (!codigo) return errores.push({ fila, error: 'Falta el código.' })
    if (!nombre) return errores.push({ fila, error: 'Falta el nombre.' })
    if (vistos.has(codigo.toLowerCase()))
      return errores.push({ fila, error: `El código ${codigo} está repetido en la planilla.` })
    vistos.add(codigo.toLowerCase())
    const numeros: Record<string, string | null> = {}
    for (const [k, nombres] of Object.entries({
      costo: ['costo'],
      precio: ['precio', 'precio_venta', 'precio_lista'],
      stockMinimo: ['stock_minimo', 'minimo'],
      stock: ['stock', 'stock_inicial', 'cantidad'],
    })) {
      const v = campo(r, ...nombres)
      if (!v) {
        numeros[k] = null
        continue
      }
      const n = numeroDePlanilla(v)
      if (!decimalValido(n)) return errores.push({ fila, error: `"${v}" no es un número válido (${k}).` })
      numeros[k] = n
    }
    if (errores.at(-1)?.fila === fila) return
    const ivaTexto = campo(r, 'iva', 'alicuota', 'alicuota_iva')
    const alicuotaIva = ivaTexto ? alicuotaDesdeTexto(numeroDePlanilla(ivaTexto)) : null
    if (ivaTexto && alicuotaIva === null) return errores.push({ fila, error: `IVA ${ivaTexto} %: va 0, 2.5, 5, 10.5, 21 o 27.` })
    const moneda = campo(r, 'moneda', 'moneda_costo').toUpperCase()
    filas.push({
      fila,
      datos: {
        codigo,
        nombre,
        tipo: clave(campo(r, 'tipo')).startsWith('servicio') ? 'servicio' : 'producto',
        unidad: campo(r, 'unidad') || null,
        alicuotaIva,
        costo: numeros.costo,
        monedaCosto: moneda ? (['DOL', 'USD', 'US$', 'U$S'].includes(moneda) ? 'DOL' : 'PES') : null,
        precio: numeros.precio,
        rubro: campo(r, 'rubro', 'categoria') || null,
        marca: campo(r, 'marca') || null,
        codigoBarras: campo(r, 'codigo_barras', 'ean', 'barras') || null,
        stockMinimo: numeros.stockMinimo,
        stock: numeros.stock,
        descripcion: campo(r, 'descripcion', 'detalle') || null,
      },
    })
  })
  return { filas, errores }
}

export async function contarArticulos(tx: Transaccion, l: Lectura<ArticuloPlanilla>) {
  const codigos = l.filas.map((f) => f.datos.codigo)
  const existentes = codigos.length
    ? await tx.select({ codigo: articulos.codigo }).from(articulos).where(inArray(articulos.codigo, codigos))
    : []
  const actualizaciones = new Set(existentes.map((a) => a.codigo)).size
  return { altas: l.filas.length - actualizaciones, actualizaciones }
}

/** Rubro o marca por nombre; si no está, se crea. */
async function idPorNombre(tx: Transaccion, tabla: 'rubro' | 'marca', nombre: string | null, cache: Map<string, string>) {
  if (!nombre) return null
  const k = `${tabla}:${clave(nombre)}`
  if (cache.has(k)) return cache.get(k)!
  if (tabla === 'rubro') {
    const todos = await tx.select({ id: rubros.id, nombre: rubros.nombre }).from(rubros)
    const r = todos.find((x) => clave(x.nombre) === clave(nombre))
    const id = r?.id ?? (await tx.insert(rubros).values({ nombre }).returning({ id: rubros.id }))[0].id
    cache.set(k, id)
    return id
  }
  const todas = await tx.select({ id: marcas.id, nombre: marcas.nombre }).from(marcas)
  const m = todas.find((x) => clave(x.nombre) === clave(nombre))
  const id = m?.id ?? (await tx.insert(marcas).values({ nombre }).returning({ id: marcas.id }))[0].id
  cache.set(k, id)
  return id
}

export async function importarArticulos(
  tx: Transaccion,
  usuarioId: string,
  l: Lectura<ArticuloPlanilla>,
  hoy = hoyArgentina(),
): Promise<Resultado> {
  const r: Resultado = { altas: 0, actualizados: 0, errores: [...l.errores] }
  const cache = new Map<string, string>()
  // La lista general: la primera que no deriva de otra.
  const [lista] = await tx
    .select({ id: listasPrecios.id })
    .from(listasPrecios)
    .where(isNull(listasPrecios.listaBaseId))
    .orderBy(asc(listasPrecios.codigo))
    .limit(1)
  const [deposito] = await tx
    .select({ id: depositos.id })
    .from(depositos)
    .where(eq(depositos.activo, true))
    .orderBy(asc(depositos.codigo))
    .limit(1)
  for (const { fila, datos: d } of l.filas)
    await enFila(tx, fila, r, async (tx) => {
      const [anterior] = await tx.select().from(articulos).where(eq(articulos.codigo, d.codigo)).limit(1)
      const servicio = d.tipo === 'servicio'
      const entrada = {
        codigo: d.codigo,
        nombre: d.nombre,
        descripcion: d.descripcion ?? anterior?.descripcion ?? '',
        tipo: d.tipo,
        rubroId: (await idPorNombre(tx, 'rubro', d.rubro, cache)) ?? anterior?.rubroId ?? null,
        marcaId: (await idPorNombre(tx, 'marca', d.marca, cache)) ?? anterior?.marcaId ?? null,
        unidad: d.unidad ?? anterior?.unidad ?? 'unidad',
        alicuotaIva: d.alicuotaIva ?? anterior?.alicuotaIva ?? 5,
        llevaStock: anterior ? anterior.llevaStock && !servicio : !servicio,
        llevaSerie: anterior?.llevaSerie ?? false,
        codigoBarras: d.codigoBarras ?? anterior?.codigoBarras ?? '',
        costo: d.costo ?? anterior?.costo ?? '0',
        monedaCosto: d.monedaCosto ?? anterior?.monedaCosto ?? 'PES',
        stockMinimo: d.stockMinimo ?? anterior?.stockMinimo ?? '0',
        loteReposicion: anterior?.loteReposicion ?? '0',
        proveedorId: anterior?.proveedorId ?? null,
        codigoCot: anterior?.codigoCot ?? null,
        unidadCot: anterior?.unidadCot ?? null,
      }
      const g = await guardarArticulo(tx, usuarioId, sinNulos(entrada), anterior?.id)
      if (!g.ok) {
        r.errores.push({
          fila,
          error:
            g.mensaje ??
            Object.entries(g.errores)
              .map(([k, v]) => k + ': ' + v)
              .join(' | '),
        })
        return
      }
      if (d.precio && lista) {
        const p = await fijarPrecio(tx, usuarioId, g.id, lista.id, { precio: d.precio, desde: hoy })
        if (!p.ok) r.errores.push({ fila, error: `Precio: ${p.error}` })
      }
      // El stock inicial solo entra en las altas: en una actualización se ajusta desde Stock.
      if (!anterior && d.stock && Number(d.stock) !== 0 && entrada.llevaStock && deposito) {
        const a = await ajustarStock(tx, usuarioId, {
          articuloId: g.id,
          depositoId: deposito.id,
          cantidad: d.stock,
          motivo: 'Stock inicial (importación)',
        })
        if (!a.ok) r.errores.push({ fila, error: `Stock: ${a.error}` })
      }
      if (anterior) r.actualizados++
      else r.altas++
    })
  r.errores.sort((a, b) => a.fila - b.fila)
  return r
}

// ------------------------------------------------------------ Saldos iniciales

export type SaldoPlanilla = {
  documento: string
  cuenta: 'cliente' | 'proveedor'
  /** Positivo: nos debe (cliente) o le debemos (proveedor). Negativo: a favor del tercero. */
  importe: string
  fecha: string | null
  vencimiento: string | null
  detalle: string | null
}

export function leerSaldos(registros: Record<string, string>[]): Lectura<SaldoPlanilla> {
  const filas: Lectura<SaldoPlanilla>['filas'] = []
  const errores: ErrorFila[] = []
  registros.forEach((r, i) => {
    const fila = i + 2
    const documento = soloDigitos(campo(r, 'cuit', 'dni', 'cuit_dni', 'documento'))
    const importe = numeroDePlanilla(campo(r, 'saldo', 'importe', 'monto'))
    const fecha = fechaDePlanilla(campo(r, 'fecha')) ?? null
    const vencimiento = fechaDePlanilla(campo(r, 'vencimiento', 'vence')) ?? null
    if (!documento) return errores.push({ fila, error: 'Falta el CUIT o DNI.' })
    if (!decimalValido(importe) || Number(importe) === 0)
      return errores.push({ fila, error: 'El saldo tiene que ser un número distinto de cero.' })
    for (const f of [fecha, vencimiento])
      if (f && !/^\d{4}-\d{2}-\d{2}$/.test(f)) return errores.push({ fila, error: `La fecha ${f} no se entiende (DD/MM/AAAA).` })
    filas.push({
      fila,
      datos: {
        documento,
        cuenta: clave(campo(r, 'cuenta', 'tipo')).startsWith('prov') ? 'proveedor' : 'cliente',
        importe,
        fecha,
        vencimiento,
        detalle: campo(r, 'detalle', 'observaciones', 'concepto') || null,
      },
    })
  })
  return { filas, errores }
}

/** Siguiente número interno para los saldos iniciales (tipo 0, sin valor fiscal). */
async function siguienteNumero(tx: Transaccion, tabla: 'ventas' | 'compras') {
  const t = tabla === 'ventas' ? comprobantes : compras
  const [r] = await tx
    .select({ n: sql<number>`coalesce(max(${t.numero}), 0)::int` })
    .from(t)
    .where(and(eq(t.tipo, 0), eq(t.puntoVenta, 0)))
  return r.n + 1
}

/**
 * Carga cada saldo como un comprobante de saldo inicial (tipo 0, letra X): no
 * va al Libro IVA ni a la contabilidad (ya están en los registros anteriores)
 * y se cancela con cobranzas, pagos o notas como cualquier otro. Un tercero
 * que ya tiene un saldo importado no recibe otro (importar dos veces la misma
 * planilla duplicaría la deuda).
 */
export async function importarSaldos(
  tx: Transaccion,
  usuarioId: string,
  l: Lectura<SaldoPlanilla>,
  hoy = hoyArgentina(),
): Promise<Resultado> {
  const r: Resultado = { altas: 0, actualizados: 0, errores: [...l.errores] }
  let numVentas = await siguienteNumero(tx, 'ventas')
  let numCompras = await siguienteNumero(tx, 'compras')
  for (const { fila, datos: d } of l.filas)
    await enFila(tx, fila, r, async (tx) => {
      const [t] = await tx
        .select()
        .from(terceros)
        .where(
          and(
            eq(terceros.numeroDocumento, d.documento),
            d.cuenta === 'cliente' ? eq(terceros.esCliente, true) : eq(terceros.esProveedor, true),
          ),
        )
        .limit(1)
      if (!t) {
        r.errores.push({ fila, error: `No hay un ${d.cuenta} con documento ${d.documento}: importalo primero.` })
        return
      }
      const tabla = d.cuenta === 'cliente' ? comprobantes : compras
      const [ya] = await tx
        .select({ id: tabla.id })
        .from(tabla)
        .where(and(eq(tabla.terceroId, t.id), eq(tabla.origen, 'planilla')))
        .limit(1)
      if (ya) {
        r.errores.push({ fila, error: `${t.razonSocial} ya tiene un saldo inicial importado.` })
        return
      }
      const saldo = monto(d.importe)
      const importe = aImporte(saldo.abs())
      const clase = saldo.gt(0) ? 'factura' : 'nota_credito'
      const fecha = d.fecha ?? hoy
      const observaciones = `Saldo inicial importado de planilla${d.detalle ? `: ${d.detalle}` : '.'}`
      if (d.cuenta === 'cliente') {
        await tx.insert(comprobantes).values({
          clase,
          letra: 'X',
          tipo: 0,
          puntoVenta: 0,
          numero: numVentas++,
          fecha,
          estado: 'autorizado',
          origen: 'planilla',
          terceroId: t.id,
          receptorNombre: t.razonSocial,
          receptorDocTipo: t.tipoDocumento,
          receptorDocNumero: t.numeroDocumento,
          receptorCondicionIva: t.condicionIva,
          vencimiento: d.vencimiento,
          noGravado: importe,
          total: importe,
          observaciones,
          usuarioId,
          autorizado: new Date(),
        })
      } else {
        await tx.insert(compras).values({
          clase,
          letra: 'X',
          tipo: 0,
          puntoVenta: 0,
          numero: numCompras++,
          fecha,
          periodoIva: fecha.slice(0, 7),
          terceroId: t.id,
          vencimiento: d.vencimiento,
          noGravado: importe,
          total: importe,
          origen: 'planilla',
          observaciones,
          usuarioId,
        })
      }
      r.altas++
    })
  await auditar(tx, {
    usuarioId,
    accion: 'importacion',
    entidad: 'saldos_iniciales',
    despues: { importados: r.altas, conError: r.errores.length },
  })
  r.errores.sort((a, b) => a.fila - b.fila)
  return r
}
