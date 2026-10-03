import type { Metadata } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'

import { MARCA, URL_SITIO } from '@/lib/marca'

import './globals.css'

const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--fuente-plex',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--fuente-plex-mono',
  display: 'swap',
})

// Por defecto nada se indexa: el sistema es privado. El sitio comercial
// ((sitio)/layout.tsx) y el registro lo habilitan para sus páginas.
export const metadata: Metadata = {
  metadataBase: new URL(URL_SITIO),
  title: { default: MARCA.producto, template: `%s · ${MARCA.producto}` },
  description:
    'Sistema de gestión en la nube para pymes argentinas: facturación electrónica, stock, compras, bancos e impuestos.',
  applicationName: MARCA.producto,
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-AR" className={`${plex.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
