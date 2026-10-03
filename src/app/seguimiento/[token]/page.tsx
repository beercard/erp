import { Check, Navigation } from 'lucide-react'
import type { Metadata } from 'next'

import { Chip, Panel } from '@/components/ui'
import { seguimientoPublico } from '@/modulos/servicio/seguimiento'

import { Refrescar } from './Refrescar'

export const metadata: Metadata = { title: 'Seguimiento del servicio', robots: { index: false, follow: false } }

/** Seguimiento de una orden de servicio para el cliente, sin usuario (el enlace va en el aviso de la visita). */
export default async function Seguimiento({ params }: PageProps<'/seguimiento/[token]'>) {
  const { token } = await params
  const s = await seguimientoPublico(decodeURIComponent(token)).catch(() => null)
  if (!s)
    return (
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-4 px-4 py-10">
        <Panel className="p-6 text-sm text-texto-2">El enlace no es válido.</Panel>
      </main>
    )
  const abierta = !s.cancelada && !s.pasos[4].hecho
  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-4 px-4 py-10">
      {abierta && <Refrescar segundos={60} />}
      <header>
        <p className="text-sm text-texto-2">{s.empresa}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">
            Servicio técnico N° {s.numero}
            {s.tipo ? ` · ${s.tipo}` : ''}
          </h1>
          <Chip tono={s.tono}>{s.estado}</Chip>
        </div>
        <p className="mt-1 text-sm text-texto-2">{[s.equipo, s.domicilio].filter(Boolean).join(' · ')}</p>
      </header>

      {s.enCamino && (
        <Panel className="flex items-center gap-3 border-acento p-4">
          <Navigation aria-hidden className="size-5 shrink-0 text-acento" />
          <p className="text-sm">
            <span className="font-semibold">{s.tecnico ?? 'El técnico'} está en camino.</span>{' '}
            {s.enCamino.minutos
              ? `Llega en unos ${s.enCamino.minutos} minutos (a ${s.enCamino.km.toLocaleString('es-AR')} km).`
              : 'Está llegando.'}
            <span className="block text-xs text-texto-2">
              Estimado a las{' '}
              {s.enCamino.actualizado.toLocaleTimeString('es-AR', {
                timeZone: 'America/Argentina/Buenos_Aires',
                timeStyle: 'short',
              })}
              ; se actualiza solo.
            </span>
          </p>
        </Panel>
      )}

      {s.cancelada ? (
        <Panel className="p-4 text-sm">Esta orden fue cancelada.</Panel>
      ) : (
        <Panel className="p-4">
          <ol className="flex flex-col gap-3">
            {s.pasos.map((p) => (
              <li key={p.texto} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                    p.hecho ? 'border-acento bg-acento text-sobre-acento' : 'border-borde'
                  }`}
                >
                  {p.hecho && <Check aria-hidden className="size-3" />}
                </span>
                <span className="text-sm">
                  <span className={p.hecho ? 'font-medium' : 'text-texto-2'}>{p.texto}</span>
                  {p.cuando && <span className="block text-xs text-texto-2">{p.cuando}</span>}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {s.trabajo && (
        <Panel className="p-4">
          <h2 className="mb-1 text-sm font-semibold">Trabajo realizado</h2>
          <p className="text-sm whitespace-pre-line">{s.trabajo}</p>
        </Panel>
      )}
    </main>
  )
}
