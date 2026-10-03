import type { Metadata } from 'next'
import { ClipboardList, Gauge, Wallet, Wrench } from 'lucide-react'
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
  const acciones = [
    ...(s.ordenes ? [{ href: '/portal/pedir', texto: 'Pedir servicio', ayuda: 'Una visita técnica', icono: Wrench }] : []),
    ...(s.contadores && equipos.length
      ? [{ href: '/portal/contadores', texto: 'Cargar contadores', ayuda: 'Las lecturas del mes', icono: Gauge }]
      : []),
    ...(s.cuenta ? [{ href: '/portal/cuenta', texto: 'Mi cuenta', ayuda: 'Saldo y facturas', icono: Wallet }] : []),
    ...(s.formularios
      ? [{ href: '/portal/formularios', texto: 'Formularios', ayuda: 'Pedidos y planillas', icono: ClipboardList }]
      : []),
  ]
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
      <h1 className="text-xl font-semibold">Hola{s.usuario.nombre ? `, ${s.usuario.nombre}` : ''}</h1>
      {acciones.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {acciones.map(({ href, texto, ayuda, icono: Icono }, i) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-col gap-2 rounded-lg border p-4 transition hover:shadow-panel ${
                i === 0 ? 'border-transparent bg-acento text-sobre-acento' : 'border-borde bg-superficie hover:border-acento/60'
              }`}
            >
              <Icono aria-hidden className="size-6" />
              <span className="font-semibold">{texto}</span>
              <span className={`text-xs ${i === 0 ? 'opacity-85' : 'text-texto-2'}`}>{ayuda}</span>
            </Link>
          ))}
        </div>
      )}

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
