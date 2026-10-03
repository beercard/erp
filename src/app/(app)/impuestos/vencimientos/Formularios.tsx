'use client'

import { useActionState, useState, useTransition } from 'react'

import { Aviso, Boton, Chip } from '@/components/ui'

import { configuracionImpuestosAccion, cumplidaAccion, fechaVencimientoAccion, obligacionAccion } from '../acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'

export function ConfiguracionImpuestos({
  inicial,
}: {
  inicial: { emailContador: string | null; emailAvisos: string | null; avisarDias: number; paqueteAlPresentar: boolean }
}) {
  const [estado, accion, enviando] = useActionState(configuracionImpuestosAccion, undefined)
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Email del contador (recibe el paquete del mes)</span>
        <input name="emailContador" type="email" defaultValue={inicial.emailContador ?? ''} className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Email para los avisos de vencimientos (si no, el del contador)</span>
        <input name="emailAvisos" type="email" defaultValue={inicial.emailAvisos ?? ''} className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Avisar con cuántos días de anticipación</span>
        <input name="avisarDias" inputMode="numeric" defaultValue={inicial.avisarDias} className={`${control} cifras w-24`} />
      </label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="paqueteAlPresentar" defaultChecked={inicial.paqueteAlPresentar} /> Mandar el paquete al
        contador cuando se marca presentado el Libro IVA
      </label>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <div className="sm:col-span-2">
        <Boton type="submit" variante="primario" disabled={enviando}>
          Guardar
        </Boton>
      </div>
    </form>
  )
}

type Obligacion = { id: string; nombre: string; impuesto: string; dia: number; activa: boolean }

const IMPUESTO: Record<string, string> = { iva_digital: 'IVA', sicore: 'SICORE', iibb: 'Ingresos Brutos', otro: 'Otra' }

function FilaObligacion({ o }: { o: Obligacion | null }) {
  const [estado, accion, enviando] = useActionState(obligacionAccion.bind(null, o?.id ?? null), undefined)
  return (
    <li className="py-2">
      <form action={accion} className="flex flex-wrap items-center gap-2 text-sm">
        <input
          name="nombre"
          defaultValue={o?.nombre ?? ''}
          placeholder="Otra obligación (ej. Autónomos, cargas sociales)"
          required
          className={`${control} min-w-64 flex-1`}
        />
        {o ? (
          <>
            <input type="hidden" name="impuesto" value={o.impuesto} />
            <Chip>{IMPUESTO[o.impuesto]}</Chip>
          </>
        ) : (
          <input type="hidden" name="impuesto" value="otro" />
        )}
        <label className="flex items-center gap-1 text-xs text-texto-2">
          Día
          <input name="dia" inputMode="numeric" defaultValue={o?.dia ?? ''} required className={`${control} cifras w-16`} />
        </label>
        {o && (
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="activa" defaultChecked={o.activa} /> Activa
          </label>
        )}
        <Boton type="submit" disabled={enviando} className="h-9 px-2 text-xs">
          {o ? 'Guardar' : 'Agregar'}
        </Boton>
      </form>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
    </li>
  )
}

export function Obligaciones({ lista }: { lista: Obligacion[] }) {
  return (
    <ul className="divide-y divide-borde">
      {lista.map((o) => (
        <FilaObligacion key={`${o.id}${o.dia}${o.activa}`} o={o} />
      ))}
      <FilaObligacion key={`nueva${lista.length}`} o={null} />
    </ul>
  )
}

export function FechaEditable({ id, fecha }: { id: string; fecha: string }) {
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState('')
  const [guardando, iniciar] = useTransition()
  if (!editando)
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="cifras hover:underline"
        title="Corregir con el calendario oficial"
      >
        {fecha.split('-').reverse().join('/')}
      </button>
    )
  return (
    <span className="flex items-center gap-1">
      <input
        type="date"
        defaultValue={fecha}
        autoFocus
        disabled={guardando}
        onChange={(e) =>
          e.target.value &&
          iniciar(async () => {
            const r = await fechaVencimientoAccion(id, e.target.value)
            if (!r.ok) setError(r.error)
            else setEditando(false)
          })
        }
        className="h-8 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-1 text-xs"
      />
      {error && <span className="text-xs text-error">{error}</span>}
    </span>
  )
}

export function MarcarCumplida({ id, cumplida }: { id: string; cumplida: boolean }) {
  const [guardando, iniciar] = useTransition()
  return (
    <button
      type="button"
      disabled={guardando}
      onClick={() => iniciar(() => cumplidaAccion(id, !cumplida))}
      className="text-xs text-acento hover:underline"
    >
      {cumplida ? 'Desmarcar' : 'Marcar cumplida'}
    </button>
  )
}
