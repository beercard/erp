import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { exigirPermiso } from '@/lib/auth/servidor'

import { FormularioCuenta } from '../../FormulariosTesoreria'

export const metadata: Metadata = { title: 'Nueva cuenta de tesorería' }

export default async function NuevaCuenta() {
  await exigirPermiso('tesoreria.mover')
  return (
    <>
      <Link href="/tesoreria" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Tesorería
      </Link>
      <EncabezadoPagina
        titulo="Nueva cuenta"
        bajada="Una caja, una cuenta bancaria, Mercado Pago, los cupones de tarjeta a acreditar o una tarjeta de la empresa."
      />
      <Panel className="p-4">
        <FormularioCuenta id={null} />
      </Panel>
    </>
  )
}
