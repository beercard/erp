import type { Metadata } from 'next'
import { IBM_Plex_Mono, Inter } from 'next/font/google'

import { MARCA, URL_SITIO } from '@/lib/marca'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--fuente-ui',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--fuente-mono',
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

const TEMA = `try{var t=localStorage.getItem('erp:tema');if(t==='claro'||t==='oscuro')document.documentElement.dataset.tema=t}catch(e){}`

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-AR" className={`${inter.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Antes de pintar: el tema que eligió la persona (claro u oscuro), sin parpadeo. */}
        <script dangerouslySetInnerHTML={{ __html: TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
