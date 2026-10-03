'use client'

import { ChevronDown, Lock } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { planQueIncluye } from '@/lib/planes'

import { AYUDA, COLOR_APP, CONFIGURACION, rutaActiva, type Seccion, seccionesDe, seccionesVisibles } from './menu'

const CLAVE_CERRADAS = 'erp:menu-cerradas'

/**
 * Menú lateral. Muestra solo lo que cada persona puede usar: lo que su rol no
 * permite no aparece, y lo que el plan no incluye se ve con candado solo para
 * quien administra la suscripción (al resto no le sirve). Las secciones se
 * pliegan y el navegador recuerda cuáles cerró cada uno.
 */
export function Navegacion({ funciones, permisos }: { funciones: string[]; permisos: string[] }) {
  const ruta = usePathname()
  const todas = seccionesDe(funciones)
  const secciones = seccionesVisibles(funciones, permisos)
  const activa = rutaActiva(ruta, secciones)

  const [cerradas, setCerradas] = useState<string[] | null>(null)
  useEffect(() => {
    let guardadas: string[] | null = null
    try {
      guardadas = JSON.parse(localStorage.getItem(CLAVE_CERRADAS) ?? 'null')
    } catch {
      // Sin almacenamiento (modo privado): se usan las de fábrica.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se lee lo guardado una vez, en el navegador
    setCerradas(Array.isArray(guardadas) ? guardadas : todas.filter((s) => s.cerrada).map((s) => s.titulo!))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const estaCerrada = (s: Seccion) => {
    if (!s.titulo) return false
    // La sección de la pantalla actual siempre se ve abierta.
    if (s.items.some((i) => i.href === activa)) return false
    return (cerradas ?? todas.filter((x) => x.cerrada).map((x) => x.titulo!)).includes(s.titulo)
  }
  const alternar = (titulo: string) => {
    const base = cerradas ?? todas.filter((x) => x.cerrada).map((x) => x.titulo!)
    const nuevas = base.includes(titulo) ? base.filter((t) => t !== titulo) : [...base, titulo]
    setCerradas(nuevas)
    try {
      localStorage.setItem(CLAVE_CERRADAS, JSON.stringify(nuevas))
    } catch {
      // Sin almacenamiento: queda solo en esta pestaña.
    }
  }

  const claseItem = (activo: boolean) =>
    `group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors ${
      activo
        ? 'bg-superficie font-semibold text-texto shadow-[0_1px_0_var(--tarjeta-borde-abajo),0_0_0_1px_var(--tarjeta-borde)]'
        : 'font-medium text-texto-2 hover:bg-texto/[0.05] hover:text-texto'
    }`

  return (
    <nav aria-label="Secciones" className="flex flex-1 flex-col gap-4">
      {secciones.map((s, i) => {
        const cerrada = estaCerrada(s)
        const IconoSeccion = s.icono
        return (
          <div key={s.titulo ?? i} className="flex flex-col gap-px">
            {s.titulo && (
              <button
                type="button"
                onClick={() => alternar(s.titulo!)}
                aria-expanded={!cerrada}
                className="group mb-0.5 flex h-7 items-center gap-2 rounded-md px-2 text-xs font-semibold text-texto-2 hover:bg-texto/[0.05] hover:text-texto"
              >
                {IconoSeccion && s.app && (
                  <span aria-hidden className={`grid size-5 place-items-center rounded-[5px] ${COLOR_APP[s.app]}`}>
                    <IconoSeccion className="size-3" strokeWidth={2.4} />
                  </span>
                )}
                <span className="flex-1 text-left">{s.titulo}</span>
                <ChevronDown
                  aria-hidden
                  className={`size-3.5 text-texto-3 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 ${cerrada ? '-rotate-90 opacity-100' : ''}`}
                />
              </button>
            )}
            {!cerrada &&
              s.items.map((item) => {
                const activo = item.href === activa
                const Icono = item.icono
                if (item.funcion && !funciones.includes(item.funcion)) {
                  const plan = planQueIncluye(item.funcion)
                  return (
                    <Link
                      key={item.href}
                      href={`/configuracion/suscripcion?funcion=${item.funcion}`}
                      className="flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] text-texto-3 hover:bg-texto/[0.05]"
                      title={`Incluido desde el plan ${plan?.nombre}`}
                    >
                      <Icono aria-hidden className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item.texto}</span>
                      <Lock aria-hidden className="size-3.5 shrink-0" />
                    </Link>
                  )
                }
                return (
                  <Link key={item.href} href={item.href} aria-current={activo ? 'page' : undefined} className={claseItem(activo)}>
                    <Icono
                      aria-hidden
                      className={`size-4 shrink-0 ${activo ? 'text-acento' : 'text-texto-3 group-hover:text-texto-2'}`}
                    />
                    <span className="truncate">{item.texto}</span>
                  </Link>
                )
              })}
          </div>
        )
      })}
      <div className="mt-auto border-t border-texto/10 pt-3">
        <Link
          href={AYUDA.href}
          aria-current={ruta.startsWith(AYUDA.href) ? 'page' : undefined}
          className={claseItem(ruta.startsWith(AYUDA.href))}
        >
          <AYUDA.icono
            aria-hidden
            className={`size-4 shrink-0 ${ruta.startsWith(AYUDA.href) ? 'text-acento' : 'text-texto-3'}`}
          />
          {AYUDA.texto}
        </Link>
        <Link
          href={CONFIGURACION.href}
          aria-current={ruta.startsWith(CONFIGURACION.href) ? 'page' : undefined}
          className={claseItem(ruta.startsWith(CONFIGURACION.href))}
        >
          <CONFIGURACION.icono
            aria-hidden
            className={`size-4 shrink-0 ${ruta.startsWith(CONFIGURACION.href) ? 'text-acento' : 'text-texto-3'}`}
          />
          {CONFIGURACION.texto}
        </Link>
      </div>
    </nav>
  )
}
