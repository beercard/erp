import { notFound } from 'next/navigation'

import { ConstanciaServicio } from '@/components/servicio/ConstanciaServicio'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { datosEmpresa } from '@/modulos/empresa/datos'
import { obtenerOrden } from '@/modulos/servicio/servicio'

/** Constancia de la orden de servicio, desde la oficina. */
export async function HojaServicio({ id }: { id: string }) {
  const sesion = await requerirEmpresa()
  const empresa = await datosEmpresa(sesion.empresa.id)
  const o = await enLaEmpresa('servicio.ver', (tx) => obtenerOrden(tx, id))
  if (!o || !empresa) notFound()
  return <ConstanciaServicio empresa={empresa} o={o} />
}
