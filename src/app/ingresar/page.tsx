import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Logo } from '@/components/sitio/Logo'
import { sesionActual } from '@/lib/auth/servidor'

import { FormularioIngreso } from './FormularioIngreso'

export const metadata: Metadata = { title: 'Ingresar' }

export default async function PaginaIngreso({ searchParams }: PageProps<'/ingresar'>) {
  if (await sesionActual()) redirect('/')
  const { volver } = await searchParams
  return (
    <main className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 inline-flex" aria-label="Vektra ERP, inicio">
          <Logo />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Ingresá a tu empresa</h1>
        <p className="mt-1 mb-6 text-sm text-texto-2">Facturación, stock, cuentas corrientes y tesorería en un solo lugar.</p>
        <FormularioIngreso volver={typeof volver === 'string' ? volver : undefined} />
        <p className="mt-6 text-center text-sm text-texto-2">
          ¿Todavía no lo usás?{' '}
          <Link href="/registro" className="text-acento hover:underline">
            Probalo gratis 30 días
          </Link>{' '}
          ·{' '}
          <Link href="/precios" className="text-acento hover:underline">
            Planes
          </Link>
        </p>
      </div>
    </main>
  )
}
