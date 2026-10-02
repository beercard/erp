import type { Transaccion } from '@/db/conexion'
import { enLaEmpresa, exigirPermiso, type SesionConEmpresa } from '@/lib/auth/servidor'
import { TASAS_IVA } from '@/modulos/comercial/calculo'

/**
 * Contratos es una aplicación que se contrata aparte: sin ella, la
 * suscripción no habilita los permisos contratos.* y las páginas llevan a
 * Configuración › Suscripción.
 */
export const paginaContratos = (permiso: string) => exigirPermiso(permiso)

export function enContratos<T>(permiso: string, trabajo: (tx: Transaccion, sesion: SesionConEmpresa) => Promise<T>) {
  return enLaEmpresa(permiso, trabajo)
}

/** Alícuotas de IVA para el formulario del contrato. */
export const alicuotas = Object.entries(TASAS_IVA).map(([k, v]) => ({ valor: Number(k), texto: `${v.replace('.', ',')} %` }))
