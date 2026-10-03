import type { Metadata } from 'next'

import { Encabezado } from '@/components/sitio/Encabezado'
import { JsonLd } from '@/components/sitio/JsonLd'
import { Pie } from '@/components/sitio/Pie'
import { MARCA, URL_SITIO } from '@/lib/marca'

/** El sitio comercial sí se indexa (el resto del sistema no: ver el layout raíz). */
export const metadata: Metadata = {
  robots: { index: true, follow: true },
  openGraph: { siteName: MARCA.producto, locale: 'es_AR', type: 'website' },
  twitter: { card: 'summary_large_image' },
}

export default function LayoutSitio({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-fondo text-texto">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-superficie focus:px-3 focus:py-2"
      >
        Saltar al contenido
      </a>
      <JsonLd
        datos={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: MARCA.empresa,
          brand: MARCA.producto,
          url: URL_SITIO,
          logo: `${URL_SITIO}/icon.svg`,
          taxID: MARCA.cuit,
          address: { '@type': 'PostalAddress', addressCountry: 'AR' },
        }}
      />
      <Encabezado />
      <main id="contenido" className="flex-1">
        {children}
      </main>
      <Pie />
    </div>
  )
}
