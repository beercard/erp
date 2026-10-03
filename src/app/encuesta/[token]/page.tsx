import type { Metadata } from 'next'

import { Panel } from '@/components/ui'
import { encuestaPublica } from '@/modulos/servicio/avisos'

import { FormularioEncuesta } from './Formulario'

export const metadata: Metadata = { title: 'Encuesta de satisfacción', robots: { index: false, follow: false } }

/** Encuesta de satisfacción del servicio técnico: la responde el cliente desde el enlace, sin usuario. */
export default async function Encuesta({ params }: PageProps<'/encuesta/[token]'>) {
  const { token } = await params
  const e = await encuestaPublica(decodeURIComponent(token)).catch(() => null)
  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-4 px-4 py-10">
      {!e ? (
        <Panel className="p-6 text-sm text-texto-2">El enlace no es válido o venció.</Panel>
      ) : (
        <>
          <header>
            <p className="text-sm text-texto-2">{e.empresa}</p>
            <h1 className="text-xl font-semibold">¿Cómo lo atendimos?</h1>
            <p className="mt-1 text-sm text-texto-2">
              Servicio técnico N° {e.numero}
              {e.equipo ? ` · ${e.equipo}` : ''}
              {e.tecnico ? ` · ${e.tecnico}` : ''}
            </p>
            {e.trabajo && <p className="mt-2 text-sm text-texto-3">{e.trabajo}</p>}
          </header>
          <Panel className="p-5">
            {e.respondida ? (
              <p className="text-sm">Esta encuesta ya fue respondida. ¡Gracias!</p>
            ) : (
              <FormularioEncuesta token={decodeURIComponent(token)} />
            )}
          </Panel>
        </>
      )}
    </main>
  )
}
