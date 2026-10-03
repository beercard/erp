'use client'

import { Check, Copy, Mail, MessageCircle, Trash2 } from 'lucide-react'
import { useActionState, useEffect, useRef, useState } from 'react'

import { Boton } from '@/components/ui'
import { VARIABLES } from '@/modulos/crm/plantillas'

import { ajustesAccion, borrarPlantillaAccion, guardarPlantillaAccion } from '../acciones'

const campo = 'rounded-lg border border-borde-fuerte/80 bg-superficie px-2.5 text-sm shadow-suave'

type Plantilla = { id: string; nombre: string; canal: string; asunto: string | null; texto: string }

function FormPlantilla({ p, alListo }: { p: Plantilla | null; alListo?: () => void }) {
  const [estado, accion, enviando] = useActionState(guardarPlantillaAccion.bind(null, p?.id ?? null), undefined)
  const [canal, setCanal] = useState(p?.canal ?? 'whatsapp')
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado?.ok) {
      if (!p) form.current?.reset()
      alListo?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia el resultado
  }, [estado])
  return (
    <form ref={form} action={accion} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          name="nombre"
          required
          defaultValue={p?.nombre}
          placeholder="Nombre de la plantilla"
          aria-label="Nombre"
          className={`${campo} h-9 min-w-48 flex-1`}
        />
        <select
          name="canal"
          value={canal}
          onChange={(e) => setCanal(e.target.value)}
          aria-label="Canal"
          className={`${campo} h-9`}
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
        </select>
      </div>
      {canal === 'email' && (
        <input
          name="asunto"
          required
          defaultValue={p?.asunto ?? ''}
          placeholder="Asunto"
          aria-label="Asunto"
          className={`${campo} h-9`}
        />
      )}
      <textarea
        name="texto"
        required
        rows={4}
        defaultValue={p?.texto}
        placeholder="Mensaje"
        aria-label="Mensaje"
        className={`${campo} py-2`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-texto-3">Variables: {VARIABLES.map((v) => `{${v}}`).join(' ')}</p>
        <span className="flex items-center gap-2">
          {estado?.error && <span className="text-sm text-error">{estado.error}</span>}
          {p && alListo && (
            <Boton type="button" variante="fantasma" onClick={alListo}>
              Cancelar
            </Boton>
          )}
          <Boton type="submit" variante={p ? 'primario' : 'secundario'} disabled={enviando}>
            {p ? 'Guardar' : 'Agregar plantilla'}
          </Boton>
        </span>
      </div>
    </form>
  )
}

export function EditorPlantillas({ plantillas }: { plantillas: Plantilla[] }) {
  const [editando, setEditando] = useState<string | null>(null)
  return (
    <div className="px-5 pb-5">
      <ul className="divide-y divide-borde">
        {plantillas.map((p) => {
          const Icono = p.canal === 'email' ? Mail : MessageCircle
          return (
            <li key={p.id} className="py-3">
              {editando === p.id ? (
                <FormPlantilla p={p} alListo={() => setEditando(null)} />
              ) : (
                <div className="flex items-start gap-3">
                  <Icono aria-hidden className={`mt-0.5 size-4 shrink-0 ${p.canal === 'email' ? 'text-acento' : 'text-ok'}`} />
                  <button type="button" onClick={() => setEditando(p.id)} className="min-w-0 flex-1 text-left">
                    <span className="block text-sm font-medium hover:text-acento">{p.nombre}</span>
                    <span className="line-clamp-2 text-xs text-texto-2">
                      {p.asunto ? `${p.asunto} — ` : ''}
                      {p.texto}
                    </span>
                  </button>
                  <form action={borrarPlantillaAccion.bind(null, p.id)}>
                    <button
                      type="submit"
                      aria-label={`Borrar ${p.nombre}`}
                      className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-error-suave hover:text-error"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </form>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-2 rounded-xl border border-dashed border-borde-fuerte/70 p-3">
        <FormPlantilla p={null} />
      </div>
    </div>
  )
}

export function FormAjustes({
  ajustes,
  personas,
}: {
  ajustes: { asignacion: string; vendedores: string[]; resumenDiario: boolean }
  personas: { id: string; nombre: string }[]
}) {
  const [estado, accion, enviando] = useActionState(ajustesAccion, undefined)
  const [rotativa, setRotativa] = useState(ajustes.asignacion === 'rotativa')
  return (
    <form action={accion} className="flex flex-col gap-4 p-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Consultas nuevas (formulario web)</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="asignacion"
            value="ninguna"
            checked={!rotativa}
            onChange={() => setRotativa(false)}
            className="mt-0.5"
          />
          <span>Quedan sin asignar y las toma quien las vea.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="asignacion"
            value="rotativa"
            checked={rotativa}
            onChange={() => setRotativa(true)}
            className="mt-0.5"
          />
          <span>Se reparten por turno entre estos vendedores:</span>
        </label>
        {rotativa && (
          <div className="ml-6 flex flex-wrap gap-1.5">
            {personas.map((p) => (
              <label
                key={p.id}
                className="cursor-pointer rounded-full border border-borde px-3 py-1 text-sm has-checked:border-acento has-checked:bg-acento-suave has-checked:text-acento"
              >
                <input
                  type="checkbox"
                  name="vendedores"
                  value={p.id}
                  defaultChecked={ajustes.vendedores.includes(p.id)}
                  className="sr-only"
                />
                {p.nombre}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="resumenDiario" defaultChecked={ajustes.resumenDiario} className="mt-0.5" />
        <span>
          <span className="font-medium">Resumen diario por email.</span>{' '}
          <span className="text-texto-2">A las 8, cada vendedor recibe sus actividades vencidas y las de hoy.</span>
        </span>
      </label>
      <div className="flex items-center justify-end gap-3">
        {estado?.error && <span className="text-sm text-error">{estado.error}</span>}
        {estado?.ok && <span className="text-sm text-ok">Guardado.</span>}
        <Boton type="submit" variante="primario" disabled={enviando}>
          Guardar
        </Boton>
      </div>
    </form>
  )
}

export function Copiar({ texto, etiqueta = 'Copiar' }: { texto: string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <Boton
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(texto).then(() => {
          setCopiado(true)
          setTimeout(() => setCopiado(false), 2000)
        })
      }
    >
      {copiado ? <Check aria-hidden /> : <Copy aria-hidden />} {copiado ? 'Copiado' : etiqueta}
    </Boton>
  )
}
