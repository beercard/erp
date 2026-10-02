import { MapPin, Wrench } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { VistaRespuestas } from '@/components/servicio/VistaRespuestas'
import { Aviso, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { tienePermiso } from '@/lib/permisos'
import { obtenerEnvio } from '@/modulos/servicio/sueltos'

import { paginaContratos } from '../../../contratos/modulo'
import { CambiarEstado } from './CambiarEstado'

export const metadata: Metadata = { title: 'Formulario recibido' }

const hora = (d: Date | null) =>
  d ? d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) : '—'

export default async function Envio({ params, searchParams }: PageProps<'/servicio/bandeja/[id]'>) {
  const sesion = await paginaContratos('servicio.cargar')
  const { id } = await params
  const { enviado } = (await searchParams) as { enviado?: string }
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const e = await conEmpresa(sesion.empresa.id, (tx) => obtenerEnvio(tx, id))
  if (!e) notFound()
  const equipos = e.equipo ? { [e.equipo.id]: `${e.equipo.modelo ? `${e.equipo.modelo} · ` : ''}${e.equipo.serie}` } : {}
  const de =
    e.origen === 'portal'
      ? `Cliente desde el portal${e.portal ? ` (${e.portal.nombre ?? e.portal.email})` : ''}`
      : e.origen === 'tecnico'
        ? `Técnico${e.tecnico ? `: ${e.tecnico}` : ''}`
        : 'Oficina'
  return (
    <>
      <Link href="/servicio/bandeja" className="text-sm text-acento hover:underline">
        ← Bandeja de entrada
      </Link>
      <EncabezadoPagina titulo={`${e.formulario.nombre} N° ${e.numero}`} bajada={`${de} · ${hora(e.enviado)}`} />
      {enviado && (
        <div className="mb-4">
          <Aviso tono="ok">Formulario enviado.</Aviso>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Panel className="p-4">
          {(e.cliente || e.lat) && (
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-borde pb-3 text-sm">
              {e.cliente && (
                <span>
                  <span className="font-medium">{e.cliente.razonSocial}</span>
                  <span className="block text-xs text-texto-2">
                    {[e.cliente.telefono, e.cliente.email].filter(Boolean).join(' · ')}
                    {e.equipo && ` · equipo ${e.equipo.serie}`}
                  </span>
                </span>
              )}
              {e.lat && e.lng && (
                <a
                  href={`https://www.google.com/maps?q=${e.lat},${e.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-acento hover:underline"
                >
                  <MapPin aria-hidden className="size-3.5" /> Dónde se completó
                </a>
              )}
            </div>
          )}
          <VistaRespuestas campos={e.campos} valores={e.valores} equipos={equipos} />
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel className="p-4">
            <CambiarEstado id={e.id} estadoId={e.estadoId} nota={e.nota} estados={e.estados} />
          </Panel>
          {e.cliente && tienePermiso(sesion.permisos, 'servicio.cargar') && (
            <Link
              href={e.equipo ? `/servicio/nueva?equipo=${e.equipo.id}` : `/servicio/nueva?cliente=${e.cliente.id}`}
              className="flex items-center gap-2 rounded-md border border-borde bg-superficie px-3 py-2 text-sm hover:border-acento"
            >
              <Wrench aria-hidden className="size-4" /> Abrir una orden para este cliente
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
