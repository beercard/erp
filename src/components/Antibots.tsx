'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'

import { CAMPO_TIEMPO, CAMPO_TRAMPA } from '@/lib/antibots'

/**
 * Lo que va dentro de un formulario público: el desafío de Cloudflare
 * Turnstile (si hay clave), un campo trampa invisible para las personas y la
 * hora en que se abrió el formulario. Se controla en el servidor con
 * controlarEnvio (src/lib/antibots.ts).
 */
export function Antibots() {
  const [abierto, setAbierto] = useState('')
  const [siteKey, setSiteKey] = useState<string | null>(null)
  useEffect(() => {
    setAbierto(String(Date.now()))
    fetch('/api/antibots')
      .then((r) => r.json())
      .then((d: { siteKey: string | null }) => setSiteKey(d.siteKey))
      .catch(() => undefined)
  }, [])
  return (
    <>
      <input type="hidden" name={CAMPO_TIEMPO} value={abierto} />
      {/* Trampa: fuera de la pantalla y del orden de tabulación; los lectores de pantalla la saltean. */}
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Sitio web
          <input type="text" name={CAMPO_TRAMPA} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {siteKey && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile" data-sitekey={siteKey} data-language="es" data-theme="auto" />
        </>
      )}
    </>
  )
}
