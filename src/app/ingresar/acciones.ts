'use server'

import { redirect } from 'next/navigation'
import * as z from 'zod'

import {
  borrarCookieDeSesion,
  codigoDelPedido,
  datosDelPedido,
  empresaDelPedido,
  guardarCookieDeSesion,
  sesionActual,
  tokenDeSesion,
} from '@/lib/auth/servidor'
import { dominioEmpresas, urlDeEmpresa } from '@/lib/subdominio'
import { cerrarSesion, elegirEmpresa, iniciarSesion } from '@/lib/auth/sesiones'
import { anotar, claveIp, olvidar, superado } from '@/lib/frenos'

export type EstadoIngreso = { error?: string; email?: string } | undefined

const Datos = z.object({
  email: z.email({ error: 'Escribí un email válido.' }).trim(),
  clave: z.string().min(1, { error: 'Escribí tu contraseña.' }),
  volver: z.string().optional(),
})

// Freno a la fuerza bruta (en la base, ver src/lib/frenos.ts): 8 fallidos por
// email cada 15 minutos, sin importar desde dónde, y 30 por conexión.
const VENTANA = 15 * 60_000
const POR_EMAIL = 8
const POR_IP = 30

/**
 * Solo rutas internas: evita que ?volver= mande a otro sitio. Se rechazan
 * "//otro.com" y "/\\otro.com" (los navegadores toman la barra invertida
 * como "/") y cualquier control.
 */
export async function destinoSeguro(volver: string | undefined): Promise<string> {
  if (!volver || !/^\/(?![/\\])/.test(volver) || /[\\\s]/.test(volver)) return '/'
  try {
    const u = new URL(volver, 'http://local.invalido')
    return u.origin === 'http://local.invalido' ? `${u.pathname}${u.search}${u.hash}` : '/'
  } catch {
    return '/'
  }
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
  const porEmail = `ingreso:email:${datos.data.email.toLowerCase()}`
  const porIp = claveIp('ingreso', meta.ip)
  if ((await superado([porEmail], POR_EMAIL, VENTANA)) || (await superado([porIp], POR_IP, VENTANA))) {
    return { error: 'Demasiados intentos fallidos. Esperá 15 minutos y probá de nuevo.', email }
  }

  // En el subdominio de una empresa, se entra solo a esa empresa.
  const codigo = await codigoDelPedido()
  const empresa = codigo ? await empresaDelPedido() : null
  if (codigo && !empresa) return { error: 'Esta dirección no corresponde a ninguna empresa.', email }
  const resultado = await iniciarSesion(datos.data.email, datos.data.clave, meta, empresa?.id)
  if (!resultado.ok) {
    await anotar([porEmail, porIp])
    return { error: resultado.error, email }
  }
  await olvidar(porEmail)
  await guardarCookieDeSesion(resultado.token, resultado.vence)
  redirect(await destinoSeguro(datos.data.volver))
}

export async function elegir(formData: FormData) {
  const token = await tokenDeSesion()
  const empresaId = String(formData.get('empresa') ?? '')
  if (!token) redirect('/ingresar')
  // Con subdominios, cada empresa se usa en su dirección (con su propia sesión).
  if (dominioEmpresas()) {
    const destino = (await sesionActual())?.empresas.find((e) => e.id === empresaId)
    const propia = await empresaDelPedido()
    if (destino?.codigo && propia?.id !== destino.id) {
      redirect(urlDeEmpresa(destino.codigo, `/ingresar?email=${encodeURIComponent((await sesionActual())!.usuario.email)}`))
    }
  }
  await elegirEmpresa(token, empresaId, await datosDelPedido())
  redirect('/')
}

export async function salir() {
  const token = await tokenDeSesion()
  if (token) await cerrarSesion(token)
  await borrarCookieDeSesion()
  redirect('/ingresar')
}
