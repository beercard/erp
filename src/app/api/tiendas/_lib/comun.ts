import 'server-only'

import { after } from 'next/server'

import { conEmpresa } from '@/db/empresa'
import { sesionActual } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { conectarCanal } from '@/modulos/tiendas/canales'
import { traerPublicaciones } from '@/modulos/tiendas/sincronizar'
import type { TipoCanal } from '@/modulos/tiendas/tipos'

/** Cookie con el state de Tienda Nube, por si no lo devuelve en la vuelta. */
export const COOKIE_TN = 'erp_flujo_tn'

/** Dirección pública del ERP: la que se registra en cada plataforma. */
export const base = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/** Quien conecta una tienda: sesión con empresa, el permiso y la aplicación en el plan. */
export async function quienConecta() {
  const s = await sesionActual()
  if (!s?.empresa || !s.suscripcion) return null
  if (!s.suscripcion.funciones.includes('tienda') || s.suscripcion.soloLectura) return null
  if (!tienePermiso(s.permisos, 'tienda.configurar')) return null
  return s as typeof s & { empresa: NonNullable<typeof s.empresa> }
}

export const volver = (ruta: string) => Response.redirect(`${base()}${ruta}`, 303)

export const volverConError = (mensaje: string) => volver(`/tiendas?error=${encodeURIComponent(mensaje)}`)

/** Da de alta el canal y, después de responder, trae las publicaciones (y lo que haga falta). */
export async function darDeAlta(
  quien: { empresaId: string; usuarioId: string },
  d: { tipo: TipoCanal; nombre: string; cuenta: string; credenciales: unknown; secretoAvisos?: string },
  despues?: (canalId: string) => Promise<void>,
) {
  const r = await conEmpresa({ empresa: { id: quien.empresaId }, usuario: { id: quien.usuarioId } }, (tx) =>
    conectarCanal(tx, quien.usuarioId, d),
  )
  if (r.ok) {
    after(async () => {
      try {
        await despues?.(r.id)
        await traerPublicaciones(quien.empresaId, r.id)
      } catch (e) {
        console.error('[tiendas] alta', d.tipo, e instanceof Error ? e.message : e)
      }
    })
  }
  return r
}

/** Para los avisos: tarea que no debe tirar el proceso ni demorar la respuesta. */
export function enSegundoPlano(etiqueta: string, trabajo: () => Promise<unknown>) {
  after(async () => {
    try {
      await trabajo()
    } catch (e) {
      console.error(`[tiendas] ${etiqueta}`, e instanceof Error ? e.message : e)
    }
  })
}
