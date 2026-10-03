'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { normalizarNumero } from '@/lib/dinero'
import { tienePermiso } from '@/lib/permisos'
import { abrirTurno, cerrarCaja, configurarCaja } from '@/modulos/tesoreria/cierres'
import { enviarReporteCierre } from '@/modulos/tesoreria/reporteCierre'

export type EstadoCierre = { error?: string; supervisor?: boolean } | undefined
export type EstadoConfiguracion = { error?: string; ok?: boolean } | undefined

const importe = (v: FormDataEntryValue | null) => normalizarNumero(String(v ?? ''))

function conteo(fd: FormData) {
  const c: Record<string, number> = {}
  for (const [k, v] of fd.entries()) {
    const m = /^b_(\d+)$/.exec(k)
    if (m && Number(v) > 0) c[m[1]] = Math.trunc(Number(v))
  }
  return Object.keys(c).length ? c : undefined
}

async function intentar<T>(f: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await f()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

export async function abrirCajaAccion(cuentaId: string, _: EstadoCierre, fd: FormData): Promise<EstadoCierre> {
  const r = await intentar(() =>
    enLaEmpresa('ventas.cobrar', (tx, s) =>
      abrirTurno(tx, s.usuario.id, {
        cuentaId,
        contado: importe(fd.get('contado')),
        conteo: conteo(fd),
        nota: fd.get('nota') ?? '',
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/cobranzas/caja', 'layout')
  revalidatePath('/tesoreria', 'layout')
  redirect(`/cobranzas/caja?c=${cuentaId}`)
}

export async function cerrarCajaAccion(cuentaId: string, _: EstadoCierre, fd: FormData): Promise<EstadoCierre> {
  const medios: Record<string, string> = {}
  for (const [k, v] of fd.entries()) {
    const m = /^m_([a-z_]+)$/.exec(k)
    if (m && String(v).trim()) medios[m[1]] = importe(v)
  }
  let empresaId = ''
  const r = await intentar(() =>
    enLaEmpresa('ventas.cobrar', (tx, s) => {
      empresaId = s.empresa.id
      return cerrarCaja(
        tx,
        s.usuario.id,
        {
          cuentaId,
          contado: importe(fd.get('contado')),
          conteo: conteo(fd),
          medios,
          observaciones: fd.get('observaciones') ?? '',
        },
        new Date(),
        { supervisor: tienePermiso(s.permisos, 'ventas.supervisar_caja') },
      )
    }),
  )
  if (!r.ok) return { error: r.error, supervisor: 'requiereSupervisor' in r && r.requiereSupervisor }
  // El reporte sale después de cerrar (fuera de la transacción): si falla el envío, el cierre queda igual.
  await enviarReporteCierre(empresaId, r.id).catch(() => undefined)
  revalidatePath('/cobranzas/caja', 'layout')
  revalidatePath('/tesoreria', 'layout')
  redirect(`/cobranzas/caja/${r.id}?cerrado=1`)
}

const lista = (v: FormDataEntryValue | null) =>
  String(v ?? '')
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)

export async function configurarCajaAccion(cuentaId: string, _: EstadoConfiguracion, fd: FormData): Promise<EstadoConfiguracion> {
  const r = await intentar(() =>
    enLaEmpresa('ventas.supervisar_caja', (tx, s) =>
      configurarCaja(tx, s.usuario.id, cuentaId, {
        exigeTurno: fd.get('exigeTurno') === 'on',
        diferenciaMaxima: importe(fd.get('diferenciaMaxima')) || null,
        correos: lista(fd.get('correos')),
        telefonos: lista(fd.get('telefonos')),
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/cobranzas/caja', 'layout')
  return { ok: true }
}
