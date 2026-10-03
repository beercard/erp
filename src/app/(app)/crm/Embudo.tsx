'use client'

import { CalendarClock, Clock, Hourglass, MoreHorizontal, Plus, StickyNote, Trophy, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from 'react'

import { altaRapidaAccion, moverAccion, prioridadAccion } from './acciones'
import { Estrellas, Iniciales, pesos, ProximaActividad } from './componentes'

export type Tarjeta = {
  id: string
  titulo: string
  cliente: string | null
  esProspecto: boolean
  estado: string
  ingresoEsperado: string
  probabilidad: number
  prioridad: number
  responsable: string | null
  etiquetas: string[]
  diasEnEtapa: number
  estancada: boolean
  sinActividad: boolean
  proximoPaso: string | null
  notas: number
  pendientes: number
  proxima: { tipo: string; resumen: string; vence: string; estado: 'vencida' | 'hoy' | 'futura' } | null
}

export type Columna = {
  id: string
  nombre: string
  ganada: boolean
  probabilidad: number
  oportunidades: Tarjeta[]
}

type Movimiento = { id: string; etapaId: string; antesDe: string | null }

/** Aplica un movimiento a las columnas (para mostrarlo antes de que responda el servidor). */
function mover(columnas: Columna[], m: Movimiento): Columna[] {
  const tarjeta = columnas.flatMap((c) => c.oportunidades).find((o) => o.id === m.id)
  if (!tarjeta) return columnas
  return columnas.map((c) => {
    const resto = c.oportunidades.filter((o) => o.id !== m.id)
    if (c.id !== m.etapaId) return { ...c, oportunidades: resto }
    const i = m.antesDe ? resto.findIndex((o) => o.id === m.antesDe) : -1
    const movida = {
      ...tarjeta,
      estado: c.ganada ? 'ganada' : 'abierta',
      probabilidad: c.probabilidad,
      diasEnEtapa: 0,
      estancada: false,
    }
    resto.splice(i < 0 ? resto.length : i, 0, movida)
    return { ...c, oportunidades: resto }
  })
}

const total = (ops: Tarjeta[]) => ops.reduce((s, o) => s + Number(o.ingresoEsperado), 0)

/**
 * El embudo: una columna por etapa con sus oportunidades. Se arrastra con el
 * mouse; en el celular o con teclado, cada tarjeta tiene "Mover a…".
 */
export function Embudo({ columnas, editar, abierta }: { columnas: Columna[]; editar: boolean; abierta: string | null }) {
  const [vista, aplicar] = useOptimistic(columnas, mover)
  const [altaEn, setAltaEn] = useState<string | null>(null)
  const router = useRouter()
  const parametros = useSearchParams()
  /** Un clic abre la vista rápida; con Ctrl, Cmd o la rueda, la ficha en otra pestaña. */
  const ver = (id: string) => {
    const p = new URLSearchParams(parametros)
    p.set('o', id)
    router.push(`/crm?${p}`, { scroll: false })
  }
  const [, iniciar] = useTransition()
  const [arrastrada, setArrastrada] = useState<string | null>(null)
  const [sobre, setSobre] = useState<{ etapa: string; antesDe: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function soltar(m: Movimiento) {
    setArrastrada(null)
    setSobre(null)
    if (m.id === m.antesDe) return
    iniciar(async () => {
      aplicar(m)
      const r = await moverAccion(m.id, m.etapaId, m.antesDe)
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <div className="relative">
      {error && (
        <div
          role="alert"
          className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-error-suave px-3.5 py-2.5 text-sm text-error"
        >
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Cerrar">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
        {vista.map((c) => {
          const suma = total(c.oportunidades)
          const destino = sobre?.etapa === c.id
          return (
            <section
              key={c.id}
              aria-label={`Etapa ${c.nombre}`}
              onDragOver={(e) => {
                if (!editar || !arrastrada) return
                e.preventDefault()
                if (!destino) setSobre({ etapa: c.id, antesDe: null })
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (arrastrada) soltar({ id: arrastrada, etapaId: c.id, antesDe: sobre?.etapa === c.id ? sobre.antesDe : null })
              }}
              className={`group/col flex w-[17.5rem] shrink-0 snap-start flex-col rounded-2xl p-2 transition-colors ${
                destino ? 'bg-acento-suave ring-2 ring-acento/40' : 'bg-texto/[0.035]'
              }`}
            >
              <header className="relative px-1.5 pt-1 pb-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                    {c.ganada && <Trophy aria-hidden className="size-4 shrink-0 text-ok" />}
                    <span className="truncate">{c.nombre}</span>
                    <span className="rounded-full bg-superficie px-1.5 text-xs font-medium text-texto-2 ring-1 ring-borde">
                      {c.oportunidades.length}
                    </span>
                  </h2>
                  {editar && (
                    <button
                      type="button"
                      onClick={() => setAltaEn(altaEn === c.id ? null : c.id)}
                      aria-expanded={altaEn === c.id}
                      aria-label={`Nueva oportunidad en ${c.nombre}`}
                      title="Nueva oportunidad"
                      className="grid size-7 place-items-center rounded-lg text-texto-2 transition-opacity group-hover/col:opacity-100 hover:bg-superficie hover:text-texto focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:hover)]:opacity-0"
                    >
                      <Plus aria-hidden className="size-4" />
                    </button>
                  )}
                </div>
                <p className="mt-1 flex items-baseline justify-between text-xs text-texto-2">
                  <span className="cifras font-semibold text-texto">{pesos(suma)}</span>
                  <span>{c.probabilidad} %</span>
                </p>
                <Barra oportunidades={c.oportunidades} />
              </header>
              <ol className="flex min-h-16 flex-1 flex-col gap-2">
                {c.oportunidades.map((o) => (
                  <li
                    key={o.id}
                    draggable={editar}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', o.id)
                      setArrastrada(o.id)
                    }}
                    onDragEnd={() => {
                      setArrastrada(null)
                      setSobre(null)
                    }}
                    onDragOver={(e) => {
                      if (!editar || !arrastrada) return
                      e.preventDefault()
                      e.stopPropagation()
                      if (sobre?.antesDe !== o.id) setSobre({ etapa: c.id, antesDe: o.id })
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (arrastrada) soltar({ id: arrastrada, etapaId: c.id, antesDe: o.id })
                    }}
                    className={`relative ${arrastrada === o.id ? 'opacity-40' : ''} ${
                      sobre?.antesDe === o.id && arrastrada !== o.id
                        ? 'before:absolute before:-top-1.5 before:right-2 before:left-2 before:h-0.5 before:rounded-full before:bg-acento'
                        : ''
                    }`}
                  >
                    <TarjetaOportunidad
                      o={o}
                      columnas={vista}
                      editar={editar}
                      elegida={abierta === o.id}
                      alVer={() => ver(o.id)}
                      alMover={(etapaId) => soltar({ id: o.id, etapaId, antesDe: null })}
                    />
                  </li>
                ))}
                {!c.oportunidades.length && altaEn !== c.id && (
                  <li className="grid flex-1 place-items-center rounded-xl border border-dashed border-borde-fuerte/60 px-3 py-6 text-center text-xs text-texto-3">
                    {editar ? 'Arrastrá una oportunidad acá' : 'Sin oportunidades'}
                  </li>
                )}
              </ol>
              {editar &&
                (altaEn === c.id ? (
                  <AltaRapida etapaId={c.id} alCerrar={() => setAltaEn(null)} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAltaEn(c.id)}
                    className="mt-2 flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-texto-3 hover:bg-superficie hover:text-texto"
                  >
                    <Plus aria-hidden className="size-4" /> Nueva
                  </button>
                ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** Barra de la columna: cuántas tienen actividad vencida, para hoy, futura o nada (como en Odoo). */
function Barra({ oportunidades }: { oportunidades: Tarjeta[] }) {
  if (!oportunidades.length) return <div className="mt-2 h-1 rounded-full bg-borde" />
  const n = oportunidades.length
  const cuenta = (f: (o: Tarjeta) => boolean) => (oportunidades.filter(f).length / n) * 100
  const partes = [
    { p: cuenta((o) => o.proxima?.estado === 'vencida'), c: 'bg-error', t: 'con actividad vencida' },
    { p: cuenta((o) => o.proxima?.estado === 'hoy'), c: 'bg-aviso', t: 'con actividad para hoy' },
    { p: cuenta((o) => o.proxima?.estado === 'futura'), c: 'bg-ok', t: 'con actividad agendada' },
  ]
  return (
    <div className="mt-2 flex h-1 overflow-hidden rounded-full bg-borde">
      {partes.map((x) =>
        x.p ? <span key={x.c} style={{ width: `${x.p}%` }} className={x.c} title={`${Math.round(x.p)} % ${x.t}`} /> : null,
      )}
    </div>
  )
}

function TarjetaOportunidad({
  o,
  columnas,
  editar,
  elegida,
  alVer,
  alMover,
}: {
  o: Tarjeta
  columnas: Columna[]
  editar: boolean
  elegida: boolean
  alVer: () => void
  alMover: (etapaId: string) => void
}) {
  const [, iniciar] = useTransition()
  const [prioridad, setPrioridad] = useState(o.prioridad)
  return (
    <article
      className={`group tarjeta relative flex flex-col gap-2 p-3 transition hover:shadow-panel ${editar ? 'cursor-grab active:cursor-grabbing' : ''} ${
        elegida ? 'ring-2 ring-acento' : ''
      } ${o.estado === 'ganada' ? 'border-l-4 border-l-ok' : o.estancada ? 'border-l-4 border-l-aviso' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/crm/${o.id}`}
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
            e.preventDefault()
            alVer()
          }}
          className="min-w-0 text-sm leading-snug font-semibold after:absolute after:inset-0 hover:text-acento"
        >
          {o.titulo}
        </Link>
        {editar && (
          <details className="relative z-10 shrink-0">
            <summary
              aria-label="Mover a otra etapa"
              className="grid size-6 cursor-pointer list-none place-items-center rounded-md text-texto-3 opacity-60 group-hover:opacity-100 hover:bg-superficie-2 [&::-webkit-details-marker]:hidden"
            >
              <MoreHorizontal aria-hidden className="size-4" />
            </summary>
            <div className="aparecer absolute right-0 z-20 mt-1 w-48 rounded-xl border border-borde bg-superficie p-1 shadow-flotante">
              <p className="px-2 py-1 text-[11px] font-medium text-texto-3">Mover a</p>
              {columnas.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={(e) => {
                    ;(e.currentTarget.closest('details') as HTMLDetailsElement).open = false
                    alMover(c.id)
                  }}
                  className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-superficie-2"
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
      {o.cliente && (
        <p className="-mt-1 truncate text-xs text-texto-2">
          {o.cliente}
          {o.esProspecto && <span className="ml-1 text-texto-3">· prospecto</span>}
        </p>
      )}
      {o.etiquetas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {o.etiquetas.slice(0, 3).map((e) => (
            <span key={e} className="rounded-md bg-superficie-2 px-1.5 py-px text-[11px] font-medium text-texto-2">
              {e}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="cifras text-sm font-semibold">{Number(o.ingresoEsperado) ? pesos(o.ingresoEsperado) : '—'}</span>
        <span className="relative z-10">
          <Estrellas
            valor={prioridad}
            alCambiar={
              editar
                ? (v) => {
                    setPrioridad(v)
                    iniciar(() => prioridadAccion(o.id, v))
                  }
                : undefined
            }
          />
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-borde pt-2">
        <span className="flex min-w-0 items-center gap-2">
          <ProximaActividad proxima={o.proxima} />
          {o.estancada && (
            <span
              className="inline-flex items-center gap-0.5 rounded-md bg-aviso-suave px-1.5 py-px text-[11px] font-semibold text-aviso"
              title="Pasó los días de alerta de la etapa"
            >
              <Hourglass aria-hidden className="size-3" /> {o.diasEnEtapa} d
            </span>
          )}
          {!o.estancada && o.diasEnEtapa > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-texto-3" title="Días en esta etapa">
              <Clock aria-hidden className="size-3" /> {o.diasEnEtapa} d
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {o.notas > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-texto-3" title={`${o.notas} notas y mensajes`}>
              <StickyNote aria-hidden className="size-3" /> {o.notas}
            </span>
          )}
          {o.pendientes > 1 && (
            <span
              className="inline-flex items-center gap-0.5 text-[11px] text-texto-3"
              title={`${o.pendientes} actividades pendientes`}
            >
              <CalendarClock aria-hidden className="size-3" /> {o.pendientes}
            </span>
          )}
          <Iniciales nombre={o.responsable} />
        </span>
      </div>
    </article>
  )
}

/** Alta en la columna, sin salir del embudo: título, cliente o prospecto e ingreso. */
function AltaRapida({ etapaId, alCerrar }: { etapaId: string; alCerrar: () => void }) {
  const [estado, accion, enviando] = useActionState(altaRapidaAccion.bind(null, etapaId), undefined)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado?.ok) {
      form.current?.reset()
      form.current?.querySelector<HTMLInputElement>('input')?.focus()
    }
  }, [estado])
  return (
    <form
      ref={form}
      action={accion}
      onKeyDown={(e) => e.key === 'Escape' && alCerrar()}
      className="aparecer tarjeta mt-2 flex flex-col gap-2 p-2.5"
    >
      <input
        name="titulo"
        required
        autoFocus
        aria-label="Título"
        placeholder="¿Qué se vende? Ej.: 3 fotocopiadoras"
        className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-2.5 text-sm"
      />
      <input
        name="empresaProspecto"
        aria-label="Empresa o contacto"
        placeholder="Empresa o contacto"
        className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-2.5 text-sm"
      />
      <input
        name="ingresoEsperado"
        inputMode="decimal"
        aria-label="Ingreso esperado"
        placeholder="Ingreso esperado sin IVA ($)"
        className="h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-2.5 text-sm"
      />
      {estado?.error && <p className="text-xs text-error">{estado.error}</p>}
      {estado?.ok && <p className="text-xs text-ok">Agregada. Podés cargar otra.</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={alCerrar} className="h-8 rounded-lg px-3 text-sm text-texto-2 hover:bg-superficie-2">
          Cerrar
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="boton-lleno h-8 rounded-lg bg-acento px-3 text-sm font-semibold text-sobre-acento disabled:opacity-50"
        >
          Agregar
        </button>
      </div>
    </form>
  )
}
