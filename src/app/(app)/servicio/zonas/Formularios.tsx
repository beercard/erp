'use client'

import { Trash2 } from 'lucide-react'
import { useActionState, useState, useTransition } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { borrarZonaAccion, guardarZonaAccion, zonasTecnicoAccion } from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'

export function NuevaZona() {
  const [estado, accion, enviando] = useActionState(guardarZonaAccion, undefined)
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <label className="flex flex-col gap-1 lg:col-span-2">
        <span className={etiqueta}>Nombre</span>
        <input name="nombre" required placeholder="GBA Norte, Rosario, Microcentro…" className={control} />
      </label>
      <label className="flex flex-col gap-1 lg:col-span-2">
        <span className={etiqueta}>Centro (dirección)</span>
        <input name="direccion" placeholder="Av. Corrientes 1000, CABA" className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>o latitud</span>
        <input name="lat" inputMode="decimal" placeholder="-34.6037" className={`${control} cifras`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>y longitud</span>
        <input name="lng" inputMode="decimal" placeholder="-58.3816" className={`${control} cifras`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Radio (km)</span>
        <input name="radioKm" inputMode="decimal" required defaultValue="10" className={`${control} cifras`} />
      </label>
      <div className="flex items-end lg:col-span-5">
        <Boton type="submit" variante="primario" disabled={enviando}>
          Agregar
        </Boton>
      </div>
      <div className="lg:col-span-6">
        {estado?.error && <Aviso>{estado.error}</Aviso>}
        {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      </div>
    </form>
  )
}

export function BorrarZona({ id, nombre }: { id: string; nombre: string }) {
  const [borrando, iniciar] = useTransition()
  const [error, setError] = useState('')
  return (
    <>
      <button
        type="button"
        title={`Borrar ${nombre}`}
        aria-label={`Borrar ${nombre}`}
        disabled={borrando}
        onClick={() => {
          if (!window.confirm(`¿Borrar la zona ${nombre}? Se les quita a los técnicos que la tienen.`)) return
          iniciar(async () => {
            const r = await borrarZonaAccion(id)
            if (!r.ok) setError(r.error)
          })
        }}
        className="text-texto-3 hover:text-error"
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
      {error && <span className="text-xs text-error">{error}</span>}
    </>
  )
}

export function ZonasDelTecnico({
  tecnicoId,
  zonas,
  elegidas,
}: {
  tecnicoId: string
  zonas: { id: string; nombre: string }[]
  elegidas: string[]
}) {
  const [estado, accion, enviando] = useActionState(zonasTecnicoAccion.bind(null, tecnicoId), undefined)
  return (
    <form action={accion} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {zonas.map((z) => (
        <label key={z.id} className="flex items-center gap-1">
          <input type="checkbox" name="zona" value={z.id} defaultChecked={elegidas.includes(z.id)} /> {z.nombre}
        </label>
      ))}
      <Boton type="submit" disabled={enviando} className="h-8 px-2 text-xs">
        Guardar
      </Boton>
      {estado?.error && <span className="text-xs text-error">{estado.error}</span>}
      {estado?.ok && <span className="text-xs text-ok">{estado.ok}</span>}
    </form>
  )
}
