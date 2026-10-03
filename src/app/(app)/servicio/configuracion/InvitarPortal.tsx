'use client'

import { Copy, MessageCircle } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Buscador } from '@/components/comercial/Buscador'
import { Aviso, Boton } from '@/components/ui'

import { buscarClientesServicio } from '../acciones'
import { invitarPortalAccion } from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'
type Cliente = Awaited<ReturnType<typeof buscarClientesServicio>>[number]

/** Invitar a un usuario del cliente al portal: le llega un email y queda el enlace para mandarlo por WhatsApp. */
export function InvitarPortal() {
  const [estado, accion, enviando] = useActionState(invitarPortalAccion, undefined)
  const [cliente, setCliente] = useState<{ id: string; razonSocial: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1.5fr_auto] lg:items-end">
        <div className="flex flex-col gap-1">
          <span className={etiqueta}>Cliente</span>
          <input type="hidden" name="terceroId" value={cliente?.id ?? ''} />
          {cliente ? (
            <div className="flex h-9 items-center justify-between rounded-lg border border-borde-fuerte/80 bg-superficie-2 px-2.5">
              <span className="truncate text-sm font-medium">{cliente.razonSocial}</span>
              <button type="button" onClick={() => setCliente(null)} className="text-xs text-acento hover:underline">
                Cambiar
              </button>
            </div>
          ) : (
            <Buscador<Cliente>
              etiqueta="Buscar cliente"
              placeholder="Nombre, código o CUIT"
              buscar={buscarClientesServicio}
              clave={(c) => c.id}
              render={(c) => c.razonSocial}
              alElegir={(c) => setCliente({ id: c.id, razonSocial: c.razonSocial })}
            />
          )}
        </div>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Email del usuario</span>
          <input name="email" type="email" required className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Nombre</span>
          <input name="nombre" className={control} />
        </label>
        <Boton type="submit" variante="primario" disabled={enviando || !cliente}>
          Invitar
        </Boton>
      </form>
      {estado && !estado.ok && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && (
        <div className="flex flex-col gap-2 rounded-md border border-borde p-3 text-sm">
          <p className="text-xs text-texto-2">Invitación enviada a {estado.email}. También podés mandarle el enlace:</p>
          <code className="text-xs break-all">{estado.enlace}</code>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(estado.texto)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#25D366] px-3 text-sm font-medium text-white hover:opacity-90"
            >
              <MessageCircle aria-hidden className="size-4" /> WhatsApp
            </a>
            <Boton
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(estado.enlace).then(
                  () => setCopiado(true),
                  () => setCopiado(false),
                )
              }
            >
              <Copy aria-hidden className="size-4" /> {copiado ? 'Copiado' : 'Copiar el enlace'}
            </Boton>
          </div>
        </div>
      )}
    </div>
  )
}
