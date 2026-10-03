'use client'

import { ArrowRightLeft, UserRound, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { Chip } from '@/components/ui'

import { asignarVariasAccion, moverVariasAccion } from '../acciones'
import { Estrellas, Iniciales, pesos, ProximaActividad } from '../componentes'

export type Fila = {
  id: string
  titulo: string
  cliente: string | null
  esProspecto: boolean
  etapa: string
  estado: string
  ingresoEsperado: string
  probabilidad: number
  cierreEstimado: string | null
  prioridad: number
  responsable: string | null
  etiquetas: string[]
  proxima: { tipo: string; resumen: string; vence: string; estado: 'vencida' | 'hoy' | 'futura' } | null
}

const TONO = { abierta: 'info', ganada: 'ok', perdida: 'error' } as const

/**
 * Tabla de oportunidades con selección: casillas (con Mayús se marca un
 * rango) y una barra para mover de etapa o reasignar varias a la vez.
 * Con el teclado: j/k o flechas recorren, x marca y Enter abre.
 */
export function TablaOportunidades({
  filas,
  etapas,
  personas,
  editar,
  parametros,
  vacio,
}: {
  filas: Fila[]
  etapas: { id: string; nombre: string }[]
  personas: { id: string; nombre: string }[]
  editar: boolean
  parametros: Record<string, string>
  vacio: string
}) {
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [ultima, setUltima] = useState<number | null>(null)
  const [foco, setFoco] = useState(-1)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [enviando, iniciar] = useTransition()
  const router = useRouter()
  const tabla = useRef<HTMLTableSectionElement>(null)

  // Si cambian los filtros, se descarta lo que ya no está a la vista.
  const visibles = new Set(filas.map((f) => f.id))
  const marcadas = [...elegidas].filter((id) => visibles.has(id))

  function marcar(i: number, rango: boolean) {
    const id = filas[i].id
    setElegidas((antes) => {
      const nuevo = new Set(antes)
      const prender = !antes.has(id)
      if (rango && ultima !== null) {
        const [a, b] = ultima < i ? [ultima, i] : [i, ultima]
        for (let n = a; n <= b; n++) {
          if (prender) nuevo.add(filas[n].id)
          else nuevo.delete(filas[n].id)
        }
      } else if (prender) nuevo.add(id)
      else nuevo.delete(id)
      return nuevo
    })
    setUltima(i)
  }

  const etiquetaHref = (e: string) => `/crm/lista?${new URLSearchParams({ ...parametros, etiqueta: e })}`

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input:not([type=checkbox]), textarea, select, [contenteditable]')) return
      if (!filas.length) return
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        setFoco((f) => Math.min(filas.length - 1, f + 1))
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        setFoco((f) => Math.max(0, f - 1))
      } else if (e.key === 'x' && foco >= 0 && editar) {
        e.preventDefault()
        marcar(foco, e.shiftKey)
      } else if (e.key === 'Enter' && foco >= 0 && !(e.target as HTMLElement).closest('a, button')) {
        e.preventDefault()
        router.push(`/crm/${filas[foco].id}`)
      } else if (e.key === 'Escape' && marcadas.length) {
        setElegidas(new Set())
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  useEffect(() => {
    if (foco >= 0) tabla.current?.querySelectorAll('tr')[foco]?.scrollIntoView({ block: 'nearest' })
  }, [foco])

  function aplicar(trabajo: () => Promise<{ ok: true; cantidad: number } | { ok: false; error: string }>, hecho: string) {
    iniciar(async () => {
      const r = await trabajo()
      if (r.ok) {
        setAviso({ ok: true, texto: `${r.cantidad} ${r.cantidad === 1 ? 'oportunidad' : 'oportunidades'}: ${hecho}.` })
        setElegidas(new Set())
      } else setAviso({ ok: false, texto: r.error })
    })
  }

  const todas = filas.length > 0 && marcadas.length === filas.length

  return (
    <>
      {aviso && (
        <div
          role="status"
          className={`mb-3 flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm ${
            aviso.ok ? 'bg-ok-suave text-ok' : 'bg-error-suave text-error'
          }`}
        >
          {aviso.texto}
          <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-borde text-left text-xs text-texto-2">
              {editar && (
                <th className="w-10 py-2.5 pl-4">
                  <input
                    type="checkbox"
                    aria-label="Elegir todas"
                    checked={todas}
                    ref={(el) => {
                      if (el) el.indeterminate = marcadas.length > 0 && !todas
                    }}
                    onChange={() => setElegidas(todas ? new Set() : new Set(filas.map((f) => f.id)))}
                    className="size-4"
                  />
                </th>
              )}
              <th className="px-4 py-2.5 font-medium">Oportunidad</th>
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="px-4 py-2.5 font-medium">Etapa</th>
              <th className="px-4 py-2.5 text-right font-medium">Ingreso</th>
              <th className="px-4 py-2.5 text-right font-medium">Prob.</th>
              <th className="px-4 py-2.5 font-medium">Cierre</th>
              <th className="px-4 py-2.5 font-medium">Próxima actividad</th>
              <th className="px-4 py-2.5 font-medium">Resp.</th>
            </tr>
          </thead>
          <tbody ref={tabla} className="divide-y divide-borde">
            {!filas.length && (
              <tr>
                <td colSpan={editar ? 9 : 8} className="px-4 py-10 text-center text-texto-2">
                  {vacio}
                </td>
              </tr>
            )}
            {filas.map((o, i) => {
              const marcada = elegidas.has(o.id)
              return (
                <tr
                  key={o.id}
                  aria-selected={editar ? marcada : undefined}
                  className={`group ${marcada ? 'bg-acento-suave/60' : ''} ${foco === i ? 'outline-2 -outline-offset-2 outline-acento/50' : ''}`}
                >
                  {editar && (
                    <td className="py-2.5 pl-4">
                      <input
                        type="checkbox"
                        aria-label={`Elegir ${o.titulo}`}
                        checked={marcada}
                        onChange={() => {}}
                        onClick={(e) => {
                          setFoco(i)
                          marcar(i, e.shiftKey)
                        }}
                        className="size-4"
                      />
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <Link href={`/crm/${o.id}`} className="font-medium group-hover:text-acento">
                      {o.titulo}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Estrellas valor={o.prioridad} tamano="size-3" />
                      {o.etiquetas.slice(0, 3).map((e) => (
                        <Link
                          key={e}
                          href={etiquetaHref(e)}
                          title={`Ver solo “${e}”`}
                          className="rounded-md bg-superficie-2 px-1.5 text-[11px] text-texto-2 hover:text-acento"
                        >
                          {e}
                        </Link>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-texto-2">
                    {o.cliente}
                    {o.esProspecto && <span className="text-texto-3"> · prospecto</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {o.estado === 'abierta' ? (
                      o.etapa
                    ) : (
                      <Chip tono={TONO[o.estado as keyof typeof TONO]}>
                        {o.estado === 'ganada' ? 'Ganada' : `Perdida en ${o.etapa}`}
                      </Chip>
                    )}
                  </td>
                  <td className="cifras px-4 py-2.5 text-right whitespace-nowrap">{pesos(o.ingresoEsperado)}</td>
                  <td className="cifras px-4 py-2.5 text-right text-texto-2">{o.probabilidad} %</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-texto-2">
                    {o.cierreEstimado ? o.cierreEstimado.split('-').reverse().join('/') : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {o.estado === 'abierta' ? <ProximaActividad proxima={o.proxima} /> : <span className="text-texto-3">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Iniciales nombre={o.responsable} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 hidden text-xs text-texto-3 sm:block">
        Teclado: <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> para moverse,{' '}
        {editar && (
          <>
            <kbd className="font-mono">x</kbd> para marcar,{' '}
          </>
        )}
        <kbd className="font-mono">Enter</kbd> para abrir y <kbd className="font-mono">/</kbd> para buscar.
      </p>

      {editar && marcadas.length > 0 && (
        <div
          role="toolbar"
          aria-label="Acciones sobre las elegidas"
          className="aparecer fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-2xl bg-barra px-3 py-2.5 text-sobre-barra shadow-flotante sm:inset-x-6"
        >
          <span className="px-1 text-sm font-semibold">
            {marcadas.length} {marcadas.length === 1 ? 'elegida' : 'elegidas'}
          </span>
          <label className="flex items-center gap-1.5 text-sm">
            <ArrowRightLeft aria-hidden className="size-4 text-sobre-barra-2" />
            <span className="sr-only">Mover a la etapa</span>
            <select
              value=""
              disabled={enviando}
              onChange={(e) => {
                const etapa = etapas.find((x) => x.id === e.target.value)
                if (etapa) aplicar(() => moverVariasAccion(marcadas, etapa.id), `pasaron a ${etapa.nombre}`)
              }}
              className="h-8 rounded-lg border border-white/15 bg-white/10 px-2 text-sm text-sobre-barra"
            >
              <option value="">Mover a…</option>
              {etapas.map((e) => (
                <option key={e.id} value={e.id} className="text-texto">
                  {e.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <UserRound aria-hidden className="size-4 text-sobre-barra-2" />
            <span className="sr-only">Asignar a</span>
            <select
              value=""
              disabled={enviando}
              onChange={(e) => {
                const v = e.target.value
                if (!v) return
                const quien = v === '-' ? '' : v
                const nombre = personas.find((p) => p.id === quien)?.nombre
                aplicar(() => asignarVariasAccion(marcadas, quien), nombre ? `ahora son de ${nombre}` : 'quedaron sin asignar')
              }}
              className="h-8 rounded-lg border border-white/15 bg-white/10 px-2 text-sm text-sobre-barra"
            >
              <option value="">Asignar a…</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id} className="text-texto">
                  {p.nombre}
                </option>
              ))}
              <option value="-" className="text-texto">
                Sin asignar
              </option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setElegidas(new Set())}
            className="ml-auto flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm text-sobre-barra-2 hover:bg-white/10 hover:text-sobre-barra"
          >
            <X aria-hidden className="size-4" /> Limpiar
          </button>
        </div>
      )}
    </>
  )
}
