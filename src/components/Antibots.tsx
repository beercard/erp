'use client'

import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

import { CAMPO_TIEMPO, CAMPO_TRAMPA } from '@/lib/antibots'

type Turnstile = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

type Datos = { siteKey: string | null; sello: string }

/**
 * Una sola vez por visita a la página: si el formulario se vuelve a armar
 * después de un error, la hora de apertura sigue siendo la primera (corregir un
 * campo rápido no es de bot).
 */
let pedido: Promise<Datos | null> | null = null
const datosAntibots = () =>
  (pedido ??= fetch('/api/antibots', { cache: 'no-store' })
    .then((r) => r.json() as Promise<Datos>)
    .catch(() => {
      pedido = null
      return null
    }))

/**
 * Lo que va dentro de un formulario público: el desafío de Cloudflare
 * Turnstile (si hay clave), un campo trampa invisible para las personas y la
 * hora de apertura firmada por el servidor. Se controla en el servidor con
 * controlarEnvio (src/lib/antibotsServidor.ts). Va justo antes del botón de
 * enviar; `className` ubica el desafío (por ejemplo, a lo ancho de una grilla).
 *
 * El desafío se dibuja a mano (render explícito): el automático de Cloudflare
 * corre una sola vez al cargar el script y no aparecía si el formulario se
 * rearmaba. `intento` es el estado que devuelve la acción: cuando cambia, el
 * desafío se renueva, porque cada token sirve una sola vez.
 */
export function Antibots({ intento, className = '' }: { intento?: unknown; className?: string }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [scriptListo, setScriptListo] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)

  useEffect(() => {
    let vigente = true
    datosAntibots().then((d) => vigente && setDatos(d))
    return () => {
      vigente = false
    }
  }, [])

  const siteKey = datos?.siteKey ?? null
  useEffect(() => {
    const t = window.turnstile
    if (!siteKey || !caja.current || !t || widget.current) return
    widget.current = t.render(caja.current, { sitekey: siteKey, language: 'es', theme: 'auto', size: 'flexible' })
    return () => {
      if (widget.current) t.remove(widget.current)
      widget.current = null
    }
  }, [siteKey, scriptListo])

  useEffect(() => {
    if (intento && widget.current) window.turnstile?.reset(widget.current)
  }, [intento])

  return (
    <>
      <input type="hidden" name={CAMPO_TIEMPO} value={datos?.sello ?? ''} readOnly />
      {/* Trampa: fuera de la pantalla y del orden de tabulación; los lectores de pantalla la saltean. */}
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          No completar
          <input type="text" name={CAMPO_TRAMPA} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {siteKey && (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
            onReady={() => setScriptListo(true)}
          />
          {/* Alto reservado (el del desafío) para que el formulario no salte al aparecer. */}
          <div ref={caja} className={`min-h-[65px] w-full ${className}`} />
        </>
      )}
    </>
  )
}
