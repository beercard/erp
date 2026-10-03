'use server'

import { redirect } from 'next/navigation'

import { datosDelPedido, guardarCookieDeSesion, tokenDeSesion } from '@/lib/auth/servidor'
import { elegirEmpresa, iniciarSesion } from '@/lib/auth/sesiones'
import { controlarEnvio, correoDescartable, MENSAJE_BOT } from '@/lib/antibots'
import { anotar, claveIp, superado } from '@/lib/frenos'
import { registrarCuenta } from '@/modulos/plataforma/registro'
import { crearEmpresa } from '@/modulos/plataforma/suscripciones'
import { dominioEmpresas, urlDeEmpresa } from '@/lib/subdominio'

/** irA: con subdominios, la dirección de la empresa nueva (el navegador va ahí). */
export type EstadoRegistro = { error?: string; valores?: Record<string, string>; irA?: string } | undefined

// Freno a las altas en masa (en la base): 5 intentos por conexión cada hora.
const HORA = 60 * 60_000

export async function registrarse(_: EstadoRegistro, formData: FormData): Promise<EstadoRegistro> {
  const valores = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>
  const sinClaves = { ...valores, clave: '', repetir: '', 'cf-turnstile-response': '' }
  const meta = await datosDelPedido()
  const ip = claveIp('registro', meta.ip)
  if (await superado([ip], 5, HORA))
    return { error: 'Se intentaron muchas altas desde esta conexión. Probá de nuevo en una hora.', valores: sinClaves }
  // Se cuenta cada intento, no solo los buenos: así tampoco sirve para averiguar qué emails o CUIT están.
  await anotar([ip])
  const bot = await controlarEnvio(formData, meta.ip)
  if (bot) {
    console.warn('[registro] rechazado por', bot, meta.ip)
    return { error: MENSAJE_BOT, valores: sinClaves }
  }
  if (correoDescartable(valores.email ?? '')) {
    return {
      error: 'Usá un email permanente: ahí llegan los avisos, las facturas y la recuperación de la clave.',
      valores: sinClaves,
    }
  }
  const r = await registrarCuenta(valores)
  if (!r.ok) return { error: r.error, valores: sinClaves }
  // Con subdominios, la empresa se usa en su dirección: se ingresa ahí.
  if (dominioEmpresas()) return { irA: urlDeEmpresa(r.codigo, `/ingresar?bienvenida=1&email=${encodeURIComponent(r.email)}`) }
  const sesion = await iniciarSesion(r.email, valores.clave, meta)
  if (!sesion.ok) redirect('/ingresar')
  await guardarCookieDeSesion(sesion.token, sesion.vence)
  redirect('/?bienvenida=1')
}

/** Una empresa más para quien ya tiene cuenta (por ejemplo, un contador). */
export async function crearOtraEmpresa(_: EstadoRegistro, formData: FormData): Promise<EstadoRegistro> {
  const valores = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>
  const token = await tokenDeSesion()
  if (!token) redirect('/ingresar')
  const { leerSesion } = await import('@/lib/auth/sesiones')
  const sesion = await leerSesion(token)
  if (!sesion) redirect('/ingresar')
  const freno = `empresa-nueva:${sesion.usuario.id}`
  if (await superado([freno], 5, 24 * HORA)) return { error: 'Creaste varias empresas hoy. Probá de nuevo mañana.', valores }
  await anotar([freno])
  const r = await crearEmpresa(sesion.usuario.id, valores)
  if (!r.ok) return { error: r.error, valores }
  if (dominioEmpresas())
    return { irA: urlDeEmpresa(r.codigo, `/ingresar?bienvenida=1&email=${encodeURIComponent(sesion.usuario.email)}`) }
  await elegirEmpresa(token, r.empresaId, await datosDelPedido())
  redirect('/?bienvenida=1')
}
