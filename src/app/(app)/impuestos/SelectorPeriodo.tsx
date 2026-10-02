import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { moverPeriodo, nombrePeriodo } from './periodo'

/** Mes anterior / siguiente y un selector de mes (sin JavaScript: es un formulario GET). */
export function SelectorPeriodo({ ruta, periodo }: { ruta: string; periodo: string }) {
  const flecha = 'flex size-9 items-center justify-center rounded-md border border-borde hover:bg-superficie-2'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`${ruta}?periodo=${moverPeriodo(periodo, -1)}`} aria-label="Mes anterior" className={flecha}>
        <ChevronLeft aria-hidden className="size-4" />
      </Link>
      <span className="min-w-36 text-center text-sm font-medium first-letter:uppercase">{nombrePeriodo(periodo)}</span>
      <Link href={`${ruta}?periodo=${moverPeriodo(periodo, 1)}`} aria-label="Mes siguiente" className={flecha}>
        <ChevronRight aria-hidden className="size-4" />
      </Link>
      <form action={ruta} className="flex items-center gap-1">
        <input
          type="month"
          name="periodo"
          defaultValue={periodo}
          className="h-9 rounded-md border border-borde bg-superficie px-2 text-sm"
        />
        <button className="h-9 rounded-md border border-borde px-2 text-sm hover:bg-superficie-2">Ir</button>
      </form>
    </div>
  )
}
