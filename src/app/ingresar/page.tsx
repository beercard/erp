import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { sesionActual } from '@/lib/auth/servidor'

import { FormularioIngreso } from './FormularioIngreso'

export const metadata: Metadata = { title: 'Ingresar' }

export default async function PaginaIngreso({ searchParams }: PageProps<'/ingresar'>) {
  if (await sesionActual()) redirect('/')
  const { volver } = await searchParams
  return (
    <main className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span aria-hidden className="grid size-8 place-items-center rounded-md bg-acento text-sm font-bold text-sobre-acento">
            E
          </span>
          <span className="text-base font-semibold tracking-tight">ERP</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Ingresá a tu empresa</h1>
        <p className="mt-1 mb-6 text-sm text-texto-2">Facturación, stock, cuentas corrientes y tesorería en un solo lugar.</p>
        <FormularioIngreso volver={typeof volver === 'string' ? volver : undefined} />
      </div>
    </main>
  )
}
