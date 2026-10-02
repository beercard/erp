import type { Metadata } from 'next'
import Link from 'next/link'

import { Chip, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { fechaCorta } from '@/lib/fechas'
import { ESTADOS_PORTAL, equiposDelCliente, ordenesDelCliente, tonoEstado } from '@/modulos/portal/portal'

import { requerirPortal } from '../sesion'

export const metadata: Metadata = { title: 'Portal de clientes' }

export default async function InicioPortal() {
  const s = await requerirPortal()
  const { equipos, ordenes } = await conEmpresa(s.empresaId, async (tx) => ({
    equipos: await equiposDelCliente(tx, s.cliente.id),
    ordenes: await ordenesDelCliente(tx, s.cliente.id),
  }))
  const abiertas = ordenes.filter((o) => !o.estado.startsWith('cerrada') && o.estado !== 'cancelada')
  const anteriores = ordenes.filter((o) => !abiertas.includes(o))
  const fila = (o: (typeof ordenes)[number]) => (
    <li key={o.id}>
      <Link
        href={`/portal/ordenes/${o.id}`}
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-superficie-2"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">
            N° {o.numero} · {o.tipo ?? 'Servicio técnico'}
            {o.serie ? ` · ${o.serie}` : ''}
          </span>
          <span className="block truncate text-xs text-texto-2">{o.falla}</span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <Chip tono={tonoEstado(o.estado)}>{ESTADOS_PORTAL[o.estado] ?? o.estado}</Chip>
          <span className="text-xs text-texto-3">
            {o.programada && (o.estado === 'asignada' || o.estado === 'vencida')
              ? `Visita: ${fechaCorta(o.programada)}${o.hora ? ` ${o.hora.slice(0, 5)}` : ''}`
              : fechaCorta(o.fecha)}
          </span>
        </span>
      </Link>
    </li>
  )
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Hola{s.usuario.nombre ? `, ${s.usuario.nombre}` : ''}</h1>
        {s.ordenes && (
          <Link
            href="/portal/pedir"
            className="inline-flex h-10 items-center rounded-md bg-acento px-4 text-sm font-medium text-sobre-acento hover:bg-acento-hover"
          >
            Pedir servicio técnico
          </Link>
        )}
      </div>

      <Panel>
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Servicios en curso</h2>
        {abiertas.length ? (
          <ul className="divide-y divide-borde">{abiertas.map(fila)}</ul>
        ) : (
          <p className="px-4 py-3 text-sm text-texto-2">No tenés servicios en curso.</p>
        )}
      </Panel>

      <Panel>
        <div className="flex items-center justify-between border-b border-borde px-4 py-3">
          <h2 className="text-sm font-semibold">Tus equipos</h2>
          {s.contadores && equipos.length > 0 && (
            <Link href="/portal/contadores" className="text-sm text-acento hover:underline">
              Cargar contadores
            </Link>
          )}
        </div>
        {equipos.length ? (
          <ul className="divide-y divide-borde">
            {equipos.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">
                    {e.modelo ? `${e.modelo} · ` : ''}
                    <span className="cifras">{e.serie}</span>
                  </span>
                  <span className="block text-xs text-texto-2">
                    {[e.domicilio, e.localidad, e.sector].filter(Boolean).join(' · ') || 'Sin domicilio cargado'}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {e.ultimoContador !== null && (
                    <span className="cifras text-xs text-texto-2">
                      Contador {Number(e.ultimoContador).toLocaleString('es-AR')}
                    </span>
                  )}
                  {s.ordenes && (
                    <Link href={`/portal/pedir?equipo=${e.id}`} className="text-xs text-acento hover:underline">
                      Pedir servicio
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-texto-2">No hay equipos a tu nombre.</p>
        )}
      </Panel>

      {anteriores.length > 0 && (
        <Panel>
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Servicios anteriores</h2>
          <ul className="divide-y divide-borde">{anteriores.map(fila)}</ul>
        </Panel>
      )}
    </>
  )
}
