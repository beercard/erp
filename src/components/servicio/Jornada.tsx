'use client'

import { Clock } from 'lucide-react'
import { useState, useTransition } from 'react'

import { ficharAccion } from '@/app/(app)/servicio/acciones'
import { Boton } from '@/components/ui'

import { ponerCompartir } from './CompartirUbicacion'

const hora = (d: Date) =>
  new Date(d).toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

/** Ubicación del celular para la fichada (si no la da en 10 segundos, se ficha igual). */
function ubicacion(): Promise<{ lat: number | null; lng: number | null; precision: number | null }> {
  const nada = { lat: null, lng: null, precision: null }
  if (!('geolocation' in navigator)) return Promise.resolve(nada)
  return new Promise((ok) =>
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
      () => ok(nada),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    ),
  )
}

/**
 * Fichada de la jornada, como la app de fichada de Persat: el técnico marca
 * cuándo empieza y termina, con la ubicación. Al empezar, se comparte la
 * ubicación con la oficina; al terminar, se deja de compartir.
 */
export function Jornada({ desde }: { desde: Date | null }) {
  const [error, setError] = useState('')
  const [fichando, iniciar] = useTransition()
  const fichar = (tipo: 'entrada' | 'salida') =>
    iniciar(async () => {
      setError('')
      const r = await ficharAccion(tipo, await ubicacion()).catch(() => ({
        ok: false as const,
        error: 'Sin señal: probá de nuevo.',
      }))
      if (!r.ok) return setError(r.error)
      ponerCompartir(tipo === 'entrada')
    })
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 tarjeta px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        <Clock aria-hidden className={`size-4 ${desde ? 'text-ok' : 'text-texto-3'}`} />
        <span>
          {desde ? `Jornada empezada a las ${hora(desde)}` : 'Jornada sin empezar'}
          {error && <span className="block text-xs text-error">{error}</span>}
        </span>
      </span>
      <Boton
        type="button"
        variante={desde ? 'secundario' : 'primario'}
        disabled={fichando}
        onClick={() => fichar(desde ? 'salida' : 'entrada')}
        className="h-8 px-3 text-xs"
      >
        {fichando ? 'Fichando…' : desde ? 'Terminar la jornada' : 'Empezar la jornada'}
      </Boton>
    </div>
  )
}
