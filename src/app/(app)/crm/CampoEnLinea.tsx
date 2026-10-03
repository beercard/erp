'use client'

import {
  CalendarDays,
  CircleDollarSign,
  Flag,
  Footprints,
  Mail,
  Percent,
  Phone,
  Star,
  Tag,
  User,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'

import { campoAccion } from './acciones'
import { Estrellas, pesos } from './componentes'

const ICONOS = {
  ingreso: CircleDollarSign,
  probabilidad: Percent,
  fecha: CalendarDays,
  persona: UserRound,
  origen: Flag,
  paso: Footprints,
  etiquetas: Tag,
  contacto: User,
  email: Mail,
  telefono: Phone,
  prioridad: Star,
} satisfies Record<string, LucideIcon>

type Tipo = 'texto' | 'pesos' | 'porcentaje' | 'fecha' | 'opciones' | 'etiquetas' | 'estrellas'

const mostrar = (tipo: Tipo, v: string, opciones?: { valor: string; texto: string }[]) => {
  if (!v) return ''
  if (tipo === 'pesos') return Number(v) ? pesos(v) : ''
  if (tipo === 'porcentaje') return `${v} %`
  if (tipo === 'fecha') return v.split('-').reverse().join('/')
  if (tipo === 'opciones') return opciones?.find((o) => o.valor === v)?.texto ?? ''
  return v
}

/**
 * Un dato de la oportunidad que se edita en el lugar: se toca, se escribe y
 * Enter guarda (Esc cancela). Vacío, muestra el nombre del dato en gris.
 */
export function CampoEnLinea({
  id,
  campo,
  etiqueta,
  icono,
  valor,
  tipo = 'texto',
  opciones,
  editar,
  sugerencias,
}: {
  id: string
  campo: string
  etiqueta: string
  icono: keyof typeof ICONOS
  valor: string
  tipo?: Tipo
  opciones?: { valor: string; texto: string }[]
  editar: boolean
  sugerencias?: string[]
}) {
  const [actual, setActual] = useState(valor)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()
  const entrada = useRef<HTMLInputElement & HTMLSelectElement>(null)
  const Icono = ICONOS[icono]

  useEffect(() => {
    if (editando) entrada.current?.focus()
  }, [editando])

  function guardar(nuevo: string) {
    setEditando(false)
    if (nuevo.trim() === actual.trim()) return
    const anterior = actual
    setActual(nuevo)
    setError(null)
    iniciar(async () => {
      const r = await campoAccion(id, campo, nuevo)
      if (!r.ok) {
        setActual(anterior)
        setError(r.error)
      }
    })
  }

  const texto = mostrar(tipo, actual, opciones)
  const lista = `sug-${campo}-${id}`

  return (
    <div className="flex flex-col">
      <div
        className={`group grid min-h-9 grid-cols-[1rem_7.5rem_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 ${
          editar && !editando ? 'hover:bg-superficie-2' : ''
        } ${guardando ? 'opacity-60' : ''}`}
      >
        <Icono aria-hidden className="size-4 text-texto-3" />
        <span className="truncate text-[13px] text-texto-2">{etiqueta}</span>
        {tipo === 'estrellas' ? (
          <Estrellas valor={Number(actual) || 0} alCambiar={editar ? (v) => guardar(String(v)) : undefined} />
        ) : editando && tipo === 'opciones' ? (
          <select
            ref={entrada}
            defaultValue={actual}
            aria-label={etiqueta}
            onChange={(e) => guardar(e.target.value)}
            onBlur={() => setEditando(false)}
            onKeyDown={(e) => e.key === 'Escape' && setEditando(false)}
            className="h-8 min-w-0 rounded-md border border-acento bg-superficie px-2 text-sm ring-3 ring-anillo"
          >
            {opciones?.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        ) : editando ? (
          <>
            <input
              ref={entrada}
              aria-label={etiqueta}
              defaultValue={tipo === 'pesos' && actual ? actual.replace('.', ',').replace(/,00$/, '') : actual}
              type={tipo === 'fecha' ? 'date' : tipo === 'porcentaje' ? 'number' : 'text'}
              inputMode={tipo === 'pesos' ? 'decimal' : undefined}
              min={tipo === 'porcentaje' ? 0 : undefined}
              max={tipo === 'porcentaje' ? 100 : undefined}
              list={sugerencias?.length ? lista : undefined}
              placeholder={tipo === 'etiquetas' ? 'Separadas por coma' : etiqueta}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  guardar(e.currentTarget.value)
                }
                if (e.key === 'Escape') setEditando(false)
              }}
              onBlur={(e) => guardar(e.currentTarget.value)}
              className="h-8 min-w-0 rounded-md border border-acento bg-superficie px-2 text-sm ring-3 ring-anillo"
            />
            {sugerencias?.length ? (
              <datalist id={lista}>
                {sugerencias.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            disabled={!editar}
            onClick={() => setEditando(true)}
            title={editar ? `Cambiar ${etiqueta.toLowerCase()}` : undefined}
            className={`min-h-8 min-w-0 truncate rounded-md text-left text-sm disabled:cursor-default ${
              texto ? 'font-medium' : 'text-texto-3'
            } ${tipo === 'pesos' ? 'cifras' : ''}`}
          >
            {tipo === 'etiquetas' && texto ? (
              <span className="flex flex-wrap gap-1">
                {texto
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-superficie-2 px-1.5 text-xs font-medium text-texto-2 ring-1 ring-borde"
                    >
                      {t}
                    </span>
                  ))}
              </span>
            ) : (
              texto || (editar ? etiqueta : '—')
            )}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="ml-[9.5rem] px-2 text-xs text-error">
          {error}
        </p>
      )}
    </div>
  )
}

/** El título, editable igual que los datos. */
export function TituloEnLinea({ id, valor, editar }: { id: string; valor: string; editar: boolean }) {
  const [actual, setActual] = useState(valor)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, iniciar] = useTransition()
  function guardar(nuevo: string) {
    setEditando(false)
    if (!nuevo.trim() || nuevo.trim() === actual) return
    const anterior = actual
    setActual(nuevo.trim())
    iniciar(async () => {
      const r = await campoAccion(id, 'titulo', nuevo)
      if (!r.ok) {
        setActual(anterior)
        setError(r.error)
      }
    })
  }
  return (
    <>
      {editando ? (
        <input
          autoFocus
          aria-label="Título"
          defaultValue={actual}
          onKeyDown={(e) => {
            if (e.key === 'Enter') guardar(e.currentTarget.value)
            if (e.key === 'Escape') setEditando(false)
          }}
          onBlur={(e) => guardar(e.currentTarget.value)}
          className="w-full rounded-md border border-acento bg-superficie px-1.5 text-xl font-bold tracking-tight ring-3 ring-anillo"
        />
      ) : (
        <h1 className="text-xl leading-snug font-bold tracking-tight text-balance">
          {editar ? (
            <button type="button" onClick={() => setEditando(true)} className="rounded-md text-left hover:bg-superficie-2">
              {actual}
            </button>
          ) : (
            actual
          )}
        </h1>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
    </>
  )
}
