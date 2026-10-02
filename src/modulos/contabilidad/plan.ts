import { and, asc, eq, like } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { configuracionContable, cuentasContables, cuentasTesoreria, ejercicios, imputacionesContables } from '../../db/schema'
import { auditar } from '../../lib/auditoria'

/**
 * Plan de cuentas modelo para una pyme comercial y de servicios, y las
 * "cuentas clave" que usan los asientos automáticos. El contador lo puede
 * cambiar (agregar cuentas, cambiar nombres, reasignar las claves).
 */

export type TipoCuenta = 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'egreso'

/** [código, nombre, clave que la usa (si alguna)] */
const MODELO: [string, string, string?][] = [
  ['1', 'ACTIVO'],
  ['1.1', 'Activo corriente'],
  ['1.1.01', 'Caja y bancos'],
  ['1.1.01.01', 'Caja', 'caja'],
  ['1.1.01.02', 'Bancos', 'bancos'],
  ['1.1.01.03', 'Valores a depositar', 'valores_a_depositar'],
  ['1.1.01.04', 'Cupones de tarjeta y billeteras a cobrar', 'cupones'],
  ['1.1.02', 'Créditos por ventas'],
  ['1.1.02.01', 'Deudores por ventas', 'deudores'],
  ['1.1.02.02', 'Cheques rechazados a recuperar', 'cheques_rechazados'],
  ['1.1.03', 'Créditos fiscales'],
  ['1.1.03.01', 'IVA crédito fiscal', 'iva_credito'],
  ['1.1.03.02', 'IVA saldo técnico a favor', 'iva_saldo_tecnico'],
  ['1.1.03.03', 'IVA saldo de libre disponibilidad', 'iva_libre_disponibilidad'],
  ['1.1.03.04', 'Percepciones de IVA sufridas', 'percepciones_iva_sufridas'],
  ['1.1.03.05', 'Retenciones de IVA sufridas', 'retenciones_iva_sufridas'],
  ['1.1.03.06', 'Percepciones de IIBB sufridas', 'percepciones_iibb_sufridas'],
  ['1.1.03.07', 'Retenciones de IIBB sufridas', 'retenciones_iibb_sufridas'],
  ['1.1.03.08', 'Retenciones de Ganancias sufridas', 'retenciones_ganancias_sufridas'],
  ['1.1.03.09', 'Percepciones de Ganancias sufridas', 'percepciones_ganancias_sufridas'],
  ['1.1.03.10', 'Retenciones de SUSS sufridas', 'retenciones_suss_sufridas'],
  ['1.1.04', 'Otros créditos'],
  ['1.1.04.01', 'Otros créditos a imputar', 'otros_creditos'],
  ['1.1.05', 'Bienes de cambio'],
  ['1.1.05.01', 'Mercaderías', 'mercaderias'],
  ['1.2', 'Activo no corriente'],
  ['1.2.01', 'Bienes de uso'],
  ['1.2.01.01', 'Rodados'],
  ['1.2.01.02', 'Muebles y útiles'],
  ['1.2.01.03', 'Equipos de computación'],
  ['1.2.01.04', 'Equipos en alquiler y comodato'],
  ['1.2.01.90', 'Amortizaciones acumuladas'],
  ['2', 'PASIVO'],
  ['2.1', 'Pasivo corriente'],
  ['2.1.01', 'Deudas comerciales'],
  ['2.1.01.01', 'Proveedores', 'proveedores'],
  ['2.1.01.02', 'Cheques diferidos a pagar', 'cheques_diferidos'],
  ['2.1.01.03', 'Tarjetas de crédito a pagar', 'tarjetas'],
  ['2.1.02', 'Deudas fiscales'],
  ['2.1.02.01', 'IVA débito fiscal', 'iva_debito'],
  ['2.1.02.02', 'IVA a pagar', 'iva_a_pagar'],
  ['2.1.02.03', 'Percepciones de IIBB a depositar', 'percepciones_iibb_a_depositar'],
  ['2.1.02.04', 'Percepciones de IVA a depositar', 'percepciones_iva_a_depositar'],
  ['2.1.02.05', 'Retenciones de Ganancias a depositar', 'retenciones_ganancias_a_depositar'],
  ['2.1.02.06', 'Retenciones de IIBB a depositar', 'retenciones_iibb_a_depositar'],
  ['2.1.02.07', 'Retenciones de IVA a depositar', 'retenciones_iva_a_depositar'],
  ['2.1.02.08', 'Retenciones de SUSS a depositar', 'retenciones_suss_a_depositar'],
  ['2.1.02.09', 'Otros impuestos a depositar', 'otros_impuestos_a_depositar'],
  ['2.1.03', 'Otras deudas'],
  ['2.1.03.01', 'Otras deudas a imputar', 'otras_deudas'],
  ['3', 'PATRIMONIO NETO'],
  ['3.1', 'Capital social'],
  ['3.2', 'Resultados no asignados', 'resultados_no_asignados'],
  ['3.3', 'Resultado del ejercicio', 'resultado_ejercicio'],
  ['3.4', 'Saldos iniciales a imputar', 'saldos_iniciales'],
  ['4', 'INGRESOS'],
  ['4.1', 'Ventas de mercaderías', 'ventas_productos'],
  ['4.2', 'Ventas de servicios', 'ventas_servicios'],
  ['4.3', 'Otros ingresos', 'otros_ingresos'],
  ['4.4', 'Sobrantes de caja', 'sobrantes'],
  ['5', 'EGRESOS'],
  ['5.1', 'Costo de mercaderías vendidas'],
  ['5.2', 'Gastos a imputar', 'gastos_a_imputar'],
  ['5.3', 'Gastos bancarios y comisiones', 'gastos_bancarios'],
  ['5.4', 'Impuestos, tasas e impuestos internos', 'impuestos_tasas'],
  ['5.5', 'Faltantes de caja', 'faltantes'],
  ['5.6', 'Diferencias de redondeo', 'redondeo'],
  ['5.7', 'Sueldos y cargas sociales'],
  ['5.8', 'Alquileres'],
  ['5.9', 'Servicios (luz, gas, teléfono, internet)'],
  ['5.10', 'Fletes y acarreos'],
  ['5.11', 'Honorarios profesionales'],
  ['5.12', 'Mantenimiento y reparaciones'],
  ['5.13', 'Combustibles y movilidad'],
  ['5.14', 'Seguros'],
  ['5.15', 'Ingresos Brutos'],
  ['5.16', 'Amortizaciones'],
]

export const CLAVES = MODELO.filter((m) => m[2]).map((m) => m[2]!)

/** Para qué se usa cada cuenta clave (el nombre de su cuenta en el plan modelo). */
export const NOMBRES_CLAVES: Record<string, string> = Object.fromEntries(
  MODELO.filter((m) => m[2]).map(([, nombre, clave]) => [clave!, nombre]),
)

const tipoDe = (codigo: string): TipoCuenta =>
  (({ '1': 'activo', '2': 'pasivo', '3': 'patrimonio', '4': 'ingreso', '5': 'egreso' }) as const)[codigo.split('.')[0] as '1'] ??
  'egreso'

/** Imputable: no tiene hijas en el modelo. */
const esHoja = (codigo: string) => !MODELO.some(([c]) => c !== codigo && c.startsWith(`${codigo}.`))

export async function configuracionContableDe(tx: Transaccion) {
  const [c] = await tx.select().from(configuracionContable).limit(1)
  return c ?? null
}

/**
 * Pone en marcha la contabilidad: plan de cuentas modelo, cuentas clave,
 * una cuenta por cada caja y banco, y el primer ejercicio.
 */
export async function iniciarContabilidad(
  tx: Transaccion,
  usuarioId: string,
  entrada: { inicio: string; cierreEjercicio?: string },
) {
  if (await configuracionContableDe(tx)) return { ok: false as const, error: 'La contabilidad ya está en marcha.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.inicio))
    return { ok: false as const, error: 'Elegí la fecha desde la que se contabiliza.' }
  const fin =
    entrada.cierreEjercicio && /^\d{4}-\d{2}-\d{2}$/.test(entrada.cierreEjercicio)
      ? entrada.cierreEjercicio
      : `${entrada.inicio.slice(0, 4)}-12-31`
  if (fin <= entrada.inicio) return { ok: false as const, error: 'El cierre del ejercicio tiene que ser posterior al inicio.' }
  await tx.insert(configuracionContable).values({ inicio: entrada.inicio })
  const creadas = await tx
    .insert(cuentasContables)
    .values(MODELO.map(([codigo, nombre]) => ({ codigo, nombre, tipo: tipoDe(codigo), imputable: esHoja(codigo) })))
    .onConflictDoNothing()
    .returning()
  const porCodigo = new Map(creadas.map((c) => [c.codigo, c.id]))
  await tx
    .insert(imputacionesContables)
    .values(MODELO.filter((m) => m[2]).map(([codigo, , clave]) => ({ clave: clave!, cuentaId: porCodigo.get(codigo)! })))
    .onConflictDoNothing()
  await sincronizarTesoreria(tx)
  await tx.insert(ejercicios).values({ inicio: entrada.inicio, fin })
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'contabilidad', despues: { inicio: entrada.inicio, fin } })
  return { ok: true as const }
}

/**
 * Cada caja, banco o billetera de tesorería tiene su cuenta contable (se
 * crea sola dentro de "Caja y bancos", o de "Deudas comerciales" si es una
 * tarjeta de crédito de la empresa).
 */
export async function sincronizarTesoreria(tx: Transaccion) {
  const cuentas = await tx.select().from(cuentasTesoreria).orderBy(asc(cuentasTesoreria.codigo))
  const ya = new Set((await tx.select({ clave: imputacionesContables.clave }).from(imputacionesContables)).map((x) => x.clave))
  for (const c of cuentas) {
    const clave = `tesoreria:${c.id}`
    if (ya.has(clave)) continue
    const rubro = c.tipo === 'tarjeta' ? '2.1.01' : '1.1.01'
    const hermanas = await tx
      .select({ codigo: cuentasContables.codigo })
      .from(cuentasContables)
      .where(like(cuentasContables.codigo, `${rubro}.%`))
    const siguiente = Math.max(10, ...hermanas.map((h) => Number(h.codigo.split('.').pop()) + 1))
    const [nueva] = await tx
      .insert(cuentasContables)
      .values({ codigo: `${rubro}.${siguiente}`, nombre: c.nombre, tipo: c.tipo === 'tarjeta' ? 'pasivo' : 'activo' })
      .returning()
    await tx.insert(imputacionesContables).values({ clave, cuentaId: nueva.id })
  }
}

/** Cuentas clave → id de cuenta (las que falten se reportan). */
export async function mapaDeCuentas(tx: Transaccion) {
  const filas = await tx
    .select({ clave: imputacionesContables.clave, cuentaId: imputacionesContables.cuentaId })
    .from(imputacionesContables)
  return new Map(filas.map((f) => [f.clave, f.cuentaId]))
}

export async function planDeCuentas(tx: Transaccion) {
  const [cuentas, claves] = await Promise.all([
    tx.select().from(cuentasContables).orderBy(asc(cuentasContables.codigo)),
    tx.select().from(imputacionesContables),
  ])
  const orden = (c: string) =>
    c
      .split('.')
      .map((n) => n.padStart(4, '0'))
      .join('.')
  return cuentas
    .sort((a, b) => orden(a.codigo).localeCompare(orden(b.codigo)))
    .map((c) => ({
      ...c,
      nivel: c.codigo.split('.').length,
      claves: claves.filter((k) => k.cuentaId === c.id).map((k) => k.clave),
    }))
}

const EsquemaCuenta = z.object({
  codigo: z
    .string()
    .trim()
    .regex(/^[0-9]+(\.[0-9]+)*$/, { error: 'El código va con números separados por puntos (ej. 5.17).' }),
  nombre: z.string().trim().min(2, { error: 'Escribí el nombre de la cuenta.' }).max(100),
  imputable: z.boolean().default(true),
  activa: z.boolean().default(true),
})

export async function guardarCuenta(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string) {
  const p = EsquemaCuenta.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Datos inválidos.' }
  const d = p.data
  const [mismo] = await tx.select({ id: cuentasContables.id }).from(cuentasContables).where(eq(cuentasContables.codigo, d.codigo))
  if (mismo && mismo.id !== id) return { ok: false as const, error: 'Ya hay una cuenta con ese código.' }
  const padre = d.codigo.split('.').slice(0, -1).join('.')
  if (padre) {
    const [p2] = await tx.select().from(cuentasContables).where(eq(cuentasContables.codigo, padre))
    if (!p2) return { ok: false as const, error: `No existe la cuenta ${padre} que la agrupa.` }
    // La que agrupa deja de ser imputable (si no tiene movimientos, eso lo controla el asiento).
    if (p2.imputable) await tx.update(cuentasContables).set({ imputable: false }).where(eq(cuentasContables.id, p2.id))
  }
  const valores = { ...d, tipo: tipoDe(d.codigo) }
  if (id) await tx.update(cuentasContables).set(valores).where(eq(cuentasContables.id, id))
  else await tx.insert(cuentasContables).values(valores)
  await auditar(tx, {
    usuarioId,
    accion: id ? 'modificacion' : 'alta',
    entidad: 'cuenta_contable',
    entidadId: id,
    despues: valores,
  })
  return { ok: true as const }
}

/** Reasigna una clave (o la cuenta de un proveedor, caja o concepto) a otra cuenta imputable. */
export async function asignarClave(tx: Transaccion, usuarioId: string, clave: string, cuentaId: string) {
  const [c] = await tx
    .select()
    .from(cuentasContables)
    .where(and(eq(cuentasContables.id, cuentaId), eq(cuentasContables.imputable, true)))
  if (!c) return { ok: false as const, error: 'Elegí una cuenta imputable.' }
  await tx
    .insert(imputacionesContables)
    .values({ clave, cuentaId })
    .onConflictDoUpdate({ target: [imputacionesContables.empresaId, imputacionesContables.clave], set: { cuentaId } })
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'imputacion_contable', despues: { clave, cuenta: c.codigo } })
  return { ok: true as const }
}
