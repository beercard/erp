'use client'

import { Copy } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Aviso, Boton, Campo, Selector } from '@/components/ui'

import { invitarAccion } from './acciones'

export function FormularioInvitacion({ roles }: { roles: { valor: string; texto: string }[] }) {
  const [estado, accion, enviando] = useActionState(invitarAccion, undefined)
  const [copiado, setCopiado] = useState(false)

  async function copiar(enlace: string) {
    try {
      await navigator.clipboard.writeText(enlace)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={accion} className="flex flex-wrap items-end gap-3">
        <Campo id="email" name="email" type="email" etiqueta="Email" className="min-w-56 flex-1" required />
        <Selector
          id="rolId"
          name="rolId"
          etiqueta="Rol"
          opciones={roles}
          defaultValue={roles.find((r) => r.texto === 'Ventas')?.valor}
        />
        <Boton type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Generando…' : 'Invitar'}
        </Boton>
      </form>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.enlace && (
        <div className="rounded-md border border-acento bg-acento-suave p-3 text-sm">
          <p className="font-medium text-texto">Enlace de invitación para {estado.email}</p>
          <p className="mt-0.5 text-xs text-texto-2">
            Mandáselo por el medio que prefieras. Sirve una sola vez y vence el {estado.vence}. Por seguridad no se vuelve a
            mostrar.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={estado.enlace}
              onFocus={(e) => e.currentTarget.select()}
              className="cifras h-9 min-w-0 flex-1 rounded-md border border-borde bg-superficie px-2 text-xs"
              aria-label="Enlace de invitación"
            />
            <Boton type="button" onClick={() => copiar(estado.enlace!)}>
              <Copy aria-hidden className="size-4" /> {copiado ? 'Copiado' : 'Copiar'}
            </Boton>
          </div>
        </div>
      )}
    </div>
  )
}
