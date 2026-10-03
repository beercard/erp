import type { Metadata } from 'next'
import Link from 'next/link'

import { Logo } from '@/components/sitio/Logo'

import { PedirEnlace } from './Formularios'

export const metadata: Metadata = { title: 'Olvidé mi contraseña' }

export default function Recuperar() {
  return (
    <main className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 inline-flex" aria-label="Vektra ERP, inicio">
          <Logo />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">¿Olvidaste tu contraseña?</h1>
        <p className="mt-1 mb-6 text-sm text-texto-2">Te mandamos un enlace para elegir una nueva.</p>
        <PedirEnlace />
        <p className="mt-6 text-center text-sm text-texto-2">
          <Link href="/ingresar" className="text-acento hover:underline">
            Volver a ingresar
          </Link>
        </p>
      </div>
    </main>
  )
}
