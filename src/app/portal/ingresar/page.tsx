import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Panel } from '@/components/ui'
import { empresaDelPortal } from '@/modulos/portal/portal'

import { FormularioIngreso } from '../Formularios'
import { colores, sesionPortal } from '../sesion'

export const metadata: Metadata = { title: 'Portal de clientes' }

export default async function Ingresar({ searchParams }: PageProps<'/portal/ingresar'>) {
  if (await sesionPortal()) redirect('/portal')
  const { empresa: cuit } = (await searchParams) as { empresa?: string }
  const empresa = cuit ? await empresaDelPortal(cuit).catch(() => null) : null
  return (
    <main
      style={empresa ? colores(empresa.color) : undefined}
      className="mx-auto flex min-h-full w-full max-w-sm flex-col gap-4 px-4 py-12"
    >
      <header>
        <p className="text-sm text-texto-2">{empresa?.nombre ?? 'Portal de clientes'}</p>
        <h1 className="text-xl font-semibold">Ingresar al portal</h1>
        <p className="mt-1 text-sm text-texto-2">Tus equipos, tus servicios técnicos y los contadores, en un solo lugar.</p>
      </header>
      {cuit && !empresa ? (
        <Panel className="p-5 text-sm text-texto-2">Esta empresa no tiene el portal de clientes habilitado.</Panel>
      ) : (
        <Panel className="p-5">
          <FormularioIngreso empresa={empresa ? cuit!.replace(/\D/g, '') : ''} />
        </Panel>
      )}
    </main>
  )
}
