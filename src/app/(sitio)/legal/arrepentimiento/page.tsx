import type { Metadata } from 'next'

import { TextoLegal } from '@/components/sitio/Legal'

import { FormularioContacto } from '../../contacto/Formulario'

export const metadata: Metadata = {
  title: 'Botón de arrepentimiento',
  description: 'Revocá la contratación del servicio dentro de los 10 días.',
  alternates: { canonical: '/legal/arrepentimiento' },
}

export default function Arrepentimiento() {
  return (
    <TextoLegal titulo="Botón de arrepentimiento" actualizado="3 de octubre de 2026">
      <p>
        Si contrataste el servicio como consumidor, tenés 10 días corridos desde la contratación para revocarla sin costo ni
        responsabilidad (artículo 34 de la Ley 24.240 y Resolución 424/2020). Completá el formulario indicando el email de la
        cuenta y el CUIT de la empresa: te confirmamos la baja y, si hubo un pago, el reintegro, con un código de identificación
        del trámite.
      </p>
      <div className="mt-8">
        <FormularioContacto origen="arrepentimiento" />
      </div>
    </TextoLegal>
  )
}
