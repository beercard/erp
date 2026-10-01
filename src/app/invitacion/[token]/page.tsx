import type { Metadata } from 'next'

import { leerInvitacion } from '@/modulos/empresa/usuarios'

import { FormularioAceptar } from './FormularioAceptar'

export const metadata: Metadata = { title: 'Invitación' }

export default async function Invitacion({ params }: PageProps<'/invitacion/[token]'>) {
  const { token } = await params
  const inv = await leerInvitacion(token)
  return (
    <main className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        {!inv ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Esta invitación ya no sirve</h1>
            <p className="mt-2 text-sm text-texto-2">Venció o ya se usó. Pedile a quien te invitó que te mande una nueva.</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-balance">Te invitaron a {inv.empresa}</h1>
            <p className="mt-1 mb-6 text-sm text-texto-2">
              Con el rol <strong className="font-medium text-texto">{inv.rol}</strong>, para {inv.email}.
              {inv.usuarioExistente ? ' Ya tenés cuenta: confirmá con tu contraseña.' : ' Elegí tu nombre y una contraseña.'}
            </p>
            <FormularioAceptar token={token} existente={Boolean(inv.usuarioExistente)} />
          </>
        )}
      </div>
    </main>
  )
}
