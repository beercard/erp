'use client'

import { useActionState, useState } from 'react'

import { Aviso, Boton, Panel } from '@/components/ui'

import { fijarCotizacionAccion } from './comercial/acciones'

/** Dólar del día: lo usan los documentos en dólares y la conversión de precios. */
export function WidgetCotizacion({
  vigente,
  hoy,
  puedeCargar,
}: {
  vigente: { valor: string; fecha: string; fuente: string } | null
  hoy: string
  puedeCargar: boolean
}) {
  const [estado, accion, enviando] = useActionState(fijarCotizacionAccion, undefined)
  const [editando, setEditando] = useState(false)
  const desactualizada = !vigente || vigente.fecha !== hoy
  return (
    <Panel className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Dólar</h2>
        {vigente && (
          <span className="text-xs text-texto-3">
            {vigente.fecha === hoy ? 'de hoy' : `del ${vigente.fecha.split('-').reverse().join('/')}`}
          </span>
        )}
      </div>
      <p className="cifras mt-1 text-2xl font-medium">
        {vigente ? `$ ${Number(vigente.valor).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—'}
      </p>
      {desactualizada && !estado?.ok && (
        <p className="mt-1 text-xs text-aviso">
          {vigente ? 'No se cargó la de hoy: los documentos usan la última.' : 'Todavía no hay cotización cargada.'}
        </p>
      )}
      {puedeCargar &&
        (editando || desactualizada ? (
          <form action={accion} className="mt-3 flex flex-col gap-2">
            <input type="hidden" name="moneda" value="DOL" />
            <input type="hidden" name="fecha" value={hoy} />
            <div className="flex gap-2">
              <label htmlFor="cotizacion-dol" className="sr-only">
                Cotización de hoy en pesos
              </label>
              <input
                id="cotizacion-dol"
                name="valor"
                inputMode="decimal"
                placeholder="Pesos por dólar"
                className="cifras h-9 min-w-0 flex-1 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento"
              />
              <Boton type="submit" variante="primario" disabled={enviando}>
                {enviando ? '…' : 'Grabar'}
              </Boton>
            </div>
            {estado?.error && <Aviso>{estado.error}</Aviso>}
            {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
          </form>
        ) : (
          <button type="button" onClick={() => setEditando(true)} className="mt-2 text-xs text-acento hover:underline">
            Corregir la de hoy
          </button>
        ))}
    </Panel>
  )
}
