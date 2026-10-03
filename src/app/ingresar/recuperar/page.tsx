import type { Metadata } from 'next'
import Link from 'next/link'

import { MarcoAcceso } from '@/components/MarcoAcceso'

import { PedirEnlace } from './Formularios'

export const metadata: Metadata = { title: 'Olvidé mi contraseña' }

export default function Recuperar() {
  return (
    <MarcoAcceso>
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight">¿Olvidaste tu contraseña?</h1>
      <p className="mt-1 mb-6 text-sm text-texto-2">Te mandamos un enlace para elegir una nueva.</p>
      <PedirEnlace />
      <p className="mt-6 text-center text-sm text-texto-2">
        <Link href="/ingresar" className="text-acento hover:underline">
          Volver a ingresar
        </Link>
      </p>
    </MarcoAcceso>
  )
}
