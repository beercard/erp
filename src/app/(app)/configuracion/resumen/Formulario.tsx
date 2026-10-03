'use client'

import { useActionState } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { guardarResumenAccion } from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm'
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

type Config = { frecuencia: string; diaSemana: number; correos: string[]; telefonos: string[] }

export function FormularioResumen({ c }: { c: Config }) {
  const [estado, accion, enviando] = useActionState(guardarResumenAccion, undefined)
  return (
    <form action={accion} className="flex flex-col gap-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Cada cuánto
          <select name="frecuencia" defaultValue={c.frecuencia} className={control}>
            <option value="no">No mandar</option>
            <option value="diario">Todos los días (lo del día anterior)</option>
            <option value="semanal">Una vez por semana (los últimos 7 días)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Día (semanal)
          <select name="diaSemana" defaultValue={c.diaSemana} className={control}>
            {DIAS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        Correos (separados por coma)
        <input name="correos" defaultValue={c.correos.join(', ')} placeholder="duena@empresa.com" className={control} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        WhatsApp (con código de país y área)
        <input name="telefonos" defaultValue={c.telefonos.join(', ')} placeholder="5491155556666" className={control} />
      </label>
      <p className="text-xs text-texto-3">
        Sale a la mañana, desde las 7. Por WhatsApp hace falta la cuenta conectada y, si el número no escribió en las últimas 24
        horas, una plantilla aprobada.
      </p>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.aviso && <Aviso tono="ok">{estado.aviso}</Aviso>}
      <div className="flex gap-2">
        <Boton type="submit" variante="primario" disabled={enviando}>
          Guardar
        </Boton>
        <Boton type="submit" name="probar" value="1" disabled={enviando}>
          Guardar y mandar ahora
        </Boton>
      </div>
    </form>
  )
}
