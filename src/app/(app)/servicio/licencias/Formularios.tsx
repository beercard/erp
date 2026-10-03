'use client'

import { Trash2 } from 'lucide-react'
import { useActionState, useState, useTransition } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { borrarExcepcionAccion, guardarExcepcionAccion } from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'

export function NuevaExcepcion({ tecnicos, hoy }: { tecnicos: { id: string; nombre: string }[]; hoy: string }) {
  const [estado, accion, enviando] = useActionState(guardarExcepcionAccion, undefined)
  const [tipo, setTipo] = useState('ausencia')
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <label className="flex flex-col gap-1 lg:col-span-2">
        <span className={etiqueta}>Técnico</span>
        <select name="tecnicoId" defaultValue="" className={control}>
          <option value="">Todos (feriado)</option>
          {tecnicos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Desde</span>
        <input type="date" name="desde" required defaultValue={hoy} className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Hasta (si es más de un día)</span>
        <input type="date" name="hasta" className={control} />
      </label>
      <label className="flex flex-col gap-1 lg:col-span-2">
        <span className={etiqueta}>Motivo</span>
        <input name="motivo" required placeholder="Vacaciones, feriado, médico, capacitación…" className={control} />
      </label>
      <fieldset className="flex flex-wrap items-center gap-4 text-sm lg:col-span-6">
        <label className="flex items-center gap-1">
          <input type="radio" name="tipo" value="ausencia" checked={tipo === 'ausencia'} onChange={() => setTipo('ausencia')} />
          No trabaja
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name="tipo" value="horario" checked={tipo === 'horario'} onChange={() => setTipo('horario')} />
          Horario especial
        </label>
        {tipo === 'horario' && (
          <>
            <input type="time" name="jornadaDesde" required aria-label="Desde" className={control} />
            <span>a</span>
            <input type="time" name="jornadaHasta" required aria-label="Hasta" className={control} />
          </>
        )}
        <Boton type="submit" variante="primario" disabled={enviando} className="ml-auto">
          Agregar
        </Boton>
      </fieldset>
      <div className="lg:col-span-6">
        {estado?.error && <Aviso>{estado.error}</Aviso>}
        {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      </div>
    </form>
  )
}

export function BorrarExcepcion({ id }: { id: string }) {
  const [borrando, iniciar] = useTransition()
  const [error, setError] = useState('')
  return (
    <>
      <button
        type="button"
        title="Borrar"
        aria-label="Borrar"
        disabled={borrando}
        onClick={() =>
          iniciar(async () => {
            const r = await borrarExcepcionAccion(id)
            if (!r.ok) setError(r.error)
          })
        }
        className="text-texto-3 hover:text-error"
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
      {error && <span className="text-xs text-error">{error}</span>}
    </>
  )
}
