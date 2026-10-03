'use client'

import { useActionState } from 'react'

import { Aviso, Boton } from '@/components/ui'

import type { EstadoAdmin } from './acciones'

/** Resultado de una acción, debajo de su botón. */
export function Resultado({ estado }: { estado: EstadoAdmin }) {
  if (estado?.error) return <Aviso>{estado.error}</Aviso>
  if (estado?.ok) return <Aviso tono="ok">{estado.ok}</Aviso>
  return null
}

/**
 * Un botón que ejecuta una acción de la consola (ya atada a su empresa o
 * usuario) con confirmación opcional, y muestra cómo salió.
 */
export function BotonAccion({
  accion,
  texto,
  pregunta,
  variante = 'secundario',
}: {
  accion: (estado: EstadoAdmin) => Promise<EstadoAdmin>
  texto: string
  pregunta?: string
  variante?: 'primario' | 'secundario' | 'peligro' | 'fantasma'
}) {
  const [estado, ejecutar, enviando] = useActionState(accion, undefined)
  return (
    <form action={ejecutar} className="flex flex-col gap-2">
      <Boton
        type="submit"
        variante={variante}
        disabled={enviando}
        className="h-8 px-3 text-xs"
        onClick={(e) => {
          if (pregunta && !window.confirm(pregunta)) e.preventDefault()
        }}
      >
        {texto}
      </Boton>
      <Resultado estado={estado} />
    </form>
  )
}

const control = 'h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-2.5 text-sm focus:border-acento'

export function FormularioExtenderPrueba({ accion }: { accion: (e: EstadoAdmin, f: FormData) => Promise<EstadoAdmin> }) {
  const [estado, ejecutar, enviando] = useActionState(accion, undefined)
  return (
    <form action={ejecutar} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Extender la prueba</span>
          <select name="dias" defaultValue="15" className={control}>
            {[7, 15, 30, 60].map((d) => (
              <option key={d} value={d}>
                {d} días
              </option>
            ))}
          </select>
        </label>
        <Boton type="submit" disabled={enviando}>
          Extender
        </Boton>
      </div>
      <Resultado estado={estado} />
    </form>
  )
}

export function FormularioNota({ accion }: { accion: (e: EstadoAdmin, f: FormData) => Promise<EstadoAdmin> }) {
  const [estado, ejecutar, enviando] = useActionState(accion, undefined)
  return (
    <form action={ejecutar} className="flex flex-col gap-2">
      <label className="sr-only" htmlFor="nota">
        Nota interna
      </label>
      <textarea
        id="nota"
        name="texto"
        rows={3}
        maxLength={2000}
        placeholder="Llamadas, acuerdos de precio, pedidos especiales… Solo la ve la plataforma."
        className="rounded-lg border border-borde-fuerte/80 bg-superficie px-3 py-2 text-sm focus:border-acento"
      />
      <div>
        <Boton type="submit" disabled={enviando}>
          Guardar nota
        </Boton>
      </div>
      <Resultado estado={estado} />
    </form>
  )
}
