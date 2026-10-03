'use client'

import { LocateFixed, LocateOff } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { posicionAccion } from '@/app/(app)/servicio/acciones'

const CLAVE = 'erp-compartir-ubicacion'
const CADA = 60_000

const EVENTO = 'compartir-ubicacion'
const suscribir = (aviso: () => void) => {
  window.addEventListener(EVENTO, aviso)
  window.addEventListener('storage', aviso)
  return () => {
    window.removeEventListener(EVENTO, aviso)
    window.removeEventListener('storage', aviso)
  }
}

/** Prende o apaga el compartir (lo usa también la jornada: al empezarla se comparte). */
export function ponerCompartir(activo: boolean) {
  try {
    localStorage.setItem(CLAVE, activo ? '1' : '0')
  } catch {
    // Sin almacenamiento en el celular: no se puede recordar la elección.
  }
  window.dispatchEvent(new Event(EVENTO))
}

const leer = () => {
  try {
    return localStorage.getItem(CLAVE) === '1'
  } catch {
    return false
  }
}

/**
 * El técnico elige compartir su ubicación con la oficina (para el mapa del
 * día). Solo mientras tiene la app abierta, y como mucho una vez por minuto.
 */
export function CompartirUbicacion() {
  // Lo que eligió queda guardado en el celular (en el servidor se dibuja apagado).
  const activo = useSyncExternalStore(suscribir, leer, () => false)
  const [estado, setEstado] = useState<string | null>(null)
  const ultima = useRef(0)

  useEffect(() => {
    if (!activo || !('geolocation' in navigator)) return
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (Date.now() - ultima.current < CADA) return
        ultima.current = Date.now()
        posicionAccion({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy })
          .then((r) => setEstado(r.ok ? 'La oficina ve tu ubicación.' : r.error))
          .catch(() => setEstado('Sin señal: se manda cuando vuelva.'))
      },
      (e) =>
        setEstado(
          e.code === e.PERMISSION_DENIED ? 'El celular no dio permiso para la ubicación.' : 'No se pudo leer la ubicación.',
        ),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [activo])

  const cambiar = () => {
    ultima.current = 0
    setEstado(null)
    ponerCompartir(!activo)
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 tarjeta px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        {activo ? (
          <LocateFixed aria-hidden className="size-4 text-ok" />
        ) : (
          <LocateOff aria-hidden className="size-4 text-texto-3" />
        )}
        <span>
          {activo ? 'Compartiendo tu ubicación' : 'Ubicación no compartida'}
          {estado && <span className="block text-xs text-texto-2">{estado}</span>}
        </span>
      </span>
      <button type="button" onClick={cambiar} className="text-xs font-medium text-acento hover:underline">
        {activo ? 'Dejar de compartir' : 'Compartir con la oficina'}
      </button>
    </div>
  )
}
