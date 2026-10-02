import type { Metadata } from 'next'

import { Panel } from '@/components/ui'
import { leerInvitacion } from '@/modulos/portal/portal'

import { FormularioClave } from '../../Formularios'
import { colores } from '../../sesion'

export const metadata: Metadata = { title: 'Portal de clientes', robots: { index: false, follow: false } }

/** Invitación al portal (o enlace de "olvidé mi contraseña"): el cliente elige su contraseña. */
export default async function Invitacion({ params }: PageProps<'/portal/invitacion/[token]'>) {
  const token = decodeURIComponent((await params).token)
  const i = await leerInvitacion(token).catch(() => null)
  return (
    <main style={i ? colores(i.color) : undefined} className="mx-auto flex min-h-full w-full max-w-sm flex-col gap-4 px-4 py-12">
      {!i ? (
        <Panel className="p-5 text-sm text-texto-2">
          El enlace no es válido o venció. Pedile a tu proveedor que te mande uno nuevo, o usá “Olvidé mi contraseña” al ingresar.
        </Panel>
      ) : (
        <>
          <header>
            <p className="text-sm text-texto-2">{i.empresa}</p>
            <h1 className="text-xl font-semibold">
              {i.nueva ? 'Bienvenido al portal de clientes' : 'Elegí una contraseña nueva'}
            </h1>
            <p className="mt-1 text-sm text-texto-2">
              {i.cliente} · {i.email}
            </p>
          </header>
          <Panel className="p-5">
            <FormularioClave token={token} />
          </Panel>
        </>
      )}
    </main>
  )
}
