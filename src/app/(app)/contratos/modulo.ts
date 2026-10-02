import { notFound } from 'next/navigation'

import type { Transaccion } from '@/db/conexion'
import { TASAS_IVA } from '@/modulos/comercial/calculo'
import { enLaEmpresa, exigirPermiso, SinPermiso, type SesionConEmpresa } from '@/lib/auth/servidor'

/** Contratos es un módulo opcional: solo existe para las empresas que lo tienen activo. */
class ModuloInactivo extends SinPermiso {
  constructor() {
    super('contratos')
    this.message = 'El módulo de contratos no está activo en esta empresa.'
  }
}

/** Para páginas: sin el módulo, la página no existe. */
export async function paginaContratos(permiso: string) {
  const sesion = await exigirPermiso(permiso)
  if (!sesion.empresa.modulos.includes('contratos')) notFound()
  return sesion
}

/** Para acciones: el permiso y el módulo activo. */
export function enContratos<T>(permiso: string, trabajo: (tx: Transaccion, sesion: SesionConEmpresa) => Promise<T>) {
  return enLaEmpresa(permiso, (tx, sesion) => {
    if (!sesion.empresa.modulos.includes('contratos')) throw new ModuloInactivo()
    return trabajo(tx, sesion)
  })
}

/** Alícuotas de IVA para el formulario del contrato. */
export const alicuotas = Object.entries(TASAS_IVA).map(([k, v]) => ({ valor: Number(k), texto: `${v.replace('.', ',')} %` }))
