'use client'

import type { ComponentProps } from 'react'

import { Boton } from './ui'

/** Botón de envío que pide confirmación antes (para anular y otras acciones sin vuelta atrás). */
export function BotonConfirmar({ pregunta, ...props }: ComponentProps<typeof Boton> & { pregunta: string }) {
  return (
    <Boton
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(pregunta)) e.preventDefault()
      }}
    />
  )
}
