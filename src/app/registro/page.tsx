import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { sesionActual } from '@/lib/auth/servidor'

import { FormularioRegistro } from './FormularioRegistro'

export const metadata: Metadata = { title: 'Probar gratis' }

export default async function PaginaRegistro() {
  if (await sesionActual()) redirect('/empresas')
  return (
    <main className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/precios" className="mb-8 flex items-center gap-2.5">
          <span aria-hidden className="grid size-8 place-items-center rounded-md bg-acento text-sm font-bold text-sobre-acento">
            E
          </span>
          <span className="text-base font-semibold tracking-tight">ERP</span>
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
