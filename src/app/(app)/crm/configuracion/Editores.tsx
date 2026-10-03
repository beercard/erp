'use client'

import { ArrowDown, ArrowUp, Trash2, Trophy } from 'lucide-react'
import { useActionState, useEffect, useRef } from 'react'

import { Boton } from '@/components/ui'

import { activarMotivoAccion, borrarEtapaAccion, guardarEtapaAccion, guardarMotivoAccion, moverEtapaAccion } from '../acciones'

type Etapa = { id: string; nombre: string; probabilidad: number; ganada: boolean; diasAlerta: number | null }

const campo = 'h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-2.5 text-sm shadow-suave'

function FilaEtapa({ etapa, primera, ultima }: { etapa: Etapa | null; primera?: boolean; ultima?: boolean }) {
  const [estado, accion, enviando] = useActionState(guardarEtapaAccion.bind(null, etapa?.id ?? null), undefined)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado?.ok && !etapa) form.current?.reset()
  }, [estado, etapa])
  return (
    <li className="py-3">
      <form ref={form} action={accion} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-texto-2">
          {etapa ? 'Etapa' : 'Nueva etapa'}
          <input name="nombre" required defaultValue={etapa?.nombre} placeholder="Ej.: Demo hecha" className={campo} />
        </label>
        <label className="flex w-24 flex-col gap-1 text-xs text-texto-2">
          Prob. %
          <input
            name="probabilidad"
            type="number"
            min={0}
            max={100}
            required
            defaultValue={etapa?.probabilidad ?? 50}
            className={campo}
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-xs text-texto-2">
          Días de alerta
          <input
            name="diasAlerta"
            type="number"
            min={1}
            max={365}
            defaultValue={etapa?.diasAlerta ?? ''}
            placeholder="Sin alerta"
            className={campo}
          />
        </label>
        <label className="flex h-9 items-center gap-1.5 text-sm">
          <input name="ganada" type="checkbox" defaultChecked={etapa?.ganada} />
          <Trophy aria-hidden className="size-4 text-ok" /> Ganada
        </label>
        <Boton type="submit" disabled={enviando} variante={etapa ? 'secundario' : 'primario'}>
          {etapa ? 'Guardar' : 'Agregar'}
        </Boton>
        {etapa && (
          <span className="flex gap-0.5">
            <button
              type="submit"
              formAction={moverEtapaAccion.bind(null, etapa.id, -1)}
              disabled={primera}
              aria-label="Subir"
              className="grid size-9 place-items-center rounded-lg text-texto-2 hover:bg-superficie-2 disabled:opacity-30"
            >
              <ArrowUp aria-hidden className="size-4" />
            </button>
            <button
              type="submit"
              formAction={moverEtapaAccion.bind(null, etapa.id, 1)}
              disabled={ultima}
              aria-label="Bajar"
              className="grid size-9 place-items-center rounded-lg text-texto-2 hover:bg-superficie-2 disabled:opacity-30"
            >
              <ArrowDown aria-hidden className="size-4" />
            </button>
            <button
              type="submit"
              formAction={borrarEtapaAccion.bind(null, etapa.id)}
              formNoValidate
              aria-label="Borrar etapa"
              className="grid size-9 place-items-center rounded-lg text-texto-3 hover:bg-error-suave hover:text-error"
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          </span>
        )}
      </form>
      {estado?.error && <p className="mt-1 text-sm text-error">{estado.error}</p>}
      {estado?.ok && etapa && <p className="mt-1 text-sm text-ok">Guardada.</p>}
    </li>
  )
}

export function EditorEtapas({ etapas }: { etapas: Etapa[] }) {
  return (
    <ol className="divide-y divide-borde px-5 pb-2">
      {etapas.map((e, n) => (
        <FilaEtapa
          key={`${e.id}-${e.nombre}-${e.probabilidad}-${e.diasAlerta}-${e.ganada}`}
          etapa={e}
          primera={n === 0}
          ultima={n === etapas.length - 1}
        />
      ))}
      <FilaEtapa etapa={null} />
    </ol>
  )
}

export function EditorMotivos({ motivos }: { motivos: { id: string; nombre: string; activo: boolean }[] }) {
  const [estado, accion, enviando] = useActionState(guardarMotivoAccion, undefined)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado?.ok) form.current?.reset()
  }, [estado])
  return (
    <div className="p-5">
      <ul className="flex flex-col gap-1">
        {motivos.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-superficie-2">
            <span className={m.activo ? '' : 'text-texto-3 line-through'}>{m.nombre}</span>
            <form action={activarMotivoAccion.bind(null, m.id, !m.activo)}>
              <button type="submit" className="text-xs font-medium text-acento hover:underline">
                {m.activo ? 'Desactivar' : 'Activar'}
              </button>
            </form>
          </li>
        ))}
      </ul>
      <form ref={form} action={accion} className="mt-4 flex gap-2">
        <input
          name="nombre"
          required
          placeholder="Nuevo motivo"
          aria-label="Nuevo motivo"
          className={`${campo} min-w-0 flex-1`}
        />
        <Boton type="submit" disabled={enviando}>
          Agregar
        </Boton>
      </form>
      {estado?.error && <p className="mt-2 text-sm text-error">{estado.error}</p>}
    </div>
  )
}
