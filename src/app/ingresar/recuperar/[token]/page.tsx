import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso } from '@/components/ui'
import { MarcoAcceso } from '@/components/MarcoAcceso'
import { leerRecuperacion } from '@/lib/auth/recuperar'

import { ClaveNueva } from '../Formularios'

export const metadata: Metadata = { title: 'Contraseña nueva', referrer: 'no-referrer' }

export default async function ClaveNuevaPagina({ params }: PageProps<'/ingresar/recuperar/[token]'>) {
  const { token } = await params
  const r = await leerRecuperacion(token)
  return (
    <MarcoAcceso>
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Contraseña nueva</h1>
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
    </MarcoAcceso>
  )
}
