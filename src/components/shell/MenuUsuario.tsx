'use client'

import { Building2, Check, LogOut, Monitor, Moon, Server, Sun } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { salir } from '@/app/ingresar/acciones'

import { useFlotante } from './useFlotante'

type Tema = 'sistema' | 'claro' | 'oscuro'
const CLAVE_TEMA = 'erp:tema'

const TEMAS: { valor: Tema; texto: string; icono: typeof Sun }[] = [
  { valor: 'sistema', texto: 'Como el equipo', icono: Monitor },
  { valor: 'claro', texto: 'Claro', icono: Sun },
  { valor: 'oscuro', texto: 'Oscuro', icono: Moon },
]

function aplicarTema(t: Tema) {
  if (t === 'sistema') delete document.documentElement.dataset.tema
  else document.documentElement.dataset.tema = t
  try {
    if (t === 'sistema') localStorage.removeItem(CLAVE_TEMA)
    else localStorage.setItem(CLAVE_TEMA, t)
  } catch {
    // Sin almacenamiento: vale para esta pestaña.
  }
}

/** Menú de la persona: quién es, en qué empresa está, el tema de colores y la salida. */
export function MenuUsuario({
  nombre,
  email,
  rol,
  empresa,
  adminPlataforma,
}: {
  nombre: string
  email: string
  rol: string
  empresa: string
  adminPlataforma: boolean
}) {
  const { abierto, setAbierto, ref } = useFlotante<HTMLDivElement>()
  const ruta = usePathname()
  const [tema, setTema] = useState<Tema>('sistema')
  useEffect(() => setAbierto(false), [ruta, setAbierto])
  useEffect(() => {
    const t = document.documentElement.dataset.tema
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el tema guardado se lee en el navegador
    if (t === 'claro' || t === 'oscuro') setTema(t)
  }, [])

  const iniciales = nombre
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const opcion =
    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-texto-2 hover:bg-superficie-2 hover:text-texto'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-haspopup="true"
        title={`${nombre} · ${rol}`}
        className="grid size-9 place-items-center rounded-full p-0.5 hover:bg-superficie-2 aria-expanded:bg-superficie-2"
      >
        <span className="grid size-8 place-items-center rounded-full bg-acento text-xs font-semibold text-sobre-acento">
          {iniciales}
        </span>
        <span className="sr-only">Mi cuenta</span>
      </button>
      {abierto && (
        <div className="aparecer absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-borde bg-superficie p-1.5 shadow-flotante">
          <div className="flex items-center gap-3 px-2.5 pt-2 pb-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-acento text-sm font-semibold text-sobre-acento">
              {iniciales}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{nombre}</span>
              <span className="block truncate text-xs text-texto-2">{email}</span>
              <span className="mt-1 inline-block rounded bg-superficie-2 px-1.5 py-px text-[11px] font-medium text-texto-2 capitalize">
                {rol}
              </span>
            </span>
          </div>
          <div className="border-t border-borde py-1.5">
            <Link href="/empresas" className={opcion}>
              <Building2 aria-hidden className="size-4 text-texto-3" />
              <span className="min-w-0 flex-1 truncate">
                Cambiar de empresa
                <span className="block truncate text-xs text-texto-3">{empresa}</span>
              </span>
            </Link>
            {adminPlataforma && (
              <Link href="/plataforma" className={opcion}>
                <Server aria-hidden className="size-4 text-texto-3" />
                Administración de la plataforma
              </Link>
            )}
          </div>
          <div className="border-t border-borde px-2.5 py-2.5">
            <p id="tema-titulo" className="mb-2 text-xs font-medium text-texto-3">
              Colores
            </p>
            <div
              role="radiogroup"
              aria-labelledby="tema-titulo"
              className="grid grid-cols-3 gap-1 rounded-lg bg-superficie-2 p-1"
            >
              {TEMAS.map(({ valor, texto, icono: Icono }) => (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={tema === valor}
                  title={texto}
                  onClick={() => {
                    setTema(valor)
                    aplicarTema(valor)
                  }}
                  className="flex h-8 items-center justify-center gap-1.5 rounded-md text-xs text-texto-2 hover:text-texto aria-checked:bg-superficie aria-checked:font-medium aria-checked:text-texto aria-checked:shadow-suave"
                >
                  <Icono aria-hidden className="size-3.5" />
                  {valor === 'sistema' ? 'Auto' : texto}
                  {tema === valor && <Check aria-hidden className="sr-only" />}
                </button>
              ))}
            </div>
          </div>
          <form action={salir} className="border-t border-borde pt-1.5">
            <button type="submit" className={opcion}>
              <LogOut aria-hidden className="size-4 text-texto-3" />
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
