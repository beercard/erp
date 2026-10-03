'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import {
  deudoresVencidos,
  enviarEstadoDeuda,
  generarNotasDeInteres,
  guardarConfiguracionCobranza,
} from '@/modulos/facturacion/cobranza'

export type Estado = { error?: string; ok?: string } | undefined

async function intentar<T>(f: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await f()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

export async function configurarAccion(_: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('ventas.cobrar', (tx, s) =>
      guardarConfiguracionCobranza(tx, s.usuario.id, {
        recordatorios: fd.has('recordatorios'),
        diasAntes: fd.get('diasAntes') || 0,
        etapas: String(fd.get('etapas') ?? '')
          .split(/[,\s]+/)
          .filter(Boolean),
        porCorreo: fd.has('porCorreo'),
        porWhatsapp: fd.has('porWhatsapp'),
        tasaMensual: fd.get('tasaMensual') ?? '',
        diasGracia: fd.get('diasGracia') || 0,
        minimoInteres: fd.get('minimoInteres') ?? '',
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/cobranzas/automatica')
  return { ok: 'Guardado.' }
}

/** Manda el estado de deuda a un cliente (o a todos los que tienen deuda vencida). */
export async function enviarEstadoAccion(terceroId: string | null) {
  const r = await intentar(() =>
    enLaEmpresa('ventas.cobrar', async (tx, s) => ({
      ok: true as const,
      empresaId: s.empresa.id,
      ids: terceroId ? [terceroId] : (await deudoresVencidos(tx)).map((d) => d.id),
    })),
  )
  if (!r.ok) redirect(`/cobranzas/automatica?error=${encodeURIComponent(r.error)}`)
  let enviados = 0
  let fallidos = 0
  for (const id of r.ids) {
    const e = await enviarEstadoDeuda(r.empresaId, id, { correo: true, whatsapp: true })
    if (e.ok) enviados++
    else fallidos++
  }
  revalidatePath('/cobranzas/automatica')
  redirect(`/cobranzas/automatica?enviados=${enviados}&fallidos=${fallidos}`)
}

export async function generarInteresesAccion(_: Estado, fd: FormData): Promise<Estado> {
  const ids = fd.getAll('cliente').map(String)
  if (!ids.length) return { error: 'Marcá los clientes.' }
  const r = await intentar(() =>
    enLaEmpresa('ventas.facturar', (tx, s) => generarNotasDeInteres(tx, s.usuario.id, ids, Number(fd.get('puntoVenta')))),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/facturas')
  redirect(`/facturas?estado=borrador`)
}
