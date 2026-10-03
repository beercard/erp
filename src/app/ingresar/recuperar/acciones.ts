'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { controlarEnvio, MENSAJE_BOT } from '@/lib/antibots'
import { ipDe } from '@/lib/auth/servidor'
import { pedirRecuperacion, usarRecuperacion } from '@/lib/auth/recuperar'
import { anotar, claveIp, superado } from '@/lib/frenos'

export type Estado = { error?: string; ok?: string } | undefined

const RESPUESTA =
  'Si el email tiene cuenta, te llega un enlace para elegir una contraseña nueva. Revisá también el correo no deseado.'

async function base() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '')
  const h = await headers()
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
}

export async function pedirAccion(_: Estado, fd: FormData): Promise<Estado> {
  const email = String(fd.get('email') ?? '')
    .trim()
    .toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Escribí un email válido.' }
  const bot = await controlarEnvio(fd, ipDe(await headers()))
  if (bot) return bot === 'trampa' ? { ok: RESPUESTA } : { error: MENSAJE_BOT }
  // Un correo por email cada 15 minutos y pocos por conexión: no sirve para llenarle la casilla a nadie.
  const porEmail = `recuperar:${email}`
  const ip = claveIp('recuperar', ipDe(await headers()))
  if ((await superado([porEmail], 1, 15 * 60_000)) || (await superado([ip], 10, 60 * 60_000))) return { ok: RESPUESTA }
  await anotar([porEmail, ip])
  await pedirRecuperacion(email, await base())
  return { ok: RESPUESTA }
}

export async function cambiarAccion(token: string, _: Estado, fd: FormData): Promise<Estado> {
  const r = await usarRecuperacion(token, String(fd.get('clave') ?? ''), String(fd.get('repetir') ?? ''))
  if (!r.ok) return { error: r.error }
  redirect('/ingresar?clave=1')
}
