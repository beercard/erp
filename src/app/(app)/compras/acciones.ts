'use server'

import { and, asc, eq, ilike, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { articulos, terceros } from '@/db/schema'
import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { aplicarNotaCredito, anularCompra, CompraInvalida, pendientesCompras, registrarCompra } from '@/modulos/compras/compras'
import { conciliar, leerMisComprobantes, registrarFaltantes, type FilaArca } from '@/modulos/compras/misComprobantes'
import { cancelarOrden, guardarOrden } from '@/modulos/compras/ordenes'
import { anularPago, chequesEnCartera, emitirPago, EsquemaPago, liquidarPago } from '@/modulos/compras/pagos'
import { cargarValoresRg830, configurarRetenciones, guardarRegimen } from '@/modulos/compras/rg830'

/** Ejecuta y convierte "sin permiso" y las validaciones que revierten en un mensaje. */
async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso || e instanceof CompraInvalida) return { ok: false, error: e.message }
    throw e
  }
}

function leerJson(texto: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(texto ?? 'null'))
  } catch {
    return null
  }
}

const conError = (ruta: string, error: string) => `${ruta}${ruta.includes('?') ? '&' : '?'}error=${encodeURIComponent(error)}`
const esUuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

export type EstadoFormulario = { error?: string; ok?: string } | undefined

// ------------------------------------------------------------- Búsquedas

export async function buscarProveedores(texto: string) {
  const q = String(texto ?? '').trim()
  if (q.length < 2) return []
  return enLaEmpresa('compras.ver', (tx) =>
    tx
      .select({
        id: terceros.id,
        codigo: terceros.codigo,
        razonSocial: terceros.razonSocial,
        numeroDocumento: terceros.numeroDocumento,
        condicionIva: terceros.condicionIva,
        esProveedor: terceros.esProveedor,
      })
      .from(terceros)
      .where(
        and(
          eq(terceros.activo, true),
          or(
            ilike(terceros.razonSocial, `%${q}%`),
            ilike(terceros.codigo, `%${q}%`),
            ilike(terceros.numeroDocumento, `%${q.replace(/\D/g, '') || q}%`),
          ),
        ),
      )
      // Primero los que ya son proveedores.
      .orderBy(asc(terceros.esProveedor), asc(terceros.razonSocial))
      .limit(12)
      .then((filas) => filas.sort((a, b) => Number(b.esProveedor) - Number(a.esProveedor))),
  )
}

export async function buscarArticulosCompra(texto: string) {
  const q = String(texto ?? '').trim()
  if (q.length < 2 || q.length > 80) return []
  return enLaEmpresa('compras.ver', (tx) =>
    tx
      .select({
        id: articulos.id,
        codigo: articulos.codigo,
        nombre: articulos.nombre,
        alicuotaIva: articulos.alicuotaIva,
        costo: articulos.costo,
        monedaCosto: articulos.monedaCosto,
        llevaStock: articulos.llevaStock,
      })
      .from(articulos)
      .where(
        and(
          eq(articulos.activo, true),
          or(ilike(articulos.nombre, `%${q}%`), ilike(articulos.codigo, `%${q}%`), eq(articulos.codigoBarras, q)),
        ),
      )
      .orderBy(asc(articulos.nombre))
      .limit(15),
  )
}

// ------------------------------------------------------------- Compras

export async function registrarCompraAccion(_: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const datos = leerJson(formData.get('compra'))
  const r = await intentar(() => enLaEmpresa('compras.cargar', (tx, s) => registrarCompra(tx, s.usuario.id, datos)))
  if (!r.ok) return { error: r.error }
  revalidatePath('/compras')
  redirect(`/compras/${r.id}?guardado=1`)
}

export async function anularCompraAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('compras.cargar', (tx, s) => anularCompra(tx, s.usuario.id, id)))
  revalidatePath(`/compras/${id}`)
  if (!r.ok) redirect(conError(`/compras/${id}`, r.error))
}

export async function aplicarNotaCreditoAccion(
  notaCreditoId: string,
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const destinos = leerJson(formData.get('aplicar'))
  if (!Array.isArray(destinos)) return { error: 'Elegí a qué factura se aplica.' }
  const r = await intentar(() =>
    enLaEmpresa('compras.cargar', (tx, s) =>
      aplicarNotaCredito(
        tx,
        s.usuario.id,
        notaCreditoId,
        destinos.filter((x) => esUuid(x?.compraId)).map((x) => ({ compraId: x.compraId, importe: String(x.importe) })),
        hoyArgentina(),
      ),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath(`/compras/${notaCreditoId}`)
  return { ok: 'Nota de crédito aplicada.' }
}

// ------------------------------------------------- Mis Comprobantes (ARCA)

export type EstadoArca =
  | {
      error?: string
      filas?: FilaArca[]
      conciliacion?: Awaited<ReturnType<typeof conciliar>>
      registrados?: number
      avisos?: string[]
    }
  | undefined

export async function leerArcaAccion(_: EstadoArca, formData: FormData): Promise<EstadoArca> {
  const archivo = formData.get('archivo')
  if (!(archivo instanceof File) || !archivo.size) return { error: 'Elegí el archivo que bajaste de Mis Comprobantes.' }
  if (archivo.size > 15 * 1024 * 1024) return { error: 'El archivo es demasiado grande (más de 15 MB).' }
  let lectura: Awaited<ReturnType<typeof leerMisComprobantes>>
  try {
    lectura = await leerMisComprobantes(new Uint8Array(await archivo.arrayBuffer()))
  } catch (e) {
    return { error: `No se pudo leer el archivo: ${(e as Error).message}` }
  }
  if (!lectura.filas.length) return { error: lectura.errores[0] ?? 'El archivo no tiene comprobantes.' }
  const r = await intentar(() => enLaEmpresa('compras.ver', (tx) => conciliar(tx, lectura.filas)))
  if ('ok' in r) return { error: r.error }
  return { filas: lectura.filas, conciliacion: r, avisos: lectura.errores }
}

export async function registrarFaltantesAccion(_: EstadoArca, formData: FormData): Promise<EstadoArca> {
  const filas = leerJson(formData.get('filas'))
  if (!Array.isArray(filas) || !filas.length) return { error: 'No hay comprobantes para registrar.' }
  const r = await intentar(() =>
    enLaEmpresa('compras.cargar', async (tx, s) => {
      const resultado = await registrarFaltantes(tx, s.usuario.id, filas as FilaArca[])
      return { ok: true as const, ...resultado, conciliacion: await conciliar(tx, filas as FilaArca[]) }
    }),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/compras')
  return { filas: filas as FilaArca[], conciliacion: r.conciliacion, registrados: r.registrados, avisos: r.errores }
}

// ----------------------------------------------------------------- Pagos

export async function pendientesProveedor(terceroId: string) {
  if (!esUuid(terceroId)) return []
  return enLaEmpresa('compras.ver', (tx) => pendientesCompras(tx, { terceroId }))
}

export async function chequesCartera() {
  return enLaEmpresa('compras.pagar', (tx) => chequesEnCartera(tx))
}

/** Vista previa del pago: retención y lo que hay que entregar. */
export async function liquidarPagoAccion(entrada: unknown) {
  const p = EsquemaPago.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Datos inválidos.' }
  return intentar(() => enLaEmpresa('compras.pagar', (tx) => liquidarPago(tx, p.data)))
}

export async function emitirPagoAccion(_: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const datos = leerJson(formData.get('pago'))
  const r = await intentar(() => enLaEmpresa('compras.pagar', (tx, s) => emitirPago(tx, s.usuario.id, datos)))
  if (!r.ok) return { error: r.error }
  revalidatePath('/pagos')
  redirect(`/pagos/${r.id}?guardado=1`)
}

export async function anularPagoAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('compras.pagar', (tx, s) => anularPago(tx, s.usuario.id, id)))
  revalidatePath(`/pagos/${id}`)
  if (!r.ok) redirect(conError(`/pagos/${id}`, r.error))
}

// ------------------------------------------------------ Órdenes de compra

export async function guardarOrdenAccion(id: string | null, _: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const datos = leerJson(formData.get('orden'))
  const r = await intentar(() => enLaEmpresa('compras.cargar', (tx, s) => guardarOrden(tx, s.usuario.id, datos, id ?? undefined)))
  if (!r.ok) return { error: r.error }
  revalidatePath('/ordenes-compra')
  redirect(`/ordenes-compra/${r.id}?guardado=1`)
}

export async function cancelarOrdenAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('compras.cargar', (tx, s) => cancelarOrden(tx, s.usuario.id, id)))
  revalidatePath(`/ordenes-compra/${id}`)
  if (!r.ok) redirect(conError(`/ordenes-compra/${id}`, r.error))
}

// ------------------------------------------------- Retenciones (configuración)

export async function activarGananciasAccion(_: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const activa = formData.get('activa') === 'on'
  const r = await intentar(() =>
    enLaEmpresa('empresa.datos', async (tx, s) => {
      await configurarRetenciones(tx, s.usuario.id, activa)
      return { ok: true as const }
    }),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/configuracion/retenciones')
  return { ok: activa ? 'Se retiene Ganancias en los pagos.' : 'La retención de Ganancias quedó apagada.' }
}

export async function cargarRg830Accion() {
  const r = await intentar(() =>
    enLaEmpresa('empresa.datos', async (tx, s) => {
      await cargarValoresRg830(tx, s.usuario.id)
      return { ok: true as const }
    }),
  )
  revalidatePath('/configuracion/retenciones')
  if (!r.ok) redirect(conError('/configuracion/retenciones', r.error))
  redirect('/configuracion/retenciones?cargado=1')
}

export async function guardarRegimenAccion(_: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const valor = (k: string) => String(formData.get(k) ?? '')
  const r = await intentar(() =>
    enLaEmpresa('empresa.datos', (tx, s) =>
      guardarRegimen(tx, s.usuario.id, {
        codigo: valor('codigo'),
        concepto: valor('concepto'),
        alicuotaInscripto: valor('alicuotaInscripto'),
        alicuotaNoInscripto: valor('alicuotaNoInscripto'),
        minimoNoSujeto: valor('minimoNoSujeto'),
        minimoRetencion: valor('minimoRetencion'),
        usaEscala: formData.get('usaEscala') === 'on',
        activo: formData.get('activo') === 'on',
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/configuracion/retenciones')
  return { ok: 'Régimen guardado.' }
}
