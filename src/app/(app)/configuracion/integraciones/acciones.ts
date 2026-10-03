'use server'

import { revalidatePath } from 'next/cache'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { crearClave, revocarClave } from '@/modulos/integraciones/claves'
import { borrarWebhook, entregarPendientes, guardarWebhook, reintentarEntrega } from '@/modulos/integraciones/webhooks'

export type Estado = { error?: string; clave?: string; secreto?: string } | undefined

async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message }
    throw e
  }
}

const RUTA = '/configuracion/integraciones'

export async function crearClaveAccion(_: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('empresa.integraciones', (tx, s) =>
      crearClave(tx, s.usuario.id, s.empresa.id, { nombre: formData.get('nombre'), acceso: formData.get('acceso') }),
    ),
  )
  revalidatePath(RUTA)
  return r.ok ? { clave: r.clave } : { error: r.error }
}

export async function revocarClaveAccion(id: string) {
  await intentar(() => enLaEmpresa('empresa.integraciones', (tx, s) => revocarClave(tx, s.usuario.id, id)))
  revalidatePath(RUTA)
}

export async function crearWebhookAccion(_: Estado, formData: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('empresa.integraciones', (tx, s) =>
      guardarWebhook(tx, s.usuario.id, {
        url: formData.get('url'),
        descripcion: formData.get('descripcion'),
        eventos: formData.getAll('eventos').map(String),
      }),
    ),
  )
  revalidatePath(RUTA)
  return r.ok ? { secreto: r.secreto ?? undefined } : { error: r.error }
}

export async function borrarWebhookAccion(id: string) {
  await intentar(() => enLaEmpresa('empresa.integraciones', (tx, s) => borrarWebhook(tx, s.usuario.id, id)))
  revalidatePath(RUTA)
}

export async function reintentarAccion(id: string) {
  await intentar(() =>
    enLaEmpresa('empresa.integraciones', async (tx, s) => {
      await reintentarEntrega(tx, id)
      return { ok: true as const, empresaId: s.empresa.id }
    }),
  ).then((r) => (r.ok ? entregarPendientes(r.empresaId) : null))
  revalidatePath(RUTA)
}
