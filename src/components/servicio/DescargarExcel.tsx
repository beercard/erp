import { Download } from 'lucide-react'

import { hoyArgentina } from '@/lib/fechas'
import { sumarDias } from '@/modulos/servicio/agenda'

/** Elegir fechas y bajar el reporte en Excel (un formulario GET común: no necesita JavaScript). */
export function DescargarExcel({ ruta, texto = 'Excel' }: { ruta: string; texto?: string }) {
  const hoy = hoyArgentina()
  const control = 'h-8 rounded-md border border-borde bg-superficie px-2 text-xs'
  return (
    <form action={ruta} method="get" className="flex flex-wrap items-center gap-2 text-xs text-texto-2">
      <label className="flex items-center gap-1">
        Desde <input type="date" name="desde" defaultValue={sumarDias(hoy, -30)} className={control} />
      </label>
      <label className="flex items-center gap-1">
        hasta <input type="date" name="hasta" defaultValue={hoy} className={control} />
      </label>
      <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-borde px-2 font-medium text-texto hover:bg-superficie-2">
        <Download aria-hidden className="size-3.5" /> {texto}
      </button>
    </form>
  )
}
