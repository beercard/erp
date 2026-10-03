import { Check, FileText, Star } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { VistaRespuestas } from '@/components/servicio/VistaRespuestas'
import { Aviso, Chip, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { fechaCorta } from '@/lib/fechas'
import { ESTADOS_PORTAL, ordenDelCliente, tonoEstado } from '@/modulos/portal/portal'

import { requerirPortal } from '../../../sesion'

export const metadata: Metadata = { title: 'Servicio técnico' }

const hora = (d: Date | null) =>
  d ? d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) : null

/** Seguimiento de una orden, como lo ve el cliente: en qué paso está, cuándo va el técnico y qué se hizo. */
export default async function OrdenPortal({ params, searchParams }: PageProps<'/portal/ordenes/[id]'>) {
  const s = await requerirPortal()
  const { id } = await params
  const { pedida } = (await searchParams) as { pedida?: string }
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const o = await conEmpresa(s.empresaId, (tx) => ordenDelCliente(tx, s, id))
  if (!o) notFound()
  const cancelada = o.estado === 'cancelada'
  const pasos = [
    { texto: 'Pedido recibido', cuando: hora(o.creado) ?? fechaCorta(o.fecha), hecho: true },
    {
      texto: 'Visita programada',
      cuando: o.programada
        ? `${fechaCorta(o.programada)}${o.hora ? ` ${o.hora.slice(0, 5)}` : ''}${o.tecnico ? ` · ${o.tecnico.nombre}` : ''}`
        : null,
      hecho: !!o.programada && !!o.tecnico,
    },
    { texto: 'Técnico en el lugar', cuando: hora(o.llegada), hecho: !!o.llegada },
    { texto: 'Trabajo realizado', cuando: hora(o.informada), hecho: !!o.informada },
    {
      texto: 'Cerrado',
      cuando: o.estado.startsWith('cerrada') ? ESTADOS_PORTAL[o.estado] : null,
      hecho: o.estado.startsWith('cerrada'),
    },
  ]
  return (
    <>
      <Link href="/portal" className="text-sm text-acento hover:underline">
        ← Volver
      </Link>
      {pedida && <Aviso tono="ok">Recibimos tu pedido. Te avisamos cuando programemos la visita.</Aviso>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            Servicio N° {o.numero}
            {o.tipoOrden ? ` · ${o.tipoOrden.nombre}` : ''}
          </h1>
          <p className="text-sm text-texto-2">
            {o.equipo ? `${o.equipo.modelo ? `${o.equipo.modelo} · ` : ''}serie ${o.equipo.serie}` : 'Sin equipo'}
            {o.domicilio ? ` · ${o.domicilio}` : ''}
          </p>
        </div>
        <Chip tono={tonoEstado(o.estado)}>{ESTADOS_PORTAL[o.estado] ?? o.estado}</Chip>
      </div>

      {o.enlaceEncuesta && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="text-sm">¿Cómo te atendimos? Contanos en un minuto.</span>
          <Link
            href={o.enlaceEncuesta}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-acento px-3 text-sm font-medium text-sobre-acento hover:bg-acento-hover"
          >
            <Star aria-hidden className="size-4" /> Responder la encuesta
          </Link>
        </Panel>
      )}

      {!cancelada && (
        <Panel className="p-4">
          <ol className="flex flex-col gap-3">
            {pasos.map((p) => (
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

      <Panel className="p-4">
        <h2 className="mb-2 text-sm font-semibold">Lo que pediste</h2>
        <p className="text-sm whitespace-pre-line">{o.falla}</p>
        {o.plantilla && (
          <div className="mt-3">
            <VistaRespuestas
              campos={o.plantilla.instrucciones.filter((c) => c.tipo !== 'equipo')}
              valores={o.instrucciones}
              vacio=""
              archivos="/portal/archivo"
            />
          </div>
        )}
      </Panel>

      {(o.solucion || o.informada) && (
        <Panel className="p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Trabajo realizado</h2>
            <Link
              href={`/portal/ordenes/${o.id}/constancia`}
              className="inline-flex items-center gap-1 text-sm text-acento hover:underline"
            >
              <FileText aria-hidden className="size-4" /> Constancia
            </Link>
          </div>
          {o.solucion && <p className="mb-3 text-sm whitespace-pre-line">{o.solucion}</p>}
          {o.plantilla && (
            <VistaRespuestas campos={o.plantilla.devolucion} valores={o.resultados} vacio="" archivos="/portal/archivo" />
          )}
        </Panel>
      )}
    </>
  )
}
