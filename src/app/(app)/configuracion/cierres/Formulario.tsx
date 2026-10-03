'use client'

import { useActionState } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { fijarBloqueoAccion } from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'

export function FormularioBloqueo({ modulo, actual, hoy }: { modulo: string; actual: string | null; hoy: string }) {
  const [estado, accion, enviando] = useActionState(fijarBloqueoAccion.bind(null, modulo), undefined)
  const ayer = new Date(new Date(`${hoy}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10)
  return (
    <form action={accion} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-texto-2">Cerrado hasta</span>
        <input type="date" name="cerradoHasta" defaultValue={actual ?? ''} max={ayer} className={control} />
      </label>
      <Boton type="submit" disabled={enviando}>
        Guardar
      </Boton>
      {actual && (
        <Boton type="submit" name="reabrir" value="1" disabled={enviando}>
          Reabrir
        </Boton>
      )}
      {estado?.error && (
        <div className="w-full">
          <Aviso>{estado.error}</Aviso>
        </div>
      )}
    </form>
  )
}
