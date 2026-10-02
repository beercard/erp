'use server'

import { redirect } from 'next/navigation'

import { datosDelPedido, guardarCookieDeSesion, tokenDeSesion } from '@/lib/auth/servidor'
import { elegirEmpresa, iniciarSesion } from '@/lib/auth/sesiones'
import { registrarCuenta } from '@/modulos/plataforma/registro'
import { crearEmpresa } from '@/modulos/plataforma/suscripciones'

export type EstadoRegistro = { error?: string; valores?: Record<string, string> } | undefined

// Freno a las altas en masa: 5 cuentas por IP cada hora. En memoria, como el del ingreso.
const altas = new Map<string, { cuenta: number; desde: number }>()
const HORA = 60 * 60_000

export async function registrarse(_: EstadoRegistro, formData: FormData): Promise<EstadoRegistro> {
  const valores = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>
  const sinClaves = { ...valores, clave: '', repetir: '' }
  const meta = await datosDelPedido()
  const ip = meta.ip ?? ''
  const previo = altas.get(ip)
  const vigente = previo && Date.now() - previo.desde < HORA ? previo : { cuenta: 0, desde: Date.now() }
  if (vigente.cuenta >= 5)
    return { error: 'Se crearon muchas cuentas desde esta conexión. Probá de nuevo en una hora.', valores: sinClaves }

  const r = await registrarCuenta(valores)
  if (!r.ok) return { error: r.error, valores: sinClaves }
  altas.set(ip, { ...vigente, cuenta: vigente.cuenta + 1 })
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
  const r = await crearEmpresa(sesion.usuario.id, valores)
  if (!r.ok) return { error: r.error, valores }
  await elegirEmpresa(token, r.empresaId, await datosDelPedido())
  redirect('/?bienvenida=1')
}
