import type { Metadata } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'

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

export const metadata: Metadata = {
  title: { default: 'ERP', template: '%s · ERP' },
  description: 'Gestión comercial, facturación electrónica y tesorería en la nube.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-AR" className={`${plex.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
