import { Mail, MessageCircle } from 'lucide-react'
import type { Metadata } from 'next'

import { Contenedor, Rotulo } from '@/components/sitio/Bloques'
import { contacto } from '@/lib/marca'

import { FormularioContacto } from './Formulario'

export const metadata: Metadata = {
  title: 'Contacto: hablá con un asesor',
  description:
    'Contanos cómo trabaja tu empresa y te mostramos cómo Vektra ERP resuelve la facturación, el stock y la gestión de tu pyme.',
  alternates: { canonical: '/contacto' },
}

export default function Contacto() {
  const c = contacto()
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="fondo-sitio pointer-events-none absolute inset-0" />
      <Contenedor className="relative grid gap-10 py-16 sm:py-20 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-4">
          <Rotulo>Contacto</Rotulo>
          <h1 className="text-4xl font-semibold tracking-tight text-balance">Hablemos de tu empresa</h1>
          <p className="text-lg text-texto-2">
            Te mostramos el sistema con ejemplos de tu rubro, te ayudamos a migrar los datos y te armamos el plan que te conviene.
          </p>
          <ul className="mt-2 flex flex-col gap-3 text-texto-2">
            {c.whatsapp && (
              <li>
                <a href={`https://wa.me/${c.whatsapp}`} className="flex items-center gap-2 hover:text-texto" rel="noopener">
                  <MessageCircle aria-hidden className="size-5 text-acento" /> Escribinos por WhatsApp
                </a>
              </li>
            )}
            {c.email && (
              <li>
                <a href={`mailto:${c.email}`} className="flex items-center gap-2 hover:text-texto">
                  <Mail aria-hidden className="size-5 text-acento" /> {c.email}
                </a>
              </li>
            )}
          </ul>
        </div>
        <FormularioContacto origen="/contacto" />
      </Contenedor>
    </section>
  )
}
