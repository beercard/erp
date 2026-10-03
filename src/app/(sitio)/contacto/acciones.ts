'use server'

import { headers } from 'next/headers'

import { ipDe } from '@/lib/auth/servidor'
import { registrarConsulta } from '@/modulos/plataforma/consultas'

export type EstadoContacto = { error?: string; ok?: boolean; codigo?: string } | undefined

export async function enviarConsultaAccion(_: EstadoContacto, fd: FormData): Promise<EstadoContacto> {
  // Trampa para robots: un campo que una persona no ve ni completa.
  if (String(fd.get('sitio_web') ?? '')) return { ok: true }
  const h = await headers()
  const ip = ipDe(h)
  const dato = (k: string) => String(fd.get(k) ?? '')
  const r = await registrarConsulta(
    {
      nombre: dato('nombre'),
      email: dato('email'),
      telefono: dato('telefono'),
      empresa: dato('empresa'),
      rubro: dato('rubro'),
      mensaje: dato('mensaje'),
      origen: dato('origen'),
    },
    ip,
  )
  // El código identifica el trámite (lo pide la norma del botón de arrepentimiento).
  return r.ok ? { ok: true, codigo: r.id.slice(0, 8).toUpperCase() } : { error: r.error }
}
