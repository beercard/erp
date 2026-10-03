'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Boton } from '@/components/ui'

import { avanzarLoteAccion } from '../../automatica'

/** Autoriza el lote de a tandas, mostrando el avance; se puede cerrar la página (lo sigue la tarea periódica). */
export function AutorizarLote({ id, pendientes }: { id: string; pendientes: number }) {
  const router = useRouter()
  const [hechas, setHechas] = useState(0)
  const [corriendo, setCorriendo] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function correr() {
    setCorriendo(true)
    setMensaje(null)
    let quedan = pendientes
    let total = 0
    // Tope de vueltas: cada una procesa una tanda; lo que falla queda con su error.
    for (let vuelta = 0; vuelta < 200 && quedan > 0; vuelta++) {
      const r = await avanzarLoteAccion(id)
      if (!r.ok) {
        setMensaje(r.error)
        break
      }
      if (!r.procesadas) break
      total += r.procesadas
      quedan = r.quedan
      setHechas(total)
      router.refresh()
    }
    setCorriendo(false)
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <Boton variante="primario" disabled={corriendo || !pendientes} onClick={correr}>
        {corriendo ? `Autorizando… ${hechas} de ${pendientes}` : `Autorizar ${pendientes} en ARCA`}
      </Boton>
      {corriendo && <span className="text-texto-3">Podés cerrar la página: sigue sola en unos minutos.</span>}
      {mensaje && <span className="text-error">{mensaje}</span>}
    </div>
  )
}
