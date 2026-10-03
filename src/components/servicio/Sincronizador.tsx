'use client'

import { CloudOff, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { informarDesdeColaAccion, llegadaAccion, subirArchivoAccion } from '@/app/(app)/servicio/acciones'

import {
  borrarArchivoLocal,
  borrarBorrador,
  idsLocales,
  leerArchivoLocal,
  pendientes,
  quitarDeCola,
  reemplazarIds,
  sinConexion,
} from './sinSenal'

/**
 * Registra el service worker, deja guardadas en el celular las órdenes de la
 * agenda (para abrirlas sin señal) y manda lo que quedó en la cola cuando
 * vuelve la señal. Muestra cuántas cosas faltan mandar.
 */
export function Sincronizador({ precargar = [], enviada }: { precargar?: string[]; enviada?: string }) {
  const router = useRouter()
  const [enCola, setEnCola] = useState(0)
  const [conSenal, setConSenal] = useState(true)
  const [error, setError] = useState<{ ordenId: string; texto: string } | null>(null)
  const trabajando = useRef(false)

  // El informe de esta orden ya salió: su borrador no hace falta.
  useEffect(() => {
    if (enviada) borrarBorrador(enviada)
  }, [enviada])

  const sincronizar = useCallback(async () => {
    if (trabajando.current) return
    trabajando.current = true
    try {
      let lista = await pendientes()
      setEnCola(lista.length)
      if (!navigator.onLine) return
      let cambio = false
      for (const p of lista) {
        if (p.tipo === 'llegada') {
          const r = await llegadaAccion(p.ordenId, { lat: p.lat, lng: p.lng, cuando: p.cuando })
          if (!r.ok) setError({ ordenId: p.ordenId, texto: r.error })
          await quitarDeCola(p.id)
          cambio = true
          continue
        }
        // Informe: primero las fotos y la firma guardadas en el celular.
        const mapa = new Map<string, string>()
        for (const local of idsLocales(p.resultados)) {
          const a = await leerArchivoLocal(local)
          if (!a) continue
          const datos = new FormData()
          datos.set('archivo', a.blob, a.clase === 'firma' ? 'firma.png' : 'foto.jpg')
          const r = await subirArchivoAccion(p.ordenId, a.clase, datos)
          if (!r.ok) throw new Error(r.error)
          mapa.set(local, r.id)
        }
        const r = await informarDesdeColaAccion(p.ordenId, {
          fecha: p.fecha,
          solucion: p.solucion,
          cierre: p.cierre,
          resultados: reemplazarIds(p.resultados, mapa),
        })
        if (!r.ok) {
          // Lo rechazó el servidor (no es la señal): queda en la cola y se avisa para corregirlo.
          setError({ ordenId: p.ordenId, texto: r.error })
          break
        }
        for (const local of mapa.keys()) await borrarArchivoLocal(local)
        await quitarDeCola(p.id)
        borrarBorrador(p.ordenId)
        cambio = true
      }
      lista = await pendientes()
      setEnCola(lista.length)
      if (cambio) router.refresh()
    } catch (e) {
      if (!sinConexion(e)) setError({ ordenId: '', texto: (e as Error).message })
    } finally {
      trabajando.current = false
    }
  }, [router])

  useEffect(() => {
    const actualizar = () => {
      setConSenal(navigator.onLine)
      void sincronizar()
    }
    actualizar()
    window.addEventListener('online', actualizar)
    window.addEventListener('offline', actualizar)
    window.addEventListener('cola-servicio', actualizar)
    return () => {
      window.removeEventListener('online', actualizar)
      window.removeEventListener('offline', actualizar)
      window.removeEventListener('cola-servicio', actualizar)
    }
  }, [sincronizar])

  // Service worker y copia local de las órdenes de la agenda.
  const lista = precargar.join('|')
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        if (!navigator.onLine) return
        for (const url of lista ? lista.split('|') : []) void fetch(url, { credentials: 'same-origin' }).catch(() => undefined)
      })
      .catch(() => undefined)
  }, [lista])

  if (conSenal && !enCola && !error) return null
  return (
    <div
      role="status"
      className={`mb-4 flex flex-col gap-1 rounded-md px-3 py-2 text-sm ${error ? 'bg-error-suave text-error' : 'bg-aviso-suave text-aviso'}`}
    >
      {!conSenal && (
        <span className="flex items-center gap-2">
          <CloudOff aria-hidden className="size-4" /> Sin señal. Podés seguir trabajando: lo que cargues se guarda en el celular.
        </span>
      )}
      {enCola > 0 && (
        <span className="flex items-center gap-2">
          <RefreshCw aria-hidden className={`size-4 ${conSenal ? 'animate-spin' : ''}`} />
          {enCola === 1 ? 'Falta mandar 1 cosa' : `Faltan mandar ${enCola} cosas`}
          {conSenal ? ': mandando…' : ': se mandan solas cuando vuelva la señal.'}
        </span>
      )}
      {error && (
        <span>
          No se pudo mandar: {error.texto}{' '}
          {error.ordenId && (
            <Link href={`/tecnico/${error.ordenId}`} className="font-medium underline">
              Abrir la orden
            </Link>
          )}
        </span>
      )}
    </div>
  )
}
