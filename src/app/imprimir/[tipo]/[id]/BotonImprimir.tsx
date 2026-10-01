'use client'

import { Printer } from 'lucide-react'

import { Boton } from '@/components/ui'

export function BotonImprimir() {
  return (
    <Boton variante="primario" onClick={() => window.print()} autoFocus>
      <Printer aria-hidden className="size-4" /> Imprimir
    </Boton>
  )
}
