/** Datos estructurados (schema.org) para los buscadores. */
export function JsonLd({ datos }: { datos: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify no escapa "<": se reemplaza para que un texto no pueda cerrar el script.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(datos).replace(/</g, '\\u003c') }}
    />
  )
}
