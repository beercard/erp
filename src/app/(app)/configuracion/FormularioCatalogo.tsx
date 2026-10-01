'use client'

import { useActionState, useRef } from 'react'

import { Aviso, Boton, BotonEnlace, Campo, Selector } from '@/components/ui'

import { guardarCatalogoAccion } from './acciones'

export type CampoVisible = {
  nombre: string
  etiqueta: string
  tipo: 'texto' | 'numero' | 'booleano' | 'seleccion' | 'fecha'
  requerido?: boolean
  ayuda?: string
}

export function FormularioCatalogo({
  clave,
  id,
  singular,
  campos,
  opciones,
  inicial,
}: {
  clave: string
  id: string | null
  singular: string
  campos: CampoVisible[]
  opciones: Record<string, { valor: string; texto: string }[]>
  inicial: Record<string, string | boolean | null>
}) {
  const [estado, accion, enviando] = useActionState(guardarCatalogoAccion.bind(null, clave, id), undefined)
  const formulario = useRef<HTMLFormElement>(null)
  const valor = (c: string) => {
    const v = estado?.valores?.[c] ?? inicial[c]
    return v === null || v === undefined || typeof v === 'boolean' ? '' : String(v)
  }
  const marcado = (c: string) => (estado?.valores ? c in estado.valores : inicial[c] === true)

  return (
    <form
      ref={formulario}
      action={accion}
      noValidate
      onKeyDown={(ev) => {
        if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
          ev.preventDefault()
          formulario.current?.requestSubmit()
        }
      }}
      className="flex flex-col gap-4"
    >
      <h2 className="text-sm font-semibold">{id ? `Modificar ${singular}` : `Nuevo ${singular}`}</h2>
      {estado?.mensaje && <Aviso>{estado.mensaje}</Aviso>}
      <div className="grid gap-4 sm:grid-cols-2">
        {campos.map((c, i) =>
          c.tipo === 'booleano' ? (
            <label key={c.nombre} className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name={c.nombre}
                defaultChecked={marcado(c.nombre)}
                className="size-4 accent-[var(--acento)]"
              />
              {c.etiqueta}
            </label>
          ) : c.tipo === 'seleccion' ? (
            <Selector
              key={c.nombre}
              id={c.nombre}
              name={c.nombre}
              etiqueta={c.etiqueta}
              opciones={opciones[c.nombre] ?? []}
              vacio={c.requerido ? undefined : 'Ninguno'}
              defaultValue={valor(c.nombre)}
              error={estado?.errores?.[c.nombre]}
            />
          ) : (
            <Campo
              key={c.nombre}
              id={c.nombre}
              name={c.nombre}
              etiqueta={c.etiqueta}
              type={c.tipo === 'fecha' ? 'date' : 'text'}
              inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
              className={c.tipo === 'numero' ? 'cifras' : undefined}
              defaultValue={valor(c.nombre)}
              ayuda={c.ayuda}
              error={estado?.errores?.[c.nombre]}
              required={c.requerido}
              autoFocus={i === 0}
            />
          ),
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <BotonEnlace href={`/configuracion/${clave}`} variante="fantasma">
          Cancelar
        </BotonEnlace>
        <Boton type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Grabando…' : id ? 'Grabar cambios' : 'Dar de alta'}
        </Boton>
      </div>
    </form>
  )
}
