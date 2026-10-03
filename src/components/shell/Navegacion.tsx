'use client'

import {
  Banknote,
  BellRing,
  BookOpen,
  BookOpenCheck,
  Calculator,
  ChevronDown,
  Boxes,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  ChartColumn,
  ChartPie,
  ClipboardList,
  Clock,
  FileInput,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Gauge,
  HandCoins,
  Inbox,
  Landmark,
  LayoutDashboard,
  Map,
  ListChecks,
  ListTree,
  Lock,
  type LucideIcon,
  MapPinned,
  Network,
  Package,
  Percent,
  Printer,
  Receipt,
  ReceiptText,
  RefreshCw,
  Scale,
  Scissors,
  Settings,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Truck,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { tienePermiso } from '@/lib/permisos'
import { planQueIncluye, type Funcion } from '@/lib/planes'

type Item = {
  href: string
  texto: string
  icono: LucideIcon
  funcion?: Funcion
  /** Permiso para ver la pantalla: sin él, el ítem no aparece. */
  permiso?: string
}

const SECCIONES: { titulo?: string; items: Item[] }[] = [
  { items: [{ href: '/', texto: 'Inicio', icono: LayoutDashboard }] },
  {
    titulo: 'Maestros',
    items: [
      { href: '/terceros', permiso: 'maestros.ver', texto: 'Clientes y proveedores', icono: Users },
      { href: '/articulos', permiso: 'maestros.ver', texto: 'Artículos y precios', icono: Package },
    ],
  },
  {
    titulo: 'Operación',
    items: [
      { href: '/presupuestos', permiso: 'ventas.ver', texto: 'Presupuestos', icono: FileText, funcion: 'comercial' },
      { href: '/pedidos', permiso: 'ventas.ver', texto: 'Pedidos', icono: ClipboardList, funcion: 'comercial' },
      { href: '/remitos', permiso: 'ventas.ver', texto: 'Remitos', icono: Truck, funcion: 'comercial' },
      { href: '/stock', permiso: 'stock.ver', texto: 'Stock', icono: Boxes, funcion: 'stock' },
      { href: '/tiendas', permiso: 'tienda.ver', texto: 'Tiendas online', icono: ShoppingBag, funcion: 'tienda' },
    ],
  },
  {
    titulo: 'Facturación',
    items: [
      { href: '/facturas', permiso: 'ventas.ver', texto: 'Facturas y notas', icono: Receipt, funcion: 'facturacion' },
      { href: '/cobranzas', permiso: 'ventas.ver', texto: 'Cobranzas', icono: Wallet, funcion: 'facturacion' },
      { href: '/cuentas', permiso: 'ventas.ver', texto: 'Cuentas corrientes', icono: BookOpen, funcion: 'facturacion' },
    ],
  },
  {
    titulo: 'Compras',
    items: [
      { href: '/ordenes-compra', permiso: 'compras.ver', texto: 'Órdenes de compra', icono: ShoppingCart, funcion: 'compras' },
      { href: '/compras', permiso: 'compras.ver', texto: 'Comprobantes de compra', icono: FileInput, funcion: 'compras' },
      { href: '/pagos', permiso: 'compras.ver', texto: 'Pagos a proveedores', icono: HandCoins, funcion: 'compras' },
      { href: '/cuentas-proveedores', permiso: 'compras.ver', texto: 'Cuentas de proveedores', icono: Scale, funcion: 'compras' },
    ],
  },
  {
    titulo: 'Tesorería',
    items: [
      { href: '/tesoreria', permiso: 'tesoreria.ver', texto: 'Cajas y bancos', icono: Landmark, funcion: 'tesoreria' },
      { href: '/tesoreria/cheques', permiso: 'tesoreria.ver', texto: 'Cheques', icono: Banknote, funcion: 'tesoreria' },
    ],
  },
  {
    titulo: 'Impuestos e informes',
    items: [
      { href: '/impuestos/iva', permiso: 'impuestos.libros', texto: 'IVA', icono: FileSpreadsheet, funcion: 'informes' },
      { href: '/impuestos/iibb', permiso: 'impuestos.libros', texto: 'Ingresos Brutos', icono: Percent, funcion: 'informes' },
      { href: '/impuestos/retenciones', permiso: 'impuestos.libros', texto: 'Retenciones', icono: Scissors, funcion: 'informes' },
      {
        href: '/impuestos/vencimientos',
        permiso: 'impuestos.libros',
        texto: 'Vencimientos',
        icono: CalendarClock,
        funcion: 'informes',
      },
      { href: '/informes', permiso: 'informes.ver', texto: 'Informes de gestión', icono: ChartPie, funcion: 'informes' },
    ],
  },
  {
    titulo: 'Contabilidad',
    items: [
      { href: '/contabilidad', permiso: 'contabilidad.ver', texto: 'Contabilidad', icono: Calculator, funcion: 'informes' },
      { href: '/contabilidad/asientos', permiso: 'contabilidad.ver', texto: 'Asientos', icono: ListTree, funcion: 'informes' },
      {
        href: '/contabilidad/libros',
        permiso: 'contabilidad.ver',
        texto: 'Libros y balances',
        icono: BookOpenCheck,
        funcion: 'informes',
      },
      { href: '/contabilidad/plan', permiso: 'contabilidad.ver', texto: 'Plan de cuentas', icono: Network, funcion: 'informes' },
    ],
  },
]

const CONTRATOS: { titulo: string; items: Item[] } = {
  titulo: 'Contratos',
  items: [
    { href: '/contratos', permiso: 'contratos.ver', texto: 'Contratos', icono: FileSignature },
    { href: '/equipos', permiso: 'contratos.ver', texto: 'Equipos', icono: Printer },
    { href: '/contratos/lecturas', permiso: 'contratos.lecturas', texto: 'Lecturas', icono: Gauge },
    { href: '/contratos/facturar', permiso: 'contratos.facturar', texto: 'Facturar el mes', icono: ReceiptText },
  ],
}

const SERVICIO: { titulo: string; items: Item[] } = {
  titulo: 'Servicio técnico',
  items: [
    { href: '/servicio', permiso: 'servicio.ver', texto: 'Órdenes', icono: Wrench },
    { href: '/servicio/calendario', permiso: 'servicio.ver', texto: 'Calendario', icono: CalendarDays },
    { href: '/servicio/mapa', permiso: 'servicio.ver', texto: 'Mapa y rutas', icono: MapPinned },
    { href: '/servicio/bandeja', permiso: 'servicio.cargar', texto: 'Bandeja de entrada', icono: Inbox },
    { href: '/tecnico', permiso: 'servicio.trabajar', texto: 'Mi agenda', icono: Smartphone },
    { href: '/servicio/preventivos', permiso: 'servicio.ver', texto: 'Preventivos', icono: RefreshCw },
    { href: '/servicio/tablero', permiso: 'servicio.ver', texto: 'Tablero', icono: ChartColumn },
  ],
}

/** Lo que se toca de vez en cuando: arranca cerrado. */
const SERVICIO_AJUSTES: { titulo: string; items: Item[]; cerrada: boolean } = {
  titulo: 'Servicio: ajustes',
  cerrada: true,
  items: [
    { href: '/servicio/jornadas', permiso: 'servicio.cargar', texto: 'Jornadas', icono: Clock },
    { href: '/servicio/formularios', permiso: 'servicio.cargar', texto: 'Formularios', icono: ClipboardList },
    { href: '/servicio/recordatorios', permiso: 'servicio.ver', texto: 'Recordatorios', icono: BellRing },
    { href: '/servicio/licencias', permiso: 'servicio.ver', texto: 'Licencias y feriados', icono: CalendarOff },
    { href: '/servicio/zonas', permiso: 'servicio.configurar', texto: 'Zonas de trabajo', icono: Map },
    { href: '/servicio/tipos', permiso: 'servicio.ver', texto: 'Tipos de orden', icono: ListChecks },
    { href: '/servicio/configuracion', permiso: 'servicio.configurar', texto: 'Configuración', icono: Settings2 },
  ],
}

/** Activo: la ruta más larga del menú que coincide (así "Contratos" no se marca en "Lecturas"). */
function rutaActiva(ruta: string, secciones: { items: Item[] }[]): string | undefined {
  return secciones
    .flatMap((s) => s.items.map((i) => i.href))
    .filter((h) => (h === '/' ? ruta === '/' : ruta === h || ruta.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0]
}

type Seccion = { titulo?: string; items: Item[]; cerrada?: boolean }

const CLAVE_CERRADAS = 'erp:menu-cerradas'

/**
 * Menú lateral. Muestra solo lo que cada persona puede usar: lo que su rol no
 * permite no aparece, y lo que el plan no incluye se ve con candado solo para
 * quien administra la suscripción (al resto no le sirve). Las secciones se
 * pliegan y el navegador recuerda cuáles cerró cada uno.
 */
export function Navegacion({ funciones, permisos }: { funciones: string[]; permisos: string[] }) {
  const ruta = usePathname()
  const conContratos = funciones.includes('contratos')
  const todas: Seccion[] = conContratos
    ? [...SECCIONES.slice(0, -1), CONTRATOS, SERVICIO, SERVICIO_AJUSTES, SECCIONES[SECCIONES.length - 1]]
    : SECCIONES
  const veSuscripcion = tienePermiso(permisos, 'empresa.suscripcion')
  const secciones = todas
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => {
        if (i.funcion && !funciones.includes(i.funcion)) return veSuscripcion
        return !i.permiso || tienePermiso(permisos, i.permiso)
      }),
    }))
    .filter((s) => s.items.length)
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

  return (
    <nav aria-label="Secciones" className="flex flex-col gap-3">
      {secciones.map((s, i) => {
        const cerrada = estaCerrada(s)
        return (
          <div key={s.titulo ?? i} className="flex flex-col gap-0.5">
            {s.titulo && (
              <button
                type="button"
                onClick={() => alternar(s.titulo!)}
                aria-expanded={!cerrada}
                className="flex items-center justify-between rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wider text-texto-3 uppercase hover:text-texto-2"
              >
                {s.titulo}
                <ChevronDown aria-hidden className={`size-3.5 transition-transform ${cerrada ? '-rotate-90' : ''}`} />
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
                      className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-texto-3 hover:bg-superficie-2"
                      title={`Incluido desde el plan ${plan?.nombre}`}
                    >
                      <Icono aria-hidden className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item.texto}</span>
                      <Lock aria-hidden className="size-3.5 shrink-0" />
                    </Link>
                  )
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={activo ? 'page' : undefined}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                      activo ? 'bg-acento-suave text-acento' : 'text-texto-2 hover:bg-superficie-2 hover:text-texto'
                    }`}
                  >
                    <Icono aria-hidden className="size-4 shrink-0" />
                    <span className="truncate">{item.texto}</span>
                  </Link>
                )
              })}
          </div>
        )
      })}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-borde pt-3">
        <Link
          href="/configuracion"
          aria-current={ruta.startsWith('/configuracion') ? 'page' : undefined}
          className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 font-medium transition-colors ${
            ruta.startsWith('/configuracion')
              ? 'bg-acento-suave text-acento'
              : 'text-texto-2 hover:bg-superficie-2 hover:text-texto'
          }`}
        >
          <Settings aria-hidden className="size-4" />
          Configuración
        </Link>
      </div>
    </nav>
  )
}
