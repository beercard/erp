'use client'

import { Trash2 } from 'lucide-react'
import { useActionState, useState, useTransition } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { borrarGrupoAccion, gruposUsuarioAccion, guardarGrupoAccion } from './acciones'

export function NuevoGrupo() {
  const [estado, accion, enviando] = useActionState(guardarGrupoAccion, undefined)
  return (
    <form action={accion} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-texto-2">Nombre del grupo</span>
        <input
          name="nombre"
          required
          placeholder="Córdoba, Cuentas grandes, Zona norte…"
          className="h-9 w-72 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2 text-sm focus:border-acento"
        />
      </label>
      <Boton type="submit" variante="primario" disabled={enviando}>
        Agregar
      </Boton>
      <div className="basis-full">
        {estado?.error && <Aviso>{estado.error}</Aviso>}
        {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      </div>
    </form>
  )
}

export function BorrarGrupo({ id, nombre, clientes }: { id: string; nombre: string; clientes: number }) {
  const [borrando, iniciar] = useTransition()
  const [error, setError] = useState('')
  return (
    <>
      <button
        type="button"
        title={`Borrar ${nombre}`}
        aria-label={`Borrar ${nombre}`}
        disabled={borrando}
        onClick={() => {
          const aviso = clientes
            ? `¿Borrar el grupo ${nombre}? Sus ${clientes} clientes quedan sin grupo y solo los ven los usuarios sin grupos.`
            : `¿Borrar el grupo ${nombre}?`
          if (!window.confirm(aviso)) return
          iniciar(async () => {
            const r = await borrarGrupoAccion(id)
            if (!r.ok) setError(r.error)
          })
        }}
        className="text-texto-3 hover:text-error"
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
      {error && <span className="text-xs text-error">{error}</span>}
    </>
  )
}

export function GruposDelUsuario({
  usuarioId,
  grupos,
  elegidos,
}: {
  usuarioId: string
  grupos: { id: string; nombre: string }[]
  elegidos: string[]
}) {
  const [estado, accion, enviando] = useActionState(gruposUsuarioAccion.bind(null, usuarioId), undefined)
  return (
    <form action={accion} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {grupos.map((g) => (
        <label key={g.id} className="flex items-center gap-1">
          <input type="checkbox" name="grupo" value={g.id} defaultChecked={elegidos.includes(g.id)} /> {g.nombre}
        </label>
      ))}
      <Boton type="submit" disabled={enviando} className="h-8 px-2 text-xs">
        Guardar
      </Boton>
      {estado?.error && <span className="text-xs text-error">{estado.error}</span>}
      {estado?.ok && <span className="text-xs text-ok">{estado.ok}</span>}
    </form>
  )
}
