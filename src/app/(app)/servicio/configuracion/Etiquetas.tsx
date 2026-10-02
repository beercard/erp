'use client'

import { useActionState } from 'react'

import { Boton } from '@/components/ui'

import { guardarEtiquetaAccion } from './acciones'

type Etiqueta = { id: string; nombre: string; color: string; activa: boolean }

const control = 'h-8 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'

function Fila({ e }: { e: Etiqueta | null }) {
  const [estado, accion, enviando] = useActionState(guardarEtiquetaAccion.bind(null, e?.id ?? null), undefined)
  return (
    <li className="py-2">
      <form action={accion} className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="color"
          name="color"
          aria-label="Color"
          defaultValue={e?.color ?? '#0ea5e9'}
          className="h-8 w-10 rounded border border-borde"
        />
        <input
          name="nombre"
          defaultValue={e?.nombre ?? ''}
          placeholder="Nueva etiqueta (ej. Espera repuesto)"
          required
          className={`${control} w-56`}
        />
        {e && (
          <select name="activa" defaultValue={e.activa ? 'on' : 'off'} aria-label="Estado" className={control}>
            <option value="on">Activa</option>
            <option value="off">Inactiva</option>
          </select>
        )}
        <Boton type="submit" disabled={enviando} className="h-8 px-2 text-xs">
          {e ? 'Guardar' : 'Agregar'}
        </Boton>
        {estado?.error && <span className="text-xs text-error">{estado.error}</span>}
        {estado?.ok && e && <span className="text-xs text-ok">{estado.ok}</span>}
      </form>
    </li>
  )
}

/** Etiquetas de colores para las órdenes (como en Persat). Una inactiva sigue en las órdenes que la tienen. */
export function Etiquetas({ etiquetas }: { etiquetas: Etiqueta[] }) {
  return (
    <ul className="divide-y divide-borde">
      {etiquetas.map((e) => (
        <Fila key={`${e.id}-${e.nombre}-${e.color}-${e.activa}`} e={e} />
      ))}
      <Fila key={`nueva-${etiquetas.length}`} e={null} />
    </ul>
  )
}
