import { Lock } from 'lucide-react'
import type { Metadata } from 'next'

import { BotonEnlace, Panel } from '@/components/ui'
import { requerirEmpresa } from '@/lib/auth/servidor'
import { PERMISOS } from '@/lib/permisos'

export const metadata: Metadata = { title: 'Sin permiso' }

export default async function SinPermiso({ searchParams }: PageProps<'/sin-permiso'>) {
  const sesion = await requerirEmpresa()
  const { permiso } = await searchParams
  const descripcion = typeof permiso === 'string' ? PERMISOS[permiso] : undefined
  return (
    <Panel className="mx-auto mt-10 max-w-md p-6 text-center">
      <Lock aria-hidden className="mx-auto size-8 text-texto-3" />
      <h1 className="mt-3 text-lg font-semibold">No tenés permiso para esta pantalla</h1>
      <p className="mt-2 text-sm text-texto-2">
        Tu rol en {sesion.empresa.razonSocial} es <strong className="font-medium text-texto">{sesion.rol}</strong>
        {descripcion ? <> y no incluye “{descripcion.toLowerCase()}”.</> : '.'} Pedíselo a quien administra los usuarios de la
        empresa.
      </p>
      <BotonEnlace href="/" className="mt-5">
        Volver al inicio
      </BotonEnlace>
    </Panel>
  )
}
