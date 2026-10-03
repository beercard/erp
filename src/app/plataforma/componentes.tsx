import Link from 'next/link'
import type { ReactNode } from 'react'

import { Chip } from '@/components/ui'

/** Fecha y hora de Argentina, corta. */
export const fechaHora = (d: Date | null | undefined) =>
  d
    ? d.toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—'

/** "hace 3 h", "hace 2 días": para últimos ingresos y latidos. */
export function hace(d: Date | null | undefined, ahora = new Date()) {
  if (!d) return 'nunca'
  const min = Math.round((ahora.getTime() - d.getTime()) / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `hace ${h} h`
  const dias = Math.round(h / 24)
  if (dias < 60) return `hace ${dias} días`
  return `hace ${Math.round(dias / 30)} meses`
}

export const TONO_ESTADO: Record<string, 'ok' | 'info' | 'aviso' | 'error' | 'neutro'> = {
  prueba: 'info',
  activa: 'ok',
  impaga: 'aviso',
  suspendida: 'error',
  cancelada: 'neutro',
}

export function ChipEstado({ estado }: { estado: string }) {
  return <Chip tono={TONO_ESTADO[estado] ?? 'neutro'}>{estado[0].toUpperCase() + estado.slice(1)}</Chip>
}

/** Indicador: rótulo, valor y una línea de contexto opcional. */
export function Indicador({ rotulo, valor, detalle }: { rotulo: string; valor: ReactNode; detalle?: ReactNode }) {
  return (
    <div className="bg-superficie px-4 py-4">
      <span className="block text-xs font-medium text-texto-2">{rotulo}</span>
      <span className="mt-1 block text-[22px] leading-tight font-semibold tracking-tight">{valor}</span>
      {detalle && <span className="mt-1 block text-xs text-texto-3">{detalle}</span>}
    </div>
  )
}

export function Indicadores({ children, columnas = 4 }: { children: ReactNode; columnas?: 3 | 4 | 5 }) {
  const cols = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' }[columnas]
  return (
    <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-borde bg-borde ${cols}`}>{children}</div>
  )
}

/** Título de un panel, con algo a la derecha (un enlace, un contador). */
export function TituloPanel({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-3">
      <h2 className="text-sm font-semibold">{children}</h2>
      {extra}
    </div>
  )
}

/** Pestañas como enlaces (filtros por estado, secciones de una ficha). */
export function Pestanas({ opciones }: { opciones: { href: string; texto: ReactNode; activa: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[13px]">
      {opciones.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          aria-current={o.activa ? 'page' : undefined}
          className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
            o.activa ? 'bg-acento text-sobre-acento' : 'bg-superficie text-texto-2 ring-1 ring-borde hover:text-texto'
          }`}
        >
          {o.texto}
        </Link>
      ))}
    </div>
  )
}

/** Cómo se lee cada acción de la auditoría de la plataforma. */
export const ETIQUETA_ACCION: Record<string, string> = {
  'suscripcion.cambio': 'Cambió la suscripción',
  'suscripcion.pago': 'Registró un pago',
  'suscripcion.pedido': 'Resolvió un pedido de cambio',
  'suscripcion.suspender': 'Suspendió la suscripción',
  'suscripcion.reactivar': 'Reactivó la suscripción',
  'suscripcion.extender_prueba': 'Extendió la prueba',
  'empresa.nota': 'Agregó una nota',
  'empresa.baja': 'Dio de baja la empresa',
  'empresa.alta': 'Habilitó la empresa',
  'empresa.soporte': 'Entró como soporte',
  'usuario.desactivar': 'Desactivó un usuario',
  'usuario.activar': 'Activó un usuario',
  'usuario.cerrar_sesiones': 'Cerró las sesiones de un usuario',
  'consulta.atendida': 'Atendió una consulta del sitio',
  'error.archivar': 'Archivó un error del servidor',
}
