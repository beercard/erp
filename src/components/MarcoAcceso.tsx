import { Check } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { Logo } from '@/components/sitio/Logo'
import { MARCA } from '@/lib/marca'

const PUNTOS = [
  'Factura electrónica con CAE de ARCA, en segundos',
  'Stock, cuentas corrientes y cobranzas siempre al día',
  'Compras, bancos, cheques e impuestos sin planillas aparte',
  'Servicio técnico y tiendas online conectados al mismo sistema',
]

/**
 * Marco de las pantallas de acceso (ingreso, registro, recuperar la clave,
 * invitaciones): el formulario a la izquierda y la marca a la derecha en
 * pantallas grandes; en el celular, solo el formulario.
 */
export function MarcoAcceso({
  children,
  ancho = 'sm',
  conLogo = true,
}: {
  children: ReactNode
  ancho?: 'sm' | 'md'
  conLogo?: boolean
}) {
  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <main className="flex flex-col px-5 py-8 sm:px-10">
        {conLogo && (
          <Link href="/" className="inline-flex self-start" aria-label={`${MARCA.producto}, inicio`}>
            <Logo />
          </Link>
        )}
        <div className={`m-auto w-full py-10 ${ancho === 'md' ? 'max-w-md' : 'max-w-sm'}`}>{children}</div>
        <p className="text-center text-xs text-texto-3 lg:text-left">
          © {MARCA.empresa} ·{' '}
          <Link href="/legal/privacidad" className="hover:text-texto-2 hover:underline">
            Privacidad
          </Link>{' '}
          ·{' '}
          <Link href="/legal/terminos" className="hover:text-texto-2 hover:underline">
            Términos
          </Link>
        </p>
      </main>
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-marca to-marca-2 text-white lg:flex lg:flex-col lg:justify-center lg:px-14 xl:px-20">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 [background-image:radial-gradient(60%_50%_at_80%_10%,rgb(255_255_255/0.35),transparent_70%),radial-gradient(50%_40%_at_10%_90%,rgb(0_0_0/0.3),transparent_70%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
        />
        <div className="relative max-w-lg">
          <p className="text-sm font-medium opacity-80">{MARCA.producto}</p>
          <p className="mt-3 text-3xl leading-tight font-semibold tracking-tight text-balance xl:text-4xl">{MARCA.lema}.</p>
          <ul className="mt-8 flex flex-col gap-3.5">
            {PUNTOS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-[15px]">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/15 ring-1 ring-white/25">
                  <Check aria-hidden className="size-3" strokeWidth={3} />
                </span>
                <span className="opacity-90">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
