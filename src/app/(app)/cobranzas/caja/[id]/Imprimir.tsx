'use client'

import type { ReactNode } from 'react'

import { Boton } from '@/components/ui'

export function Imprimir({ children }: { children: ReactNode }) {
  return (
    <Boton type="button" onClick={() => window.print()} className="print:hidden">
      {children}
    </Boton>
  )
}
