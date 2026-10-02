'use client'

import 'leaflet/dist/leaflet.css'

import type * as L from 'leaflet'
import { useEffect, useRef, useState } from 'react'

export type Punto = { lat: number; lng: number }

export type Marcador = {
  id: string
  punto: Punto
  /** orden: círculo; tecnico: círculo con iniciales; partida: cuadrado chico. */
  clase: 'orden' | 'tecnico' | 'partida'
  color: string
  /** Relleno blanco (orden sin técnico) o apagado (ya hecha). */
  hueco?: boolean
  apagado?: boolean
  texto?: string
  /** Renglones del globo (texto plano: se arma con nodos, nunca con HTML). */
  globo: string[]
  enlace?: { href: string; texto: string }
}

export type Ruta = { id: string; color: string; puntos: Punto[] }

/** Si no hay nada que mostrar: el centro de Buenos Aires. */
const CENTRO: Punto = { lat: -34.6037, lng: -58.3816 }

/**
 * Mapa de OpenStreetMap (Leaflet) con órdenes, técnicos y recorridos.
 * Leaflet usa window: se carga en el navegador, después de montar.
 */
export function Mapa({
  marcadores,
  rutas = [],
  alHacerClic,
  seleccionado,
  className = 'h-[60vh] min-h-80',
}: {
  marcadores: Marcador[]
  rutas?: Ruta[]
  alHacerClic?: (p: Punto) => void
  /** Centra el mapa en este marcador. */
  seleccionado?: string | null
  className?: string
}) {
  const caja = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const capa = useRef<L.LayerGroup | null>(null)
  const lib = useRef<typeof L | null>(null)
  const clic = useRef(alHacerClic)
  const ubicados = useRef(new Map<string, L.Marker | L.CircleMarker>())
  const encuadrado = useRef(false)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    clic.current = alHacerClic
    if (caja.current) caja.current.style.cursor = alHacerClic ? 'crosshair' : ''
  }, [alHacerClic])

  useEffect(() => {
    let vivo = true
    void import('leaflet').then((mod) => {
      if (!vivo || !caja.current || mapa.current) return
      const Leaflet = (mod as unknown as { default?: typeof L }).default ?? (mod as unknown as typeof L)
      lib.current = Leaflet
      const m = Leaflet.map(caja.current, { zoomControl: true }).setView([CENTRO.lat, CENTRO.lng], 11)
      Leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m)
      m.on('click', (e: L.LeafletMouseEvent) => clic.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }))
      capa.current = Leaflet.layerGroup().addTo(m)
      mapa.current = m
      setListo(true)
    })
    return () => {
      vivo = false
      mapa.current?.remove()
      mapa.current = null
    }
  }, [])

  // Dibuja de nuevo cuando cambian los datos (el mapa se crea una sola vez).
  useEffect(() => {
    const Leaflet = lib.current
    const m = mapa.current
    const grupo = capa.current
    if (!Leaflet || !m || !grupo) return
    grupo.clearLayers()
    ubicados.current.clear()
    for (const r of rutas) {
      if (r.puntos.length < 2) continue
      Leaflet.polyline(
        r.puntos.map((p) => [p.lat, p.lng] as [number, number]),
        { color: r.color, weight: 3, opacity: 0.75, dashArray: '6 6' },
      ).addTo(grupo)
    }
    for (const mk of marcadores) {
      let capaMk: L.Marker | L.CircleMarker
      if (mk.clase === 'orden') {
        capaMk = Leaflet.circleMarker([mk.punto.lat, mk.punto.lng], {
          radius: 9,
          color: mk.hueco ? mk.color : '#ffffff',
          weight: 2,
          fillColor: mk.hueco ? '#ffffff' : mk.color,
          fillOpacity: mk.apagado ? 0.45 : 1,
          opacity: mk.apagado ? 0.6 : 1,
        })
      } else {
        const div = document.createElement('div')
        div.textContent = mk.texto ?? ''
        Object.assign(div.style, {
          background: mk.clase === 'tecnico' ? mk.color : '#ffffff',
          color: mk.clase === 'tecnico' ? '#ffffff' : mk.color,
          border: `2px solid ${mk.clase === 'tecnico' ? '#ffffff' : mk.color}`,
          borderRadius: mk.clase === 'tecnico' ? '9999px' : '3px',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          font: '600 11px/1 var(--fuente-plex), sans-serif',
          boxShadow: '0 1px 4px rgb(0 0 0 / 0.35)',
        })
        const lado = mk.clase === 'tecnico' ? 30 : 14
        capaMk = Leaflet.marker([mk.punto.lat, mk.punto.lng], {
          icon: Leaflet.divIcon({ html: div, className: '', iconSize: [lado, lado], iconAnchor: [lado / 2, lado / 2] }),
          zIndexOffset: mk.clase === 'tecnico' ? 1000 : 0,
        })
      }
      const globo = document.createElement('div')
      globo.style.font = '13px/1.4 var(--fuente-plex), sans-serif'
      mk.globo.forEach((renglon, i) => {
        const p = document.createElement('div')
        p.textContent = renglon
        if (i === 0) p.style.fontWeight = '600'
        globo.appendChild(p)
      })
      if (mk.enlace) {
        const a = document.createElement('a')
        a.href = mk.enlace.href
        a.textContent = mk.enlace.texto
        a.style.display = 'inline-block'
        a.style.marginTop = '4px'
        globo.appendChild(a)
      }
      capaMk.bindPopup(globo).addTo(grupo)
      ubicados.current.set(mk.id, capaMk)
    }
    // Encuadra la primera vez que hay puntos (después respeta lo que haga el usuario).
    if (!encuadrado.current) {
      const todos = [...marcadores.map((x) => x.punto), ...rutas.flatMap((r) => r.puntos)]
      if (todos.length === 1) m.setView([todos[0].lat, todos[0].lng], 15)
      else if (todos.length > 1) m.fitBounds(Leaflet.latLngBounds(todos.map((p) => [p.lat, p.lng] as [number, number])).pad(0.15))
      if (todos.length) encuadrado.current = true
    }
  }, [listo, marcadores, rutas])

  useEffect(() => {
    if (!seleccionado) return
    const mk = ubicados.current.get(seleccionado)
    if (mk && mapa.current) {
      mapa.current.setView(mk.getLatLng(), Math.max(mapa.current.getZoom(), 15))
      mk.openPopup()
    }
  }, [seleccionado])

  return <div ref={caja} className={`isolate z-0 w-full rounded-md border border-borde ${className}`} />
}
