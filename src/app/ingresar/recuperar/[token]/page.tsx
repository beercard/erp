import type { Metadata } from 'next'
import Link from 'next/link'

import { Logo } from '@/components/sitio/Logo'
import { Aviso } from '@/components/ui'
import { leerRecuperacion } from '@/lib/auth/recuperar'

import { ClaveNueva } from '../Formularios'

export const metadata: Metadata = { title: 'Contraseña nueva', referrer: 'no-referrer' }

export default async function ClaveNuevaPagina({ params }: PageProps<'/ingresar/recuperar/[token]'>) {
  const { token } = await params
  const r = await leerRecuperacion(token)
  return (
    <main className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 inline-flex" aria-label="Vektra ERP, inicio">
          <Logo />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Contraseña nueva</h1>
        {r ? (
          <>
            <p className="mt-1 mb-6 text-sm text-texto-2">Para {r.email}. Al guardarla se cierran las sesiones abiertas.</p>
            <ClaveNueva token={token} />
          </>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <Aviso>El enlace venció o ya se usó.</Aviso>
            <Link href="/ingresar/recuperar" className="text-sm text-acento hover:underline">
              Pedir un enlace nuevo
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
