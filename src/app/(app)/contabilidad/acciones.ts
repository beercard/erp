'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { anularAsientoManual, asientoManual, cerrarHasta } from '@/modulos/contabilidad/asientos'
import { contabilizar } from '@/modulos/contabilidad/automaticos'
import { cerrarEjercicio, liquidarPendientes, reclasificarProveedor } from '@/modulos/contabilidad/cierre'
import { asignarClave, guardarCuenta, iniciarContabilidad } from '@/modulos/contabilidad/plan'

export type Estado = { error?: string; ok?: string } | undefined
export type EstadoContabilizar =
  { error?: string; ok?: string; errores?: { descripcion: string; error: string }[]; pendientesCerrado?: number } | undefined

async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()
const importe = (v: string) => {
  if (!v) return 0
  const n = Number(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v)
  return Number.isFinite(n) ? n : NaN
}

export async function iniciarAccion(_: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('contabilidad.configurar', async (tx, s) => {
      const i = await iniciarContabilidad(tx, s.usuario.id, {
        inicio: texto(fd, 'inicio'),
        cierreEjercicio: texto(fd, 'cierreEjercicio') || undefined,
      })
      if (!i.ok) return i
      // Lo que ya hay desde esa fecha se asienta enseguida.
      const c = await contabilizar(tx, s.usuario.id, hoyArgentina(), 5000)
      const iva = await liquidarPendientes(tx, s.usuario.id)
      return { ok: true as const, generados: c.generados + iva.liquidados, errores: c.errores.length + iva.errores.length }
    }),
  )
  revalidatePath('/contabilidad', 'layout')
  if (!r.ok) return { error: r.error }
  return {
    ok: `Contabilidad en marcha: ${r.generados} asientos automáticos${r.errores ? `, ${r.errores} operaciones con problemas (ver abajo)` : ''}.`,
  }
}

export async function contabilizarAccion(): Promise<EstadoContabilizar> {
  const r = await intentar(() =>
    enLaEmpresa('contabilidad.asientos', async (tx, s) => {
      const c = await contabilizar(tx, s.usuario.id, hoyArgentina(), 2000)
      const iva = await liquidarPendientes(tx, s.usuario.id)
      return { ok: true as const, ...c, iva }
    }),
  )
  revalidatePath('/contabilidad', 'layout')
  if (!r.ok) return { error: r.error }
  const partes = [
    r.generados && `${r.generados} asientos nuevos`,
    r.revertidos && `${r.revertidos} contraasientos por anulaciones`,
    r.iva.liquidados && `${r.iva.liquidados} liquidaciones de IVA`,
  ].filter(Boolean)
  return {
    ok: partes.length ? `${partes.join(', ')}.` : 'No había nada nuevo para asentar.',
    errores: [
      ...r.errores.slice(0, 50).map((e) => ({ descripcion: e.descripcion, error: e.error })),
      ...r.iva.errores.map((e) => ({ descripcion: 'IVA', error: e })),
    ],
    pendientesCerrado: r.pendientesCerrado,
  }
}

export async function cuentaAccion(id: string | null, _: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('contabilidad.configurar', (tx, s) =>
      guardarCuenta(
        tx,
        s.usuario.id,
        {
          codigo: texto(fd, 'codigo'),
          nombre: texto(fd, 'nombre'),
          imputable: fd.get('imputable') === 'on',
          activa: id ? fd.get('activa') === 'on' : true,
        },
        id ?? undefined,
      ),
    ),
  )
  revalidatePath('/contabilidad/plan')
  return r.ok ? { ok: id ? 'Cuenta guardada.' : 'Cuenta agregada.' } : { error: r.error }
}

export async function claveAccion(clave: string, _: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('contabilidad.configurar', (tx, s) => asignarClave(tx, s.usuario.id, clave, texto(fd, 'cuentaId'))),
  )
  revalidatePath('/contabilidad/plan')
  return r.ok ? { ok: 'Asignada.' } : { error: r.error }
}

export async function asientoAccion(_: Estado, fd: FormData): Promise<Estado> {
  const cuentas = fd.getAll('cuentaId').map(String)
  const debes = fd.getAll('debe').map((v) => importe(String(v)))
  const haberes = fd.getAll('haber').map((v) => importe(String(v)))
  const detalles = fd.getAll('detalle').map(String)
  const lineas = cuentas
    .map((cuentaId, i) => ({ cuentaId, debe: debes[i] || 0, haber: haberes[i] || 0, detalle: detalles[i] || undefined }))
    .filter((l) => l.cuentaId || l.debe || l.haber)
  if (lineas.some((l) => Number.isNaN(l.debe) || Number.isNaN(l.haber))) return { error: 'Hay un importe mal escrito.' }
  const r = await intentar(() =>
    enLaEmpresa('contabilidad.asientos', (tx, s) =>
      asientoManual(tx, s.usuario.id, { fecha: texto(fd, 'fecha'), concepto: texto(fd, 'concepto'), lineas }),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/contabilidad', 'layout')
  redirect(`/contabilidad/asientos/${r.id}`)
}

export async function anularAsientoAccion(id: string, _: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('contabilidad.asientos', (tx, s) =>
      anularAsientoManual(tx, s.usuario.id, id, texto(fd, 'fecha') || hoyArgentina()),
    ),
  )
  revalidatePath('/contabilidad', 'layout')
  return r.ok ? { ok: `Anulado con el asiento ${r.numero}.` } : { error: r.error }
}

export async function reclasificarAccion(terceroId: string, _: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('contabilidad.asientos', (tx, s) => reclasificarProveedor(tx, s.usuario.id, terceroId, texto(fd, 'cuentaId'))),
  )
  revalidatePath('/contabilidad', 'layout')
  return r.ok
    ? { ok: `Listo: ${r.reclasificados} compras reclasificadas; las próximas van directo a esa cuenta.` }
    : { error: r.error }
}

export async function cerrarEjercicioAccion(id: string): Promise<Estado> {
  const r = await intentar(() => enLaEmpresa('contabilidad.configurar', (tx, s) => cerrarEjercicio(tx, s.usuario.id, id)))
  revalidatePath('/contabilidad', 'layout')
  if (!r.ok) return { error: r.error }
  return {
    ok: `Ejercicio cerrado con ${r.resultado >= 0 ? 'ganancia' : 'pérdida'} de ${Math.abs(r.resultado).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}.`,
  }
}

export async function cerrarHastaAccion(_: Estado, fd: FormData): Promise<Estado> {
  const fecha = texto(fd, 'fecha') || null
  const r = await intentar(() => enLaEmpresa('contabilidad.configurar', (tx, s) => cerrarHasta(tx, s.usuario.id, fecha)))
  revalidatePath('/contabilidad', 'layout')
  return r.ok
    ? {
        ok: fecha ? `No se aceptan asientos hasta el ${fecha.split('-').reverse().join('/')} inclusive.` : 'Sin fecha de cierre.',
      }
    : { error: r.error }
}
