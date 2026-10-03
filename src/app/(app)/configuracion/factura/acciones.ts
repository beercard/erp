'use server'

import { revalidatePath } from 'next/cache'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { guardarDiseno, guardarLogo, quitarLogo } from '@/modulos/empresa/marca'

type Estado = { error?: string; ok?: string } | undefined

async function conPermiso(f: Parameters<typeof enLaEmpresa<{ ok: boolean; error?: string }>>[1], ok: string): Promise<Estado> {
  try {
    const r = await enLaEmpresa('empresa.datos', f)
    if (!r.ok) return { error: r.error }
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message }
    throw e
  }
  revalidatePath('/configuracion/factura')
  return { ok }
}

export async function subirLogoAccion(_: Estado, fd: FormData): Promise<Estado> {
  const archivo = fd.get('logo')
  if (!(archivo instanceof File) || !archivo.size) return { error: 'Elegí la imagen del logo.' }
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  return conPermiso((tx) => guardarLogo(tx, bytes), 'Logo guardado.')
}

export async function quitarLogoAccion(): Promise<Estado> {
  return conPermiso((tx) => quitarLogo(tx), 'Logo quitado.')
}

export async function disenoAccion(_: Estado, fd: FormData): Promise<Estado> {
  return conPermiso(
    (tx) => guardarDiseno(tx, String(fd.get('diseno') ?? ''), String(fd.get('color') ?? '')),
    'Diseño guardado: se usa en las facturas, notas y en el enlace que reciben tus clientes.',
  )
}
