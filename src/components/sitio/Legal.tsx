import type { ReactNode } from 'react'

import { Contenedor } from './Bloques'

/** Tipografía de los textos legales: legible, con secciones numeradas. */
export function TextoLegal({ titulo, actualizado, children }: { titulo: string; actualizado: string; children: ReactNode }) {
  return (
    <Contenedor className="py-16">
      <article className="mx-auto max-w-3xl [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:text-texto-2 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-texto-2">
        <h1 className="text-4xl font-semibold tracking-tight">{titulo}</h1>
        <p className="!mt-2 text-sm !text-texto-3">Última actualización: {actualizado}</p>
        {children}
      </article>
    </Contenedor>
  )
}
