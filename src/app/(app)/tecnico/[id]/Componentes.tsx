'use client'

import { MapPinCheckInside } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useState, useTransition } from 'react'

import { FormularioDinamico } from '@/components/servicio/FormularioDinamico'
import { Aviso, Boton } from '@/components/ui'
import type { Campo } from '@/modulos/servicio/formularios'
import { CIERRES } from '@/modulos/servicio/tipos'

import { informarAccion, llegadaAccion } from '../../servicio/acciones'

/** "Llegué": registra la hora y, si el celular la da, la ubicación. */
export function Llegue({ id }: { id: string }) {
  const router = useRouter()
  const [enviando, iniciar] = useTransition()
  const [error, setError] = useState('')
  const marcar = () =>
    iniciar(async () => {
      setError('')
      const ubicacion = await new Promise<{ lat: number | null; lng: number | null }>((ok) => {
        if (!('geolocation' in navigator)) return ok({ lat: null, lng: null })
        navigator.geolocation.getCurrentPosition(
          (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => ok({ lat: null, lng: null }),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
        )
      })
      const r = await llegadaAccion(id, ubicacion)
      if (!r.ok) setError(r.error)
      router.refresh()
    })
  return (
    <div className="flex flex-col gap-2">
      <Boton type="button" variante="primario" onClick={marcar} disabled={enviando} className="h-12 w-full text-base">
        <MapPinCheckInside aria-hidden className="size-5" /> {enviando ? 'Marcando…' : 'Llegué'}
      </Boton>
      {error && <Aviso>{error}</Aviso>}
    </div>
  )
}

/** Devolución del técnico: el formulario del tipo de orden, un resumen y cómo quedó. */
export function InformeTecnico({
  id,
  campos,
  equipos,
  hoy,
}: {
  id: string
  campos: Campo[]
  equipos: { id: string; texto: string }[]
  hoy: string
}) {
  const [estado, accion, enviando] = useActionState(informarAccion.bind(null, id), undefined)
  const [cierre, setCierre] = useState('ok')
  return (
    <form action={accion} className="flex flex-col gap-5">
      <input type="hidden" name="fecha" value={hoy} />
      <FormularioDinamico campos={campos} nombre="resultados" contexto={{ ordenId: id, equipos }} />
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-texto-2">
          Resumen de lo que hiciste <span className="text-error">*</span>
        </span>
        <textarea
          name="solucion"
          rows={3}
          required
          className="rounded-md border border-borde bg-superficie px-2.5 py-2 text-sm focus:border-acento"
        />
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs font-medium text-texto-2">¿Cómo quedó?</legend>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(CIERRES).map(([k, t]) => (
            <label
              key={k}
              className={`flex h-11 cursor-pointer items-center justify-center rounded-md border px-2 text-center text-sm ${cierre === k ? 'border-acento bg-acento text-sobre-acento' : 'border-borde bg-superficie'}`}
            >
              <input
                type="radio"
                name="cierre"
                value={k}
                checked={cierre === k}
                onChange={() => setCierre(k)}
                className="sr-only"
              />
              {t}
            </label>
          ))}
        </div>
      </fieldset>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Boton type="submit" variante="primario" disabled={enviando} className="h-12 w-full text-base">
        {enviando ? 'Enviando…' : 'Enviar el informe'}
      </Boton>
    </form>
  )
}
