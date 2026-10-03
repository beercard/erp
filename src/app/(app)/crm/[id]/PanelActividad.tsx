'use client'

import {
  CalendarPlus,
  ExternalLink,
  History,
  Mail,
  MessageCircle,
  Phone,
  PhoneCall,
  Send,
  StickyNote,
  type LucideIcon,
} from 'lucide-react'
import { useActionState, useEffect, useRef, useState, useTransition } from 'react'

import { Aviso, Boton } from '@/components/ui'
import { aplicarPlantilla, DESENLACES_LLAMADA } from '@/modulos/crm/plantillas'

import { emailAccion, llamadaAccion, notaAccion, whatsappAccion } from '../acciones'
import { telefonoLlamar, telefonoWhatsapp } from '../telefono'
import { ActividadPendiente, Agendar } from './PiezasFicha'

type Registro = { id: string; tipo: string; texto: string; creado: string; usuario: string | null }
type Actividad = {
  id: string
  tipo: string
  resumen: string
  vence: string
  hecha: boolean
  resultado: string | null
  estado: 'vencida' | 'hoy' | 'futura' | null
  responsable: string | null
}
type Plantilla = { id: string; nombre: string; canal: string; asunto: string | null; texto: string }

type Modo = 'nota' | 'llamada' | 'whatsapp' | 'email' | 'tarea'
type Pestana = 'todo' | 'notas' | 'llamadas' | 'mensajes' | 'tareas'

const MODOS: { valor: Modo; texto: string; icono: LucideIcon }[] = [
  { valor: 'nota', texto: 'Nota', icono: StickyNote },
  { valor: 'llamada', texto: 'Llamada', icono: PhoneCall },
  { valor: 'whatsapp', texto: 'WhatsApp', icono: MessageCircle },
  { valor: 'email', texto: 'Email', icono: Mail },
  { valor: 'tarea', texto: 'Agendar', icono: CalendarPlus },
]

const PESTANAS: { valor: Pestana; texto: string; modo: Modo; tipos?: string[] }[] = [
  { valor: 'todo', texto: 'Actividad', modo: 'nota' },
  { valor: 'notas', texto: 'Notas', modo: 'nota', tipos: ['nota'] },
  { valor: 'llamadas', texto: 'Llamadas', modo: 'llamada', tipos: ['llamada'] },
  { valor: 'mensajes', texto: 'Mensajes', modo: 'whatsapp', tipos: ['whatsapp', 'email'] },
  { valor: 'tareas', texto: 'Tareas', modo: 'tarea' },
]

const ICONO_REGISTRO: Record<string, { icono: LucideIcon; color: string; nombre: string }> = {
  nota: { icono: StickyNote, color: 'bg-aviso-suave text-aviso', nombre: 'Nota' },
  cambio: { icono: History, color: 'bg-superficie-2 text-texto-3', nombre: 'Cambio' },
  llamada: { icono: Phone, color: 'bg-info-suave text-info', nombre: 'Llamada' },
  whatsapp: { icono: MessageCircle, color: 'bg-ok-suave text-ok', nombre: 'WhatsApp' },
  email: { icono: Mail, color: 'bg-acento-suave text-acento', nombre: 'Email' },
}

const ZONA = 'America/Argentina/Buenos_Aires'
const mes = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: ZONA })
const cuando = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: ZONA,
})
const dia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA })

/** Abre el compositor en un modo desde otro lado de la pantalla (los botones de contacto de la ficha). */
export const abrirCompositor = (modo: Modo) => window.dispatchEvent(new CustomEvent('crm:compositor', { detail: modo }))

/** Ctrl+Enter (o Cmd+Enter) manda el formulario. */
const conAtajo = (e: React.KeyboardEvent<HTMLFormElement>) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    e.currentTarget.requestSubmit()
  }
}

const campo = 'rounded-lg border border-borde-fuerte/80 bg-superficie px-3 text-sm shadow-suave'

/**
 * Columna de actividad de la oportunidad: pestañas por tipo, un compositor
 * para nota, llamada, WhatsApp, email o agendar, y la línea de tiempo
 * agrupada por mes.
 */
export function PanelActividad({
  id,
  abierta,
  puede,
  hoy,
  yo,
  personas,
  historial,
  actividades,
  plantillas,
  variables,
  email,
  telefono,
}: {
  id: string
  abierta: boolean
  puede: boolean
  hoy: string
  yo: string
  personas: { id: string; nombre: string }[]
  historial: Registro[]
  actividades: Actividad[]
  plantillas: Plantilla[]
  variables: Record<string, string>
  email: string | null
  telefono: string | null
}) {
  const [pestana, setPestana] = useState<Pestana>('todo')
  const [modo, setModo] = useState<Modo>('nota')
  const compositor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const abrir = (e: Event) => {
      setModo((e as CustomEvent<Modo>).detail)
      compositor.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      setTimeout(() => compositor.current?.querySelector<HTMLElement>('textarea, input:not([type=radio])')?.focus(), 50)
    }
    window.addEventListener('crm:compositor', abrir)
    return () => window.removeEventListener('crm:compositor', abrir)
  }, [])

  const actual = PESTANAS.find((p) => p.valor === pestana)!
  const registros = actual.tipos ? historial.filter((h) => actual.tipos!.includes(h.tipo)) : historial
  const pendientes = actividades.filter((a) => !a.hecha)
  const hechas = actividades.filter((a) => a.hecha)
  const cuenta = (p: (typeof PESTANAS)[number]) =>
    p.valor === 'tareas' ? pendientes.length : p.tipos ? historial.filter((h) => p.tipos!.includes(h.tipo)).length : 0

  return (
    <section aria-label="Actividad" className="tarjeta min-w-0">
      <div role="tablist" aria-label="Ver" className="flex gap-1 overflow-x-auto border-b border-borde px-3">
        {PESTANAS.map((p) => {
          const n = cuenta(p)
          return (
            <button
              key={p.valor}
              type="button"
              role="tab"
              aria-selected={pestana === p.valor}
              onClick={() => {
                setPestana(p.valor)
                setModo(p.modo === 'whatsapp' && !telefono && email ? 'email' : p.modo)
              }}
              className={`relative flex h-11 shrink-0 items-center gap-1.5 px-2.5 text-sm font-medium transition-colors ${
                pestana === p.valor
                  ? 'text-texto after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:bg-acento'
                  : 'text-texto-2 hover:text-texto'
              }`}
            >
              {p.texto}
              {n > 0 && (
                <span className="rounded-full bg-superficie-2 px-1.5 text-[11px] text-texto-2 ring-1 ring-borde">{n}</span>
              )}
            </button>
          )
        })}
      </div>

      {puede && (
        <div ref={compositor} className="border-b border-borde bg-superficie-2/50 p-4">
          <div role="radiogroup" aria-label="Qué registrar" className="mb-3 flex flex-wrap gap-1">
            {MODOS.filter((m) => m.valor !== 'tarea' || abierta).map((m) => (
              <button
                key={m.valor}
                type="button"
                role="radio"
                aria-checked={modo === m.valor}
                onClick={() => setModo(m.valor)}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${
                  modo === m.valor ? 'bg-superficie text-texto shadow-suave ring-1 ring-borde' : 'text-texto-2 hover:text-texto'
                }`}
              >
                <m.icono aria-hidden className="size-4" /> {m.texto}
              </button>
            ))}
          </div>
          {modo === 'nota' && <ComponerNota id={id} />}
          {modo === 'llamada' && <ComponerLlamada id={id} telefono={telefono} />}
          {modo === 'whatsapp' && (
            <ComponerWhatsapp
              id={id}
              telefono={telefono}
              plantillas={plantillas.filter((p) => p.canal === 'whatsapp')}
              variables={variables}
            />
          )}
          {modo === 'email' && (
            <ComponerEmail
              id={id}
              email={email}
              plantillas={plantillas.filter((p) => p.canal === 'email')}
              variables={variables}
            />
          )}
          {modo === 'tarea' && abierta && <Agendar oportunidadId={id} hoy={hoy} personas={personas} yo={yo} />}
          <p className="mt-2 hidden text-[11px] text-texto-3 sm:block">
            <kbd className="rounded border border-borde bg-superficie px-1 font-mono">Ctrl</kbd> +{' '}
            <kbd className="rounded border border-borde bg-superficie px-1 font-mono">Enter</kbd> para guardar
          </p>
        </div>
      )}

      <div className="p-4 sm:p-5">
        {(pestana === 'todo' || pestana === 'tareas') && pendientes.length > 0 && (
          <div className="mb-5">
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-texto-3 uppercase">Pendientes</h3>
            <ul className="divide-y divide-borde">
              {pendientes.map((a) => (
                <ActividadPendiente key={a.id} a={a} oportunidadId={id} editar={puede} />
              ))}
            </ul>
          </div>
        )}
        {abierta && !pendientes.length && (pestana === 'todo' || pestana === 'tareas') && (
          <p className="mb-5 rounded-lg bg-aviso-suave px-3 py-2 text-sm text-aviso">
            No hay nada agendado: una oportunidad sin próximo contacto se enfría.
          </p>
        )}
        {pestana === 'tareas' ? (
          <ListaHechas hechas={hechas} />
        ) : registros.length ? (
          <LineaDeTiempo registros={registros} />
        ) : (
          <p className="py-8 text-center text-sm text-texto-3">Todavía no hay nada acá.</p>
        )}
      </div>
    </section>
  )
}

/** Agrupa por mes y junta los cambios seguidos de la misma persona en uno solo, que se despliega. */
function agrupar(registros: Registro[]) {
  type Item = { tipo: 'uno'; r: Registro } | { tipo: 'cambios'; rs: Registro[] }
  const meses: { mes: string; items: Item[] }[] = []
  for (const r of registros) {
    const m = mes.format(new Date(r.creado))
    let grupo = meses.at(-1)
    if (!grupo || grupo.mes !== m) meses.push((grupo = { mes: m, items: [] }))
    const ultimo = grupo.items.at(-1)
    const mismoDia = (a: Registro, b: Registro) => dia.format(new Date(a.creado)) === dia.format(new Date(b.creado))
    if (r.tipo === 'cambio' && ultimo) {
      const previo = ultimo.tipo === 'uno' ? ultimo.r : ultimo.rs[0]
      if (previo.tipo === 'cambio' && previo.usuario === r.usuario && mismoDia(previo, r)) {
        grupo.items[grupo.items.length - 1] = { tipo: 'cambios', rs: ultimo.tipo === 'uno' ? [ultimo.r, r] : [...ultimo.rs, r] }
        continue
      }
    }
    grupo.items.push({ tipo: 'uno', r })
  }
  return meses
}

function LineaDeTiempo({ registros }: { registros: Registro[] }) {
  return (
    <div className="flex flex-col gap-5">
      {agrupar(registros).map((g) => (
        <div key={g.mes}>
          <h3 className="mb-3 text-xs font-semibold tracking-wide text-texto-3 uppercase first-letter:uppercase">{g.mes}</h3>
          <ol className="relative flex flex-col gap-4 before:absolute before:top-2 before:bottom-2 before:left-[0.9375rem] before:w-px before:bg-borde">
            {g.items.map((it) =>
              it.tipo === 'uno' ? (
                <ItemRegistro key={it.r.id} r={it.r} />
              ) : (
                <li key={it.rs[0].id} className="relative flex gap-3">
                  <Punto tipo="cambio" />
                  <details className="min-w-0 flex-1 pt-1">
                    <summary className="cursor-pointer text-sm text-texto-2 hover:text-texto">
                      {it.rs[0].usuario ?? 'Sistema'} hizo {it.rs.length} cambios
                      <span className="text-texto-3"> · {cuando.format(new Date(it.rs[0].creado))}</span>
                    </summary>
                    <ul className="mt-1.5 flex flex-col gap-1 text-sm text-texto-2">
                      {it.rs.map((r) => (
                        <li key={r.id}>{r.texto}</li>
                      ))}
                    </ul>
                  </details>
                </li>
              ),
            )}
          </ol>
        </div>
      ))}
    </div>
  )
}

function Punto({ tipo }: { tipo: string }) {
  const t = ICONO_REGISTRO[tipo] ?? ICONO_REGISTRO.cambio
  return (
    <span className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-superficie ${t.color}`}>
      <t.icono aria-hidden className="size-4" />
    </span>
  )
}

function ItemRegistro({ r }: { r: Registro }) {
  const t = ICONO_REGISTRO[r.tipo] ?? ICONO_REGISTRO.cambio
  const pie = (
    <span className="text-texto-3">
      {r.usuario ?? 'Sistema'} · {cuando.format(new Date(r.creado))}
    </span>
  )
  if (r.tipo === 'cambio') {
    return (
      <li className="relative flex gap-3">
        <Punto tipo="cambio" />
        <p className="min-w-0 pt-1.5 text-sm text-texto-2">
          {r.texto} <span className="text-xs">{pie}</span>
        </p>
      </li>
    )
  }
  return (
    <li className="relative flex gap-3">
      <Punto tipo={r.tipo} />
      <div className="min-w-0 flex-1 rounded-xl border border-borde bg-superficie px-3.5 py-2.5 shadow-suave">
        <p className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
          <span className="font-semibold text-texto">{t.nombre}</span>
          {pie}
        </p>
        <p className="text-sm break-words whitespace-pre-line">{r.texto}</p>
      </div>
    </li>
  )
}

function ListaHechas({ hechas }: { hechas: Actividad[] }) {
  if (!hechas.length) return <p className="py-6 text-center text-sm text-texto-3">No hay actividades hechas todavía.</p>
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-texto-3 uppercase">Hechas</h3>
      <ul className="divide-y divide-borde">
        {hechas.map((a) => (
          <li key={a.id} className="py-2.5 text-sm">
            <span className="text-texto-2 line-through">{a.resumen}</span>
            {a.resultado && <span> — {a.resultado}</span>}
            <span className="block text-xs text-texto-3">
              {a.vence.split('-').reverse().join('/')}
              {a.responsable && ` · ${a.responsable}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ----------------------------------------------------------- Compositores

function useLimpiarAlGuardar(estado: { ok?: boolean } | undefined) {
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado?.ok) form.current?.reset()
  }, [estado])
  return form
}

function ComponerNota({ id }: { id: string }) {
  const [estado, accion, enviando] = useActionState(notaAccion.bind(null, id), undefined)
  const form = useLimpiarAlGuardar(estado)
  return (
    <form ref={form} action={accion} onKeyDown={conAtajo} className="flex flex-col gap-2">
      <textarea
        name="nota"
        rows={3}
        required
        aria-label="Nota"
        placeholder="Qué hablaron, qué necesita, qué quedó pendiente…"
        className={`${campo} py-2`}
      />
      <div className="flex items-center justify-between gap-2">
        {estado?.error ? <p className="text-sm text-error">{estado.error}</p> : <span />}
        <Boton type="submit" variante="primario" disabled={enviando}>
          <Send aria-hidden /> Guardar nota
        </Boton>
      </div>
    </form>
  )
}

function ComponerLlamada({ id, telefono }: { id: string; telefono: string | null }) {
  const [estado, accion, enviando] = useActionState(llamadaAccion.bind(null, id), undefined)
  const form = useLimpiarAlGuardar(estado)
  return (
    <form ref={form} action={accion} onKeyDown={conAtajo} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="¿Cómo salió?">
        {Object.entries(DESENLACES_LLAMADA).map(([v, t]) => (
          <label
            key={v}
            className="cursor-pointer rounded-full border border-borde bg-superficie px-3 py-1 text-[13px] has-checked:border-acento has-checked:bg-acento-suave has-checked:text-acento"
          >
            <input type="radio" name="desenlace" value={v} required className="sr-only" defaultChecked={v === 'atendio'} />
            {t}
          </label>
        ))}
        {telefono && (
          <a
            href={telefonoLlamar(telefono)}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-acento hover:bg-acento-suave"
          >
            <Phone aria-hidden className="size-4" /> Llamar al {telefono}
          </a>
        )}
      </div>
      <textarea
        name="nota"
        rows={2}
        aria-label="Qué se habló"
        placeholder="Qué se habló (opcional)"
        className={`${campo} py-2`}
      />
      <div className="flex items-center justify-between gap-2">
        {estado?.error ? <p className="text-sm text-error">{estado.error}</p> : <span />}
        <Boton type="submit" variante="primario" disabled={enviando}>
          <PhoneCall aria-hidden /> Registrar llamada
        </Boton>
      </div>
    </form>
  )
}

function SelectorPlantilla({ plantillas, alElegir }: { plantillas: Plantilla[]; alElegir: (p: Plantilla) => void }) {
  if (!plantillas.length) return null
  return (
    <select
      aria-label="Plantilla"
      defaultValue=""
      onChange={(e) => {
        const p = plantillas.find((x) => x.id === e.target.value)
        if (p) alElegir(p)
      }}
      className={`${campo} h-9`}
    >
      <option value="">Usar una plantilla…</option>
      {plantillas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nombre}
        </option>
      ))}
    </select>
  )
}

function ComponerWhatsapp({
  id,
  telefono,
  plantillas,
  variables,
}: {
  id: string
  telefono: string | null
  plantillas: Plantilla[]
  variables: Record<string, string>
}) {
  const [texto, setTexto] = useState('')
  const [, iniciar] = useTransition()
  const [listo, setListo] = useState(false)
  if (!telefono) return <Aviso tono="info">Cargá el teléfono del contacto para escribirle por WhatsApp.</Aviso>
  return (
    <form
      onKeyDown={conAtajo}
      onSubmit={(e) => {
        e.preventDefault()
        if (!texto.trim()) return
        window.open(telefonoWhatsapp(telefono, texto), '_blank', 'noopener,noreferrer')
        iniciar(() => whatsappAccion(id, texto))
        setTexto('')
        setListo(true)
      }}
      className="flex flex-col gap-2"
    >
      <SelectorPlantilla plantillas={plantillas} alElegir={(p) => setTexto(aplicarPlantilla(p.texto, variables))} />
      <textarea
        rows={3}
        required
        aria-label="Mensaje de WhatsApp"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setListo(false)
        }}
        placeholder="Escribí el mensaje. Se abre WhatsApp con el texto listo para mandar."
        className={`${campo} py-2`}
      />
      <div className="flex items-center justify-between gap-2">
        {listo ? <p className="text-sm text-ok">Quedó registrado en la actividad.</p> : <span />}
        <Boton type="submit" variante="primario" disabled={!texto.trim()}>
          <ExternalLink aria-hidden /> Abrir WhatsApp
        </Boton>
      </div>
    </form>
  )
}

function ComponerEmail({
  id,
  email,
  plantillas,
  variables,
}: {
  id: string
  email: string | null
  plantillas: Plantilla[]
  variables: Record<string, string>
}) {
  const [estado, accion, enviando] = useActionState(emailAccion.bind(null, id), undefined)
  const [asunto, setAsunto] = useState('')
  const [texto, setTexto] = useState('')
  useEffect(() => {
    if (estado?.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- vaciar el compositor al mandarlo
      setAsunto('')
      setTexto('')
    }
  }, [estado])
  return (
    <form action={accion} onKeyDown={conAtajo} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          name="para"
          type="email"
          required
          aria-label="Para"
          defaultValue={estado?.valores?.para ?? email ?? ''}
          placeholder="Para (email)"
          className={`${campo} h-9`}
        />
        <SelectorPlantilla
          plantillas={plantillas}
          alElegir={(p) => {
            setAsunto(aplicarPlantilla(p.asunto ?? '', variables))
            setTexto(aplicarPlantilla(p.texto, variables))
          }}
        />
      </div>
      <input
        name="asunto"
        required
        aria-label="Asunto"
        value={asunto}
        onChange={(e) => setAsunto(e.target.value)}
        placeholder="Asunto"
        className={`${campo} h-9`}
      />
      <textarea
        name="texto"
        rows={5}
        required
        aria-label="Mensaje"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Mensaje"
        className={`${campo} py-2`}
      />
      <div className="flex items-center justify-between gap-2">
        {estado?.error ? (
          <p className="text-sm text-error">{estado.error}</p>
        ) : estado?.ok ? (
          <p className="text-sm text-ok">Enviado. Sale por el correo de la empresa.</p>
        ) : (
          <span />
        )}
        <Boton type="submit" variante="primario" disabled={enviando}>
          <Send aria-hidden /> Enviar email
        </Boton>
      </div>
    </form>
  )
}

/** Íconos de contacto del bloque de identidad: llamar, WhatsApp, email y registrar una llamada. */
export function BotonesContacto({ telefono, email, puede }: { telefono: string | null; email: string | null; puede: boolean }) {
  const boton =
    'grid size-9 place-items-center rounded-lg text-texto-2 ring-1 ring-borde transition-colors hover:bg-superficie-2 hover:text-texto disabled:opacity-40'
  return (
    <div className="flex gap-1.5">
      {telefono ? (
        <a href={telefonoLlamar(telefono)} title={`Llamar al ${telefono}`} aria-label="Llamar" className={boton}>
          <Phone aria-hidden className="size-4" />
        </a>
      ) : (
        <button type="button" disabled aria-label="Llamar (sin teléfono)" className={boton}>
          <Phone aria-hidden className="size-4" />
        </button>
      )}
      <button
        type="button"
        aria-label="WhatsApp"
        title={telefono ? 'Escribir por WhatsApp' : 'Sin teléfono'}
        disabled={!telefono}
        onClick={() => (puede ? abrirCompositor('whatsapp') : window.open(telefonoWhatsapp(telefono!), '_blank', 'noopener'))}
        className={boton}
      >
        <MessageCircle aria-hidden className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Email"
        title={email ? `Escribir a ${email}` : 'Sin email'}
        disabled={!email}
        onClick={() => (puede ? abrirCompositor('email') : (window.location.href = `mailto:${email}`))}
        className={boton}
      >
        <Mail aria-hidden className="size-4" />
      </button>
      {puede && (
        <button
          type="button"
          aria-label="Registrar llamada"
          title="Registrar una llamada"
          onClick={() => abrirCompositor('llamada')}
          className={boton}
        >
          <PhoneCall aria-hidden className="size-4" />
        </button>
      )}
    </div>
  )
}
