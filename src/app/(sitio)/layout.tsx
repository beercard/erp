import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import type { CSSProperties } from 'react'

import { Encabezado } from '@/components/sitio/Encabezado'
import { JsonLd } from '@/components/sitio/JsonLd'
import { Pie } from '@/components/sitio/Pie'
import { MARCA, URL_SITIO } from '@/lib/marca'

const geist = Geist({ subsets: ['latin'], variable: '--fuente-geist', display: 'swap' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--fuente-geist-mono', display: 'swap' })

/** El sitio usa Geist (más expresiva para titulares); el sistema sigue con Inter. */
const FUENTES = { '--fuente-ui': 'var(--fuente-geist)', '--fuente-mono': 'var(--fuente-geist-mono)' } as CSSProperties

/** El sitio comercial sí se indexa (el resto del sistema no: ver el layout raíz). */
export const metadata: Metadata = {
  robots: { index: true, follow: true },
  openGraph: { siteName: MARCA.producto, locale: 'es_AR', type: 'website' },
  twitter: { card: 'summary_large_image' },
}

export default function LayoutSitio({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={FUENTES}
      className={`${geist.variable} ${geistMono.variable} flex min-h-dvh flex-col bg-fondo-sitio font-sans text-texto`}
    >
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
