'use client'

import { Check, Copy, Printer } from 'lucide-react'
import { useState } from 'react'

import { Boton } from '@/components/ui'

export function ImprimirGuia() {
  return (
    <Boton type="button" onClick={() => window.print()}>
      <Printer /> Imprimir o guardar en PDF
    </Boton>
  )
}

/** Bloque de código con botón para copiarlo. */
export function Codigo({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="relative mt-2">
      <pre className="overflow-x-auto rounded-lg border border-borde bg-superficie-2 p-3 pr-12 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-all">
        {texto}
      </pre>
      <button
        type="button"
        aria-label="Copiar"
        className="no-imprimir absolute top-2 right-2 grid size-7 place-items-center rounded-md text-texto-3 hover:bg-superficie hover:text-texto"
        onClick={() => {
          navigator.clipboard?.writeText(texto).then(() => {
            setCopiado(true)
            setTimeout(() => setCopiado(false), 1500)
          })
        }}
      >
        {copiado ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
      </button>
    </div>
  )
}
