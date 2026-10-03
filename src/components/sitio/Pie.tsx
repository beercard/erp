import Link from 'next/link'

import { contacto, MARCA } from '@/lib/marca'

import { Logo } from './Logo'
import { SOLUCIONES } from './soluciones'

export function Pie() {
  const c = contacto()
  return (
    <footer className="border-t border-borde bg-superficie">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="text-sm text-texto-2">
            Sistema de gestión en la nube para pymes argentinas: facturación electrónica, stock, compras, bancos, impuestos y
            tiendas online.
          </p>
        </div>
        <nav aria-label="Producto" className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Producto</span>
          <Link href="/funciones" className="text-texto-2 hover:text-texto">
            Funciones
          </Link>
          <Link href="/integraciones" className="text-texto-2 hover:text-texto">
            Integraciones
          </Link>
          <Link href="/precios" className="text-texto-2 hover:text-texto">
            Planes y precios
          </Link>
          <Link href="/registro" className="text-texto-2 hover:text-texto">
            Prueba gratis
          </Link>
        </nav>
        <nav aria-label="Soluciones" className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Soluciones</span>
          {SOLUCIONES.map((s) => (
            <Link key={s.slug} href={`/soluciones/${s.slug}`} className="text-texto-2 hover:text-texto">
              {s.menu}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Empresa</span>
          <Link href="/contacto" className="text-texto-2 hover:text-texto">
            Contacto
          </Link>
          {c.email && (
            <a href={`mailto:${c.email}`} className="text-texto-2 hover:text-texto">
              {c.email}
            </a>
          )}
          <Link href="/legal/terminos" className="text-texto-2 hover:text-texto">
            Términos y condiciones
          </Link>
          <Link href="/legal/privacidad" className="text-texto-2 hover:text-texto">
            Política de privacidad
          </Link>
          <Link href="/legal/arrepentimiento" className="text-texto-2 hover:text-texto">
            Botón de arrepentimiento
          </Link>
        </div>
      </div>
      <div className="border-t border-borde">
        <p className="mx-auto w-full max-w-6xl px-4 py-5 text-xs text-texto-3 sm:px-6">
          © {new Date().getFullYear()} {MARCA.empresa} · CUIT {MARCA.cuit} · {MARCA.pais}
        </p>
      </div>
    </footer>
  )
}
