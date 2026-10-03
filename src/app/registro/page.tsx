import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Logo } from '@/components/sitio/Logo'
import { sesionActual } from '@/lib/auth/servidor'

import { FormularioRegistro } from './FormularioRegistro'

export const metadata: Metadata = {
  title: 'Probar gratis 30 días',
  description: 'Creá tu cuenta de Vektra ERP y probá 30 días la gestión completa de tu pyme, sin tarjeta.',
  alternates: { canonical: '/registro' },
  robots: { index: true, follow: true },
}

export default async function PaginaRegistro() {
  if (await sesionActual()) redirect('/empresas')
  return (
    <main className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 inline-flex" aria-label="Vektra ERP, inicio">
          <Logo />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Probá gratis 30 días</h1>
        <p className="mt-1 mb-6 text-sm text-texto-2">
          Facturación electrónica, stock, compras, cuentas corrientes y bancos. Al terminar elegís un plan, o seguís gratis
          facturando hasta 20 comprobantes por mes.
        </p>
        <FormularioRegistro />
        <p className="mt-6 text-center text-sm text-texto-2">
          ¿Ya tenés cuenta?{' '}
          <Link href="/ingresar" className="text-acento hover:underline">
            Ingresá
          </Link>
        </p>
      </div>
    </main>
  )
}
