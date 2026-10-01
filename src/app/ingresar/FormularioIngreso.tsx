'use client'

import { useActionState } from 'react'

import { Aviso, Boton, Campo } from '@/components/ui'

import { ingresar } from './acciones'

export function FormularioIngreso({ volver }: { volver?: string }) {
  const [estado, accion, enviando] = useActionState(ingresar, undefined)
  return (
    <form action={accion} className="flex flex-col gap-4">
      {volver && <input type="hidden" name="volver" value={volver} />}
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Campo
        id="email"
        name="email"
        type="email"
        etiqueta="Email"
        autoComplete="username"
        defaultValue={estado?.email}
        required
        autoFocus
      />
      <Campo id="clave" name="clave" type="password" etiqueta="Contraseña" autoComplete="current-password" required />
      <Boton type="submit" variante="primario" disabled={enviando} className="mt-1 h-10">
        {enviando ? 'Ingresando…' : 'Ingresar'}
      </Boton>
    </form>
  )
}
