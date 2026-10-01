'use client'

import { useActionState } from 'react'

import { Aviso, Boton, Campo } from '@/components/ui'

import { aceptarAccion } from './acciones'

export function FormularioAceptar({ token, existente }: { token: string; existente: boolean }) {
  const [estado, accion, enviando] = useActionState(aceptarAccion.bind(null, token), undefined)
  return (
    <form action={accion} className="flex flex-col gap-4">
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {!existente && <Campo id="nombre" name="nombre" etiqueta="Tu nombre y apellido" autoComplete="name" required autoFocus />}
      <Campo
        id="clave"
        name="clave"
        type="password"
        etiqueta={existente ? 'Tu contraseña' : 'Contraseña'}
        autoComplete={existente ? 'current-password' : 'new-password'}
        ayuda={existente ? undefined : 'Al menos 10 caracteres, con letras y números.'}
        required
        autoFocus={existente}
      />
      {!existente && (
        <Campo id="repetir" name="repetir" type="password" etiqueta="Repetí la contraseña" autoComplete="new-password" required />
      )}
      <Boton type="submit" variante="primario" disabled={enviando} className="h-10">
        {enviando ? 'Aceptando…' : 'Aceptar invitación'}
      </Boton>
    </form>
  )
}
