import { LifeBuoy } from 'lucide-react'
import Link from 'next/link'

import { guiaPorId } from '@/lib/ayuda/guias'

/** "Cómo se configura": enlace a la guía de la pantalla, para poner en el encabezado. */
export function EnlaceAyuda({ guia }: { guia: string }) {
  const g = guiaPorId(guia)
  if (!g) return null
  return (
    <Link
      href={`/ayuda/${g.id}`}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-acento hover:bg-acento-suave"
    >
      <LifeBuoy aria-hidden className="size-4" /> Guía paso a paso
    </Link>
  )
}
