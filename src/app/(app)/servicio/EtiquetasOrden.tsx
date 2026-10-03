'use client'

import { Tag } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Boton } from '@/components/ui'

import { etiquetasOrdenAccion } from './acciones'

type Etiqueta = { id: string; nombre: string; color: string }

/** Pastilla de una etiqueta con su color. */
export function ChipEtiqueta({ e }: { e: Etiqueta }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ borderColor: e.color, color: e.color }}
    >
      {e.nombre}
    </span>
  )
}

/** Las etiquetas de la orden y, para quien coordina, el editor (se marcan y se guarda). */
export function EtiquetasOrden({
  id,
  actuales,
  disponibles,
  editar,
}: {
  id: string
  actuales: Etiqueta[]
  disponibles: Etiqueta[]
  editar: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [elegidas, setElegidas] = useState(actuales.map((e) => e.id))
  const [error, setError] = useState('')
  const [guardando, iniciar] = useTransition()
  // Las que tiene aunque estén inactivas, más las activas.
  const opciones = [...actuales, ...disponibles.filter((d) => !actuales.some((a) => a.id === d.id))]
  if (!editar && !actuales.length) return null
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {!abierto && actuales.map((e) => <ChipEtiqueta key={e.id} e={e} />)}
      {editar && !abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-1 text-xs text-acento hover:underline"
        >
          <Tag aria-hidden className="size-3.5" /> {actuales.length ? 'Cambiar etiquetas' : 'Agregar etiquetas'}
        </button>
      )}
      {abierto &&
        (opciones.length ? (
          <>
            {opciones.map((e) => {
              const on = elegidas.includes(e.id)
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setElegidas(on ? elegidas.filter((x) => x !== e.id) : [...elegidas, e.id])}
                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                  style={
                    on ? { background: e.color, borderColor: e.color, color: '#fff' } : { borderColor: e.color, color: e.color }
                  }
                >
                  {e.nombre}
                </button>
              )
            })}
            <Boton
              type="button"
              variante="primario"
              disabled={guardando}
              className="h-7 px-2 text-xs"
              onClick={() =>
                iniciar(async () => {
                  const r = await etiquetasOrdenAccion(id, elegidas)
                  if (r.ok) {
                    setError('')
                    setAbierto(false)
                  } else setError(r.error)
                })
              }
            >
              Guardar
            </Boton>
            <Boton type="button" variante="fantasma" className="h-7 px-2 text-xs" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
          </>
        ) : (
          <span className="text-xs text-texto-2">No hay etiquetas: se crean en Servicio técnico › Configuración.</span>
        ))}
      {error && <span className="text-xs text-error">{error}</span>}
    </div>
  )
}
