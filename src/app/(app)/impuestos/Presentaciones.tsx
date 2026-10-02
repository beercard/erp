'use client'

import { Download } from 'lucide-react'
import { useActionState } from 'react'

import { Aviso, Boton, Chip } from '@/components/ui'

import { presentadaAccion, reabrirAccion } from './acciones'

type Presentacion = {
  id: string
  periodo: string
  secuencia: number
  estado: string
  nombreArchivo: string
  creado: Date
  presentada: Date | null
  transaccion: string | null
  motivo: string | null
}

const hora = (d: Date | null) =>
  d
    ? new Date(d).toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        dateStyle: 'short',
        timeStyle: 'short',
        hour12: false,
      })
    : ''

function Fila({ p, puede, cerrado }: { p: Presentacion; puede: boolean; cerrado: boolean }) {
  const [presentar, accionPresentar, presentando] = useActionState(presentadaAccion.bind(null, p.id), undefined)
  const [reabrir, accionReabrir, reabriendo] = useActionState(reabrirAccion.bind(null, p.id), undefined)
  const r = presentar ?? reabrir
  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          {p.estado === 'presentada' ? (
            <Chip tono="ok">Presentada{p.transaccion ? ` · transacción ${p.transaccion}` : ''}</Chip>
          ) : p.estado === 'reabierta' ? (
            <Chip tono="aviso">Reabierta</Chip>
          ) : (
            <Chip>Generada</Chip>
          )}
          {p.secuencia > 0 && <Chip>Rectificativa {p.secuencia}</Chip>}
          <span className="text-xs text-texto-2">
            {p.estado === 'presentada' ? `Presentada el ${hora(p.presentada)}` : `Generada el ${hora(p.creado)}`}
            {p.motivo && ` · motivo: ${p.motivo}`}
          </span>
        </span>
        <a
          href={`/impuestos/presentaciones/${p.id}`}
          className="inline-flex items-center gap-1 text-xs text-acento hover:underline"
        >
          <Download aria-hidden className="size-3.5" /> {p.nombreArchivo}
        </a>
      </div>
      {puede && p.estado === 'generada' && !cerrado && (
        <form action={accionPresentar} className="flex flex-wrap items-center gap-2">
          <input
            name="transaccion"
            placeholder="N° de transacción de ARCA"
            className="h-8 w-56 rounded-md border border-borde bg-superficie px-2 text-xs"
          />
          <Boton type="submit" disabled={presentando} className="h-8 px-2 text-xs">
            Marcar como presentada
          </Boton>
        </form>
      )}
      {puede && p.estado === 'presentada' && (
        <details>
          <summary className="cursor-pointer text-xs text-texto-2">Reabrir el período (para una rectificativa)</summary>
          <form action={accionReabrir} className="mt-2 flex flex-wrap items-center gap-2">
            <input
              name="motivo"
              required
              placeholder="Motivo"
              className="h-8 w-72 rounded-md border border-borde bg-superficie px-2 text-xs"
            />
            <Boton type="submit" disabled={reabriendo} className="h-8 px-2 text-xs">
              Reabrir
            </Boton>
          </form>
        </details>
      )}
      {r?.error && <Aviso>{r.error}</Aviso>}
      {r?.ok && <Aviso tono="ok">{r.ok}</Aviso>}
    </li>
  )
}

export function Presentaciones({ lista, puede }: { lista: Presentacion[]; puede: boolean }) {
  const cerrado = lista.some((p) => p.estado === 'presentada')
  if (!lista.length) return <p className="px-4 py-3 text-sm text-texto-2">Todavía no se generó nada para este período.</p>
  return (
    <ul className="divide-y divide-borde">
      {lista.map((p) => (
        <Fila key={p.id} p={p} puede={puede} cerrado={cerrado} />
      ))}
    </ul>
  )
}
