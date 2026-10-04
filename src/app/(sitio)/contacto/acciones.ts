'use server'

import { headers } from 'next/headers'

import { mensajeBot } from '@/lib/antibots'
import { controlarEnvio } from '@/lib/antibotsServidor'
import { ipDe } from '@/lib/auth/servidor'
import { registrarConsulta } from '@/modulos/plataforma/consultas'

export type EstadoContacto = { error?: string; ok?: boolean; codigo?: string } | undefined

export async function enviarConsultaAccion(_: EstadoContacto, fd: FormData): Promise<EstadoContacto> {
  const h = await headers()
  const ip = ipDe(h)
  // Robots (trampa, tiempo, Turnstile): la trampa se contesta como si hubiera salido, para no darles pistas.
  const bot = await controlarEnvio(fd, ip)
  if (bot === 'trampa') return { ok: true }
  if (bot) {
    console.warn('[contacto] rechazado por', bot)
    return { error: mensajeBot(bot) }
  }
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
