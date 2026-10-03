'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { cerrarCaja } from '@/modulos/tesoreria/cierres'

export type EstadoCierre = { error?: string } | undefined

export async function cerrarCajaAccion(cuentaId: string, _: EstadoCierre, fd: FormData): Promise<EstadoCierre> {
  const conteo: Record<string, number> = {}
  for (const [k, v] of fd.entries()) {
    const m = /^b_(\d+)$/.exec(k)
    if (m && Number(v) > 0) conteo[m[1]] = Math.trunc(Number(v))
  }
  let r
  try {
    r = await enLaEmpresa('ventas.cobrar', (tx, s) =>
      cerrarCaja(tx, s.usuario.id, {
        cuentaId,
        contado: String(fd.get('contado') ?? '')
          .replace(/\./g, '')
          .replace(',', '.'),
        conteo: Object.keys(conteo).length ? conteo : undefined,
        observaciones: fd.get('observaciones') ?? '',
      }),
    )
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message }
    throw e
  }
  if (!r.ok) return { error: r.error }
  revalidatePath('/cobranzas/caja', 'layout')
  revalidatePath('/tesoreria', 'layout')
  redirect(`/cobranzas/caja/${r.id}?cerrado=1`)
}
