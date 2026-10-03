'use client'

import { useActionState } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { cambiarEstadoAccion } from '../../formularios/acciones'

export function CambiarEstado({
  id,
  estadoId,
  nota,
  estados,
}: {
  id: string
  estadoId: string | null
  nota: string | null
  estados: { id: string; nombre: string; color: string }[]
}) {
  const [estado, accion, enviando] = useActionState(cambiarEstadoAccion.bind(null, id), undefined)
  return (
    <form action={accion} className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 text-xs font-medium text-texto-2">Estado</legend>
        {estados.map((e) => (
          <label
            key={e.id}
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-borde px-3 py-1 text-xs has-checked:border-acento has-checked:bg-acento-suave has-checked:font-medium"
          >
            <input type="radio" name="estadoId" value={e.id} defaultChecked={e.id === estadoId} className="sr-only" />
            <span aria-hidden className="size-2 rounded-full" style={{ background: e.color }} />
            {e.nombre}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-texto-2">Nota interna (no la ve el cliente)</span>
        <textarea
          name="nota"
          rows={3}
          defaultValue={nota ?? ''}
          className="rounded-md border border-borde bg-superficie px-2 py-1.5 text-sm focus:border-acento"
        />
      </label>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <div>
        <Boton type="submit" variante="primario" disabled={enviando}>
          Guardar
        </Boton>
      </div>
    </form>
  )
}
