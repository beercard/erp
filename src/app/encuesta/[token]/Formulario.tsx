'use client'

import { Star } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { responderAccion } from './acciones'

export function FormularioEncuesta({ token }: { token: string }) {
  const [estado, accion, enviando] = useActionState(responderAccion.bind(null, token), undefined)
  const [puntaje, setPuntaje] = useState(0)
  const [nps, setNps] = useState<number | null>(null)
  if (estado?.ok) {
    return <Aviso tono="ok">¡Gracias! Recibimos su respuesta.</Aviso>
  }
  return (
    <form action={accion} className="flex flex-col gap-6">
      <input type="hidden" name="puntaje" value={puntaje} />
      <input type="hidden" name="nps" value={nps ?? ''} />
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium">¿Cómo calificaría la atención?</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPuntaje(n)}
              aria-label={`${n} de 5`}
              aria-pressed={puntaje === n}
              className="grid size-12 place-items-center rounded-md text-aviso hover:bg-superficie-2"
            >
              <Star aria-hidden className={`size-8 ${n <= puntaje ? 'fill-current' : 'opacity-40'}`} />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium">¿Qué tan probable es que nos recomiende? (0 = nada, 10 = seguro)</legend>
        <div className="grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNps(n)}
              aria-pressed={nps === n}
              className={`cifras h-10 rounded-md border text-sm ${nps === n ? 'border-acento bg-acento text-sobre-acento' : 'border-borde bg-superficie hover:bg-superficie-2'}`}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">¿Algo que quiera contarnos? (opcional)</span>
        <textarea
          name="comentario"
          rows={3}
          maxLength={1000}
          className="rounded-md border border-borde bg-superficie px-2.5 py-2 text-sm focus:border-acento"
        />
      </label>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Boton type="submit" variante="primario" disabled={enviando || !puntaje || nps === null} className="h-11">
        {enviando ? 'Enviando…' : 'Enviar'}
      </Boton>
    </form>
  )
}
