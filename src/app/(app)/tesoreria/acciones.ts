'use server'

import { asc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { cuentasTesoreria } from '@/db/schema'
import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { normalizarNumero } from '@/lib/dinero'
import { anularDeposito, depositarCheques, rechazarCheque } from '@/modulos/tesoreria/cheques'
import {
  conciliar,
  conciliarVarias,
  desconciliar,
  importarExtracto,
  leerExtracto,
  type Sugerencia,
} from '@/modulos/tesoreria/conciliacion'
import { guardarCuenta } from '@/modulos/tesoreria/cuentas'
import {
  acreditarCupones,
  anularMovimiento,
  arquear,
  cargarSaldoInicial,
  registrarMovimiento,
  transferir,
} from '@/modulos/tesoreria/movimientos'

async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
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

const valor = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

export type Estado = { error?: string; ok?: string } | undefined

/** Cuentas activas para los desplegables de cobranzas y pagos. */
export async function cuentasParaValores() {
  return enLaEmpresa('ventas.ver', (tx) =>
    tx
      .select({
        id: cuentasTesoreria.id,
        nombre: cuentasTesoreria.nombre,
        tipo: cuentasTesoreria.tipo,
        moneda: cuentasTesoreria.moneda,
        mediosPredeterminados: cuentasTesoreria.mediosPredeterminados,
      })
      .from(cuentasTesoreria)
      .where(eq(cuentasTesoreria.activa, true))
      .orderBy(asc(cuentasTesoreria.tipo), asc(cuentasTesoreria.nombre)),
  )
}

// ----------------------------------------------------------------- Cuentas

export async function guardarCuentaAccion(id: string | null, _: Estado, formData: FormData): Promise<Estado> {
  const datos = {
    codigo: valor(formData, 'codigo').toUpperCase(),
    nombre: valor(formData, 'nombre'),
    tipo: valor(formData, 'tipo'),
    moneda: valor(formData, 'moneda') || 'PES',
    banco: valor(formData, 'banco'),
    numeroCuenta: valor(formData, 'numeroCuenta'),
    cbu: valor(formData, 'cbu'),
    mediosPredeterminados: formData.getAll('medios').map(String),
    activa: id ? formData.get('activa') === 'on' : true,
  }
  const r = await intentar(() =>
    enLaEmpresa('tesoreria.mover', (tx, s) => guardarCuenta(tx, s.usuario.id, datos, id ?? undefined)),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/tesoreria')
  redirect(`/tesoreria/cuentas/${r.id}?guardado=1`)
}

export async function saldoInicialAccion(cuentaId: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('tesoreria.mover', (tx, s) =>
      cargarSaldoInicial(
        tx,
        s.usuario.id,
        cuentaId,
        valor(formData, 'fecha'),
        normalizarNumero(valor(formData, 'importe') || '0'),
      ),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath(`/tesoreria/cuentas/${cuentaId}`)
  return { ok: 'Saldo inicial cargado.' }
}

// ------------------------------------------------------------- Movimientos

export async function movimientoAccion(_: Estado, formData: FormData): Promise<Estado> {
  const tipo = valor(formData, 'operacion')
  const datos = leerJson(formData.get('datos'))
  const r = await intentar(() =>
    enLaEmpresa('tesoreria.mover', (tx, s) =>
      tipo === 'transferencia'
        ? transferir(tx, s.usuario.id, datos)
        : tipo === 'acreditacion'
          ? acreditarCupones(tx, s.usuario.id, datos)
          : registrarMovimiento(tx, s.usuario.id, datos),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/tesoreria')
  return {
    ok:
      tipo === 'transferencia'
        ? 'Transferencia registrada.'
        : tipo === 'acreditacion'
          ? 'Acreditación registrada.'
          : 'Movimiento registrado.',
  }
}

export async function anularMovimientoAccion(cuentaId: string, id: string) {
  const r = await intentar(() => enLaEmpresa('tesoreria.mover', (tx, s) => anularMovimiento(tx, s.usuario.id, id)))
  revalidatePath(`/tesoreria/cuentas/${cuentaId}`)
  if (!r.ok) redirect(`/tesoreria/cuentas/${cuentaId}?error=${encodeURIComponent(r.error)}`)
}

export async function arqueoAccion(cuentaId: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('tesoreria.mover', (tx, s) =>
      arquear(tx, s.usuario.id, {
        cuentaId,
        fecha: valor(formData, 'fecha'),
        contado: valor(formData, 'contado'),
        observaciones: valor(formData, 'observaciones'),
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath(`/tesoreria/cuentas/${cuentaId}`)
  return {
    ok:
      Number(r.diferencia) === 0
        ? 'Arqueo sin diferencias.'
        : `Arqueo con ${Number(r.diferencia) > 0 ? 'sobrante' : 'faltante'} de $ ${Math.abs(Number(r.diferencia)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}: quedó el ajuste.`,
  }
}

// ----------------------------------------------------------------- Cheques

export async function depositarAccion(_: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('tesoreria.mover', (tx, s) =>
      depositarCheques(tx, s.usuario.id, {
        cuentaId: valor(formData, 'cuentaId'),
        fecha: valor(formData, 'fecha'),
        comprobante: valor(formData, 'comprobante'),
        cheques: formData.getAll('cheque').map(String),
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/tesoreria/cheques')
  return {
    ok: `Se depositaron ${r.cantidad} cheques por $ ${Number(r.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}.`,
  }
}

export async function rechazarAccion(chequeId: string, _: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('tesoreria.mover', (tx, s) =>
      rechazarCheque(tx, s.usuario.id, {
        chequeId,
        fecha: valor(formData, 'fecha'),
        motivo: valor(formData, 'motivo'),
        gastos: valor(formData, 'gastos') || '0',
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/tesoreria/cheques')
  return { ok: 'Cheque rechazado: la deuda volvió a la cuenta del cliente.' }
}

export async function anularDepositoAccion(chequeId: string) {
  await intentar(() => enLaEmpresa('tesoreria.mover', (tx, s) => anularDeposito(tx, s.usuario.id, chequeId)))
  revalidatePath('/tesoreria/cheques')
}

// ------------------------------------------------------------ Conciliación

export async function importarExtractoAccion(cuentaId: string, _: Estado, formData: FormData): Promise<Estado> {
  const archivo = formData.get('archivo')
  if (!(archivo instanceof File) || !archivo.size) return { error: 'Elegí el extracto que bajaste del banco.' }
  if (archivo.size > 10 * 1024 * 1024) return { error: 'El archivo es demasiado grande.' }
  let lectura: Awaited<ReturnType<typeof leerExtracto>>
  try {
    lectura = await leerExtracto(new Uint8Array(await archivo.arrayBuffer()))
  } catch (e) {
    return { error: `No se pudo leer el extracto: ${(e as Error).message}` }
  }
  if (lectura.error) return { error: lectura.error }
  const r = await intentar(() =>
    enLaEmpresa('tesoreria.conciliar', (tx, s) => importarExtracto(tx, s.usuario.id, cuentaId, archivo.name, lectura.lineas)),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath(`/tesoreria/conciliacion/${cuentaId}`)
  return { ok: `${r.nuevas} líneas nuevas${r.repetidas ? ` (${r.repetidas} ya estaban)` : ''}.` }
}

export async function aceptarSugerenciasAccion(cuentaId: string, formData: FormData) {
  const sugerencias = (leerJson(formData.get('sugerencias')) ?? []) as Sugerencia[]
  await intentar(() => enLaEmpresa('tesoreria.conciliar', (tx, s) => conciliarVarias(tx, s.usuario.id, sugerencias)))
  revalidatePath(`/tesoreria/conciliacion/${cuentaId}`)
}

export async function conciliarAccion(cuentaId: string, _: Estado, formData: FormData): Promise<Estado> {
  const lineaId = valor(formData, 'lineaId')
  const movimientos = formData.getAll('movimiento').map((m) => {
    const [origen, id] = String(m).split('|')
    return { origen: origen as Sugerencia['movimientos'][number]['origen'], id }
  })
  if (!lineaId) return { error: 'Elegí la línea del banco.' }
  const r = await intentar(() => enLaEmpresa('tesoreria.conciliar', (tx, s) => conciliar(tx, s.usuario.id, lineaId, movimientos)))
  if (!r.ok) return { error: r.error }
  revalidatePath(`/tesoreria/conciliacion/${cuentaId}`)
  return { ok: 'Conciliado.' }
}

export async function desconciliarAccion(cuentaId: string, lineaId: string) {
  await intentar(() => enLaEmpresa('tesoreria.conciliar', (tx, s) => desconciliar(tx, s.usuario.id, lineaId)))
  revalidatePath(`/tesoreria/conciliacion/${cuentaId}`)
}
