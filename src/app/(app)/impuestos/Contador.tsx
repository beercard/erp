'use client'

import { Download, Send } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { enviarPaqueteAccion, type Estado } from './acciones'

/** Bajar o mandar al contador el paquete del mes. */
export function PaqueteContador({
  periodo,
  email,
  envios,
}: {
  periodo: string
  email: string | null
  envios: { para: string; creado: Date; automatico: boolean }[]
}) {
  const [r, setR] = useState<Estado>()
  const [enviando, iniciar] = useTransition()
  const hora = (d: Date) =>
    new Date(d).toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      dateStyle: 'short',
      timeStyle: 'short',
      hour12: false,
    })
  return (
    <div className="flex flex-col gap-2 p-4 text-sm">
      <p className="text-xs text-texto-2">
        Libro IVA Digital (el presentado, si ya está), subdiarios, Ingresos Brutos, retenciones, SICORE y un resumen con la
        posición y los controles, en un .zip.
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={`/impuestos/paquete?periodo=${periodo}`}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2"
        >
          <Download aria-hidden className="size-4" /> Bajar el paquete
        </a>
        <Boton
          type="button"
          disabled={enviando || !email}
          onClick={() => iniciar(async () => setR(await enviarPaqueteAccion(periodo)))}
        >
          <Send aria-hidden className="size-4" /> {email ? `Mandar a ${email}` : 'Mandar al contador'}
        </Boton>
      </div>
      {!email && (
        <p className="text-xs text-texto-3">
          Para mandarlo, cargá el email del contador en{' '}
          <a href="/impuestos/vencimientos" className="text-acento hover:underline">
            Impuestos › Vencimientos
          </a>
          .
        </p>
      )}
      {envios.length > 0 && (
        <p className="text-xs text-texto-2">
          Enviado: {envios.map((e) => `${hora(e.creado)} a ${e.para}${e.automatico ? ' (al presentar)' : ''}`).join(' · ')}
        </p>
      )}
      {r?.error && <Aviso>{r.error}</Aviso>}
      {r?.ok && <Aviso tono="ok">{r.ok}</Aviso>}
    </div>
  )
}
