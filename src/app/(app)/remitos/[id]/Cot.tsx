'use client'

import { useActionState, useState } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { pedirCotAccion } from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm'

/** Pedido del COT de ARBA: patente, día y hora de salida; o el archivo para subirlo a mano. */
export function PedirCot({ remitoId, hoy }: { remitoId: string; hoy: string }) {
  const [estado, accion, enviando] = useActionState(pedirCotAccion.bind(null, remitoId), undefined)
  const [datos, setDatos] = useState({ patente: '', salida: hoy, hora: '08:00' })
  const q = new URLSearchParams(datos)
  return (
    <form action={accion} className="flex flex-col gap-2 text-sm">
      <h2 className="font-semibold">COT (ARBA)</h2>
      <input
        name="patente"
        placeholder="Patente (AAA123)"
        className={control}
        value={datos.patente}
        onChange={(e) => setDatos({ ...datos, patente: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          name="salida"
          className={control}
          value={datos.salida}
          onChange={(e) => setDatos({ ...datos, salida: e.target.value })}
          aria-label="Día de salida"
        />
        <input
          type="time"
          name="hora"
          className={control}
          value={datos.hora}
          onChange={(e) => setDatos({ ...datos, hora: e.target.value })}
          aria-label="Hora de salida"
        />
      </div>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <Boton type="submit" variante="primario" disabled={enviando}>
        {enviando ? 'Pidiendo…' : 'Pedir COT'}
      </Boton>
      <a href={`/remitos/${remitoId}/cot?${q}`} className="text-center text-xs text-texto-2 hover:text-acento">
        Descargar el archivo para subirlo a mano
      </a>
    </form>
  )
}
