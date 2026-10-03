import { redirect } from 'next/navigation'

import { requerirEmpresa } from '@/lib/auth/servidor'

/** Los equipos en clientes existen con Contratos o con Servicio técnico. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { suscripcion } = await requerirEmpresa()
  if (!suscripcion.funciones.some((f) => f === 'contratos' || f === 'servicio')) {
    redirect('/configuracion/suscripcion?funcion=servicio')
  }
  return children
}
