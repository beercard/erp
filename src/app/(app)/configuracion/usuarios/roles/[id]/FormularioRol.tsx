'use client'

import { useActionState } from 'react'

import { Aviso, Boton, BotonEnlace, Campo, Panel } from '@/components/ui'
import type { MODULOS_PERMISOS } from '@/lib/permisos'

import { guardarRolAccion } from '../../acciones'

export function FormularioRol({
  id,
  nombre,
  descripcion,
  permisos,
  modulos,
}: {
  id: string | null
  nombre: string
  descripcion: string
  permisos: string[]
  modulos: typeof MODULOS_PERMISOS
}) {
  const [estado, accion, enviando] = useActionState(guardarRolAccion.bind(null, id), undefined)
  return (
    <form action={accion} className="flex flex-col gap-4">
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Panel className="grid gap-4 p-4 sm:grid-cols-2">
        <Campo id="nombre" name="nombre" etiqueta="Nombre" defaultValue={nombre} required autoFocus />
        <Campo id="descripcion" name="descripcion" etiqueta="Descripción" defaultValue={descripcion} />
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        {modulos.map((m) => (
          <Panel key={m.modulo}>
            <fieldset>
              <legend className="w-full border-b border-borde px-4 py-3 text-sm font-semibold">{m.titulo}</legend>
              <div className="flex flex-col gap-2 p-4">
                {Object.entries(m.permisos).map(([clave, texto]) => (
                  <label key={clave} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="permisos"
                      value={clave}
                      defaultChecked={permisos.includes(clave)}
                      className="mt-0.5 size-4 shrink-0 accent-[var(--acento)]"
                    />
                    <span>{texto}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </Panel>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <BotonEnlace href="/configuracion/usuarios" variante="fantasma">
          Cancelar
        </BotonEnlace>
        <Boton type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Grabando…' : 'Grabar rol'}
        </Boton>
      </div>
    </form>
  )
}
