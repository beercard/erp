'use server'

import { redirect } from 'next/navigation'

import { datosDelPedido, guardarCookieDeSesion } from '@/lib/auth/servidor'
import { iniciarSesion } from '@/lib/auth/sesiones'
import { aceptarInvitacion } from '@/modulos/empresa/usuarios'

export async function aceptarAccion(token: string, _: { error?: string } | undefined, formData: FormData) {
  const clave = formData.get('clave')
  const r = await aceptarInvitacion(token, { nombre: formData.get('nombre'), clave, repetir: formData.get('repetir') })
  if (!r.ok) return { error: r.error }
  // Entra directo: acaba de demostrar la clave.
  const sesion = await iniciarSesion(r.email, String(clave), await datosDelPedido())
  if (sesion.ok) {
    await guardarCookieDeSesion(sesion.token, sesion.vence)
    redirect('/empresas')
  }
  redirect('/ingresar')
}
