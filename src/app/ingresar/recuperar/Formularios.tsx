'use client'

import { useActionState } from 'react'

import { Antibots } from '@/components/Antibots'
import { Aviso, Boton, Campo } from '@/components/ui'

import { cambiarAccion, pedirAccion } from './acciones'

export function PedirEnlace() {
  const [estado, accion, enviando] = useActionState(pedirAccion, undefined)
  if (estado?.ok) return <Aviso tono="ok">{estado.ok}</Aviso>
  return (
    <form action={accion} className="flex flex-col gap-4">
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Campo id="email" name="email" type="email" etiqueta="Email de tu cuenta" autoComplete="username" required autoFocus />
      <Antibots intento={estado} />
      <Boton type="submit" variante="primario" disabled={enviando} className="h-10">
        {enviando ? 'Enviando…' : 'Mandarme el enlace'}
      </Boton>
    </form>
  )
}

export function ClaveNueva({ token }: { token: string }) {
  const [estado, accion, enviando] = useActionState(cambiarAccion.bind(null, token), undefined)
  return (
    <form action={accion} className="flex flex-col gap-4">
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Campo
        id="clave"
        name="clave"
        type="password"
        etiqueta="Contraseña nueva"
        ayuda="Al menos 10 caracteres, con letras y números."
        autoComplete="new-password"
        required
        autoFocus
      />
      <Campo id="repetir" name="repetir" type="password" etiqueta="Repetila" autoComplete="new-password" required />
      <Boton type="submit" variante="primario" disabled={enviando} className="h-10">
        {enviando ? 'Guardando…' : 'Guardar y entrar'}
      </Boton>
    </form>
  )
}
