'use server'

import { redirect } from 'next/navigation'
import * as z from 'zod'

import { borrarCookieDeSesion, datosDelPedido, guardarCookieDeSesion, tokenDeSesion } from '@/lib/auth/servidor'
import { cerrarSesion, elegirEmpresa, iniciarSesion } from '@/lib/auth/sesiones'

export type EstadoIngreso = { error?: string; email?: string } | undefined

const Datos = z.object({
  email: z.email({ error: 'Escribí un email válido.' }).trim(),
  clave: z.string().min(1, { error: 'Escribí tu contraseña.' }),
  volver: z.string().optional(),
})

// Freno a la fuerza bruta: 8 intentos fallidos por email e IP cada 15 minutos.
// Vive en memoria; con varias instancias hay que pasarlo a la base (TODO al
// desplegar en más de un servidor).
const fallidos = new Map<string, { cuenta: number; desde: number }>()
const VENTANA = 15 * 60_000
const MAXIMO = 8

/** Solo rutas internas: evita que ?volver= mande a otro sitio. */
function destinoSeguro(volver: string | undefined): string {
  return volver && volver.startsWith('/') && !volver.startsWith('//') ? volver : '/'
}

export async function ingresar(_: EstadoIngreso, formData: FormData): Promise<EstadoIngreso> {
  const datos = Datos.safeParse({
    email: formData.get('email'),
    clave: formData.get('clave'),
    volver: formData.get('volver') || undefined,
  })
  const email = String(formData.get('email') ?? '')
  if (!datos.success) return { error: datos.error.issues[0]?.message, email }

  const meta = await datosDelPedido()
  const clave = `${datos.data.email.toLowerCase()}|${meta.ip ?? ''}`
  const previo = fallidos.get(clave)
  if (previo && Date.now() - previo.desde < VENTANA && previo.cuenta >= MAXIMO) {
    return { error: 'Demasiados intentos fallidos. Esperá 15 minutos y probá de nuevo.', email }
  }

  const resultado = await iniciarSesion(datos.data.email, datos.data.clave, meta)
  if (!resultado.ok) {
    const vigente = previo && Date.now() - previo.desde < VENTANA ? previo : { cuenta: 0, desde: Date.now() }
    fallidos.set(clave, { ...vigente, cuenta: vigente.cuenta + 1 })
    return { error: resultado.error, email }
  }
  fallidos.delete(clave)
  await guardarCookieDeSesion(resultado.token, resultado.vence)
  redirect(destinoSeguro(datos.data.volver))
}

export async function elegir(formData: FormData) {
  const token = await tokenDeSesion()
  const empresaId = String(formData.get('empresa') ?? '')
  if (!token) redirect('/ingresar')
  await elegirEmpresa(token, empresaId, await datosDelPedido())
  redirect('/')
}

export async function salir() {
  const token = await tokenDeSesion()
  if (token) await cerrarSesion(token)
  await borrarCookieDeSesion()
  redirect('/ingresar')
}
