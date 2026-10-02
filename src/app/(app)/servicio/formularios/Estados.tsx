'use client'

import { Trash2 } from 'lucide-react'
import { useActionState, useTransition, useState } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { borrarEstadoAccion, guardarEstadoAccion, type Estado } from './acciones'

type EstadoBandeja = { id: string; nombre: string; color: string; orden: number; final: boolean; inicial: boolean }

const control = 'h-8 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'

function Fila({ e }: { e: EstadoBandeja | null }) {
  const [estado, accion, enviando] = useActionState(guardarEstadoAccion.bind(null, e?.id ?? null), undefined)
  const [borrado, setBorrado] = useState<Estado>()
  const [borrando, iniciar] = useTransition()
  const r = borrado ?? estado
  return (
    <li className="flex flex-col gap-1 py-2">
      <form action={accion} className="flex flex-wrap items-center gap-2 text-sm">
        <input type="color" name="color" defaultValue={e?.color ?? '#0ea5e9'} className="h-8 w-10 rounded border border-borde" />
        <input name="nombre" defaultValue={e?.nombre ?? ''} placeholder="Nuevo estado" required className={`${control} w-40`} />
        <input
          name="orden"
          defaultValue={e?.orden ?? 5}
          inputMode="numeric"
          aria-label="Orden"
          className={`${control} cifras w-12`}
        />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="inicial" defaultChecked={e?.inicial} /> Entran acá
        </label>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="final" defaultChecked={e?.final} /> Final (ya no está pendiente)
        </label>
        <Boton type="submit" disabled={enviando} className="h-8 px-2 text-xs">
          {e ? 'Guardar' : 'Agregar'}
        </Boton>
        {e && (
          <button
            type="button"
            title="Borrar el estado"
            disabled={borrando}
            onClick={() => iniciar(async () => setBorrado(await borrarEstadoAccion(e.id)))}
            className="text-texto-3 hover:text-error"
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        )}
      </form>
      {r?.error && <Aviso>{r.error}</Aviso>}
    </li>
  )
}

/** Estados de la bandeja de entrada, con su color (como en Persat). */
export function EstadosBandeja({ estados }: { estados: EstadoBandeja[] }) {
  return (
    <ul className="divide-y divide-borde">
      {estados.map((e) => (
        <Fila key={`${e.id}-${e.nombre}-${e.color}-${e.inicial}-${e.final}`} e={e} />
      ))}
      <Fila key={`nuevo-${estados.length}`} e={null} />
    </ul>
  )
}
