'use client'

import { useActionState } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { saldosInicialesAccion } from './acciones'

/** Saldos a favor con los que arranca el mes, cuando el anterior no se presentó desde el sistema. */
export function SaldosIniciales({ periodo, tecnico, libre }: { periodo: string; tecnico: number; libre: number }) {
  const [estado, accion, enviando] = useActionState(saldosInicialesAccion.bind(null, periodo), undefined)
  const control = 'h-8 w-full rounded-md border border-borde bg-superficie px-2 text-xs'
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-acento">Cargar los saldos a favor del mes anterior</summary>
      <form action={accion} className="mt-2 grid gap-2">
        <label className="flex flex-col gap-1">
          Saldo técnico a favor
          <input
            name="tecnico"
            inputMode="decimal"
            defaultValue={tecnico ? String(tecnico).replace('.', ',') : ''}
            className={`${control} cifras`}
          />
        </label>
        <label className="flex flex-col gap-1">
          Saldo de libre disponibilidad
          <input
            name="libre"
            inputMode="decimal"
            defaultValue={libre ? String(libre).replace('.', ',') : ''}
            className={`${control} cifras`}
          />
        </label>
        <div>
          <Boton type="submit" disabled={enviando} className="h-8 px-2 text-xs">
            Guardar
          </Boton>
        </div>
        {estado?.error && <Aviso>{estado.error}</Aviso>}
        {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      </form>
    </details>
  )
}
