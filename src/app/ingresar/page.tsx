import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Aviso } from '@/components/ui'
import { MarcoAcceso } from '@/components/MarcoAcceso'
import { sesionActual } from '@/lib/auth/servidor'

import { FormularioIngreso } from './FormularioIngreso'
import { LimpiarCache } from './LimpiarCache'

export const metadata: Metadata = { title: 'Ingresar' }

export default async function PaginaIngreso({ searchParams }: PageProps<'/ingresar'>) {
  if (await sesionActual()) redirect('/')
  const { volver, clave } = await searchParams
  return (
    <MarcoAcceso>
      <LimpiarCache />
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Ingresá a tu empresa</h1>
      <p className="mt-1 mb-6 text-sm text-texto-2">Facturación, stock, cuentas corrientes y tesorería en un solo lugar.</p>
      {clave && (
        <div className="mb-4">
          <Aviso tono="ok">Listo: tu contraseña nueva ya funciona. Ingresá con ella.</Aviso>
        </div>
      )}
      <FormularioIngreso volver={typeof volver === 'string' ? volver : undefined} />
      <p className="mt-3 text-right text-sm">
        <Link href="/ingresar/recuperar" className="text-acento hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
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
    </MarcoAcceso>
  )
}
