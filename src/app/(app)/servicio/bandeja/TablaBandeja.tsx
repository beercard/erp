'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { estadoEnLoteAccion } from '../formularios/acciones'

type Estado = { id: string; nombre: string; color: string }
type Fila = {
  id: string
  numero: number | null
  formulario: string
  color: string
  cliente: string | null
  serie: string | null
  origen: string
  tecnico: string | null
  portal: string | null
  enviado: Date | null
  estado: Estado | null
}

const ORIGEN: Record<string, string> = { oficina: 'Oficina', tecnico: 'Técnico', portal: 'Portal' }
const hora = (d: Date | null) =>
  d
    ? new Date(d).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })
    : '—'

export function ChipEstadoEnvio({ estado }: { estado: { nombre: string; color: string } }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `color-mix(in srgb, ${estado.color} 15%, transparent)`, color: estado.color }}
    >
      <span aria-hidden className="size-2 rounded-full" style={{ background: estado.color }} />
      {estado.nombre}
    </span>
  )
}

/** La bandeja con casillas: se marcan varios formularios y se pasan juntos a un estado. */
export function TablaBandeja({ envios, estados }: { envios: Fila[]; estados: Estado[] }) {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [destino, setDestino] = useState('')
  const [mensaje, setMensaje] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null)
  const [cambiando, iniciar] = useTransition()
  const todos = elegidos.size === envios.length && envios.length > 0
  const alternar = (id: string) =>
    setElegidos((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const cambiar = () =>
    iniciar(async () => {
      const r = await estadoEnLoteAccion([...elegidos], destino)
      if (r.ok) {
        setMensaje({ tono: 'ok', texto: `${r.cambiados} formularios cambiados de estado.` })
        setElegidos(new Set())
      } else setMensaje({ tono: 'error', texto: r.error })
    })
  return (
    <div className="flex flex-col gap-3">
      {elegidos.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 tarjeta p-3 text-sm">
          <span className="font-medium">{elegidos.size} elegidos</span>
          <select
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            aria-label="Nuevo estado"
            className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2 text-sm"
          >
            <option value="" disabled>
              Pasar a…
            </option>
            {estados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
          <Boton type="button" variante="primario" disabled={!destino || cambiando} onClick={cambiar}>
            {cambiando ? 'Cambiando…' : 'Cambiar el estado'}
          </Boton>
        </div>
      )}
      {mensaje && <Aviso tono={mensaje.tono}>{mensaje.texto}</Aviso>}
      <div className="overflow-x-auto tarjeta">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-borde text-left text-xs text-texto-2">
            <tr>
              <th className="w-10 px-4 py-2">
                <input
                  type="checkbox"
                  aria-label="Elegir todos"
                  checked={todos}
                  onChange={() => setElegidos(todos ? new Set() : new Set(envios.map((e) => e.id)))}
                />
              </th>
              <th className="px-4 py-2 font-medium">N°</th>
              <th className="px-4 py-2 font-medium">Formulario</th>
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium">De</th>
              <th className="px-4 py-2 font-medium">Recibido</th>
              <th className="px-4 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {envios.map((e) => (
              <tr key={e.id} className={elegidos.has(e.id) ? 'bg-acento-suave/40' : 'hover:bg-superficie-2'}>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Elegir el formulario ${e.numero}`}
                    checked={elegidos.has(e.id)}
                    onChange={() => alternar(e.id)}
                  />
                </td>
                <td className="cifras px-4 py-2">
                  <Link href={`/servicio/bandeja/${e.id}`} className="font-medium text-acento hover:underline">
                    {e.numero}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: e.color }} />
                    {e.formulario}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {e.cliente ?? '—'}
                  {e.serie && <span className="cifras block text-xs text-texto-3">{e.serie}</span>}
                </td>
                <td className="px-4 py-2 text-xs text-texto-2">
                  {ORIGEN[e.origen]}
                  {e.tecnico ? ` · ${e.tecnico}` : e.portal ? ` · ${e.portal}` : ''}
                </td>
                <td className="px-4 py-2 text-xs whitespace-nowrap text-texto-2">{hora(e.enviado)}</td>
                <td className="px-4 py-2">{e.estado && <ChipEstadoEnvio estado={e.estado} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
