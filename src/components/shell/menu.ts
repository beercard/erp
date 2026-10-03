import {
  Banknote,
  BellRing,
  BookOpen,
  BookOpenCheck,
  Boxes,
  Calculator,
  CalendarCheck,
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
  Link2,
  ListChecks,
  ListTree,
  Map,
  MapPinned,
  MessageCircle,
  Network,
  Package,
  PackagePlus,
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
  Target,
  TicketCheck,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import { tienePermiso } from '@/lib/permisos'
import type { Funcion } from '@/lib/planes'

/**
 * El menú de la aplicación, compartido por el menú lateral, el lanzador de
 * aplicaciones y las migas de la barra superior.
 */

/** Color de cada área (tokens --app-* de globals.css). */
export type App =
  | 'maestros'
  | 'ventas'
  | 'facturacion'
  | 'compras'
  | 'tesoreria'
  | 'impuestos'
  | 'contabilidad'
  | 'contratos'
  | 'servicio'
  | 'tiendas'
  | 'ajustes'
  | 'crm'

/** Clases escritas enteras para que Tailwind las encuentre. */
export const COLOR_APP: Record<App, string> = {
  maestros: 'bg-app-maestros/14 text-app-maestros',
  ventas: 'bg-app-ventas/14 text-app-ventas',
  facturacion: 'bg-app-facturacion/14 text-app-facturacion',
  compras: 'bg-app-compras/14 text-app-compras',
  tesoreria: 'bg-app-tesoreria/14 text-app-tesoreria',
  impuestos: 'bg-app-impuestos/14 text-app-impuestos',
  contabilidad: 'bg-app-contabilidad/14 text-app-contabilidad',
  contratos: 'bg-app-contratos/14 text-app-contratos',
  servicio: 'bg-app-servicio/14 text-app-servicio',
  tiendas: 'bg-app-tiendas/14 text-app-tiendas',
  ajustes: 'bg-app-ajustes/14 text-app-ajustes',
  crm: 'bg-app-crm/14 text-app-crm',
}

/** Fondo lleno para los íconos grandes del lanzador y del inicio. */
export const COLOR_APP_LLENO: Record<App, string> = {
  maestros: 'bg-app-maestros',
  ventas: 'bg-app-ventas',
  facturacion: 'bg-app-facturacion',
  compras: 'bg-app-compras',
  tesoreria: 'bg-app-tesoreria',
  impuestos: 'bg-app-impuestos',
  contabilidad: 'bg-app-contabilidad',
  contratos: 'bg-app-contratos',
  servicio: 'bg-app-servicio',
  tiendas: 'bg-app-tiendas',
  ajustes: 'bg-app-ajustes',
  crm: 'bg-app-crm',
}

export type Seccion = {
  titulo?: string
  app?: App
  icono?: LucideIcon
  items: Item[]
  /** Arranca plegada en el menú lateral. */
  cerrada?: boolean
  /** false: no aparece como aplicación en el lanzador. */
  enLanzador?: boolean
}

export type Item = {
  href: string
  texto: string
  icono: LucideIcon
  funcion?: Funcion
  /** Permiso para ver la pantalla: sin él, el ítem no aparece. */
  permiso?: string
}

export const SECCIONES: Seccion[] = [
  { items: [{ href: '/', texto: 'Inicio', icono: LayoutDashboard }], enLanzador: false },
  {
    titulo: 'Maestros',
    app: 'maestros',
    icono: Users,
    items: [
      { href: '/terceros', permiso: 'maestros.ver', texto: 'Clientes y proveedores', icono: Users },
      { href: '/articulos', permiso: 'maestros.ver', texto: 'Artículos y precios', icono: Package },
    ],
  },
  {
    titulo: 'CRM',
    app: 'crm',
    icono: Target,
    items: [
      { href: '/crm', permiso: 'crm.ver', texto: 'Embudo de ventas', icono: Target, funcion: 'comercial' },
      { href: '/crm/actividades', permiso: 'crm.ver', texto: 'Mis actividades', icono: CalendarCheck, funcion: 'comercial' },
      { href: '/crm/pronostico', permiso: 'crm.ver', texto: 'Pronóstico', icono: TrendingUp, funcion: 'comercial' },
      { href: '/whatsapp', permiso: 'whatsapp.atender', texto: 'WhatsApp', icono: MessageCircle, funcion: 'comercial' },
    ],
  },
  {
    titulo: 'Operación',
    app: 'ventas',
    icono: ClipboardList,
    items: [
      { href: '/presupuestos', permiso: 'ventas.ver', texto: 'Presupuestos', icono: FileText, funcion: 'comercial' },
      { href: '/pedidos', permiso: 'ventas.ver', texto: 'Pedidos', icono: ClipboardList, funcion: 'comercial' },
      { href: '/remitos', permiso: 'ventas.ver', texto: 'Remitos', icono: Truck, funcion: 'comercial' },
      { href: '/stock', permiso: 'stock.ver', texto: 'Stock', icono: Boxes, funcion: 'stock' },
      { href: '/stock/reposicion', permiso: 'stock.ver', texto: 'Reposición', icono: PackagePlus, funcion: 'stock' },
      { href: '/tiendas', permiso: 'tienda.ver', texto: 'Tiendas online', icono: ShoppingBag, funcion: 'tienda' },
    ],
  },
  {
    titulo: 'Facturación',
    app: 'facturacion',
    icono: Receipt,
    items: [
      { href: '/facturas', permiso: 'ventas.ver', texto: 'Facturas y notas', icono: Receipt, funcion: 'facturacion' },
      { href: '/cobranzas', permiso: 'ventas.ver', texto: 'Cobranzas', icono: Wallet, funcion: 'facturacion' },
      { href: '/cobranzas/caja', permiso: 'ventas.ver', texto: 'Cierre de caja', icono: Calculator, funcion: 'facturacion' },
      {
        href: '/cobranzas/automatica',
        permiso: 'ventas.ver',
        texto: 'Cobranza automática',
        icono: BellRing,
        funcion: 'facturacion',
      },
      { href: '/cobros-online', permiso: 'ventas.ver', texto: 'Links de pago', icono: Link2, funcion: 'facturacion' },
      { href: '/cuentas', permiso: 'ventas.ver', texto: 'Cuentas corrientes', icono: BookOpen, funcion: 'facturacion' },
    ],
  },
  {
    titulo: 'Compras',
    app: 'compras',
    icono: ShoppingCart,
    items: [
      { href: '/ordenes-compra', permiso: 'compras.ver', texto: 'Órdenes de compra', icono: ShoppingCart, funcion: 'compras' },
      { href: '/compras', permiso: 'compras.ver', texto: 'Comprobantes de compra', icono: FileInput, funcion: 'compras' },
      { href: '/compras/recibidas', permiso: 'compras.ver', texto: 'Facturas recibidas', icono: Inbox, funcion: 'compras' },
      { href: '/pagos', permiso: 'compras.ver', texto: 'Pagos a proveedores', icono: HandCoins, funcion: 'compras' },
      { href: '/cuentas-proveedores', permiso: 'compras.ver', texto: 'Cuentas de proveedores', icono: Scale, funcion: 'compras' },
    ],
  },
  {
    titulo: 'Tesorería',
    app: 'tesoreria',
    icono: Landmark,
    items: [
      { href: '/tesoreria', permiso: 'tesoreria.ver', texto: 'Cajas y bancos', icono: Landmark, funcion: 'tesoreria' },
      { href: '/tesoreria/cheques', permiso: 'tesoreria.ver', texto: 'Cheques', icono: Banknote, funcion: 'tesoreria' },
      { href: '/tesoreria/vales', permiso: 'tesoreria.ver', texto: 'Vales a rendir', icono: TicketCheck, funcion: 'tesoreria' },
    ],
  },
  {
    titulo: 'Impuestos e informes',
    app: 'impuestos',
    icono: Percent,
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
    app: 'contabilidad',
    icono: Calculator,
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

const CONTRATOS: Seccion = {
  titulo: 'Contratos',
  app: 'contratos',
  icono: FileSignature,
  items: [
    { href: '/contratos', permiso: 'contratos.ver', texto: 'Contratos', icono: FileSignature },
    { href: '/equipos', permiso: 'contratos.ver', texto: 'Equipos', icono: Printer },
    { href: '/contratos/lecturas', permiso: 'contratos.lecturas', texto: 'Lecturas', icono: Gauge },
    { href: '/contratos/facturar', permiso: 'contratos.facturar', texto: 'Facturar el mes', icono: ReceiptText },
  ],
}

const SERVICIO: Seccion = {
  titulo: 'Servicio técnico',
  app: 'servicio',
  icono: Wrench,
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
const SERVICIO_AJUSTES: Seccion = {
  titulo: 'Servicio: ajustes',
  app: 'servicio',
  icono: Settings2,
  enLanzador: false,
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
export function rutaActiva(ruta: string, secciones: { items: Item[] }[]): string | undefined {
  return secciones
    .flatMap((s) => s.items.map((i) => i.href))
    .filter((h) => (h === '/' ? ruta === '/' : ruta === h || ruta.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0]
}

/** Ítem de configuración: va al pie del menú y como aplicación en el lanzador. */
export const CONFIGURACION: Item = { href: '/configuracion', texto: 'Configuración', icono: Settings }

/** Todas las secciones que corresponden a la empresa, en orden. */
export function seccionesDe(funciones: string[]): Seccion[] {
  return funciones.includes('contratos')
    ? [...SECCIONES.slice(0, -1), CONTRATOS, SERVICIO, SERVICIO_AJUSTES, SECCIONES[SECCIONES.length - 1]]
    : SECCIONES
}

/**
 * Lo que cada persona ve: lo que su rol no permite no aparece, y lo que el
 * plan no incluye queda (con candado) solo para quien administra la suscripción.
 */
export function seccionesVisibles(funciones: string[], permisos: string[]): Seccion[] {
  const veSuscripcion = tienePermiso(permisos, 'empresa.suscripcion')
  return seccionesDe(funciones)
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => {
        if (i.funcion && !funciones.includes(i.funcion)) return veSuscripcion
        return !i.permiso || tienePermiso(permisos, i.permiso)
      }),
    }))
    .filter((s) => s.items.length)
}

/** Sección e ítem de la pantalla actual, para las migas. */
export function ubicacion(ruta: string, secciones: Seccion[]) {
  if (ruta === CONFIGURACION.href || ruta.startsWith(`${CONFIGURACION.href}/`)) {
    return { seccion: { titulo: 'Configuración', app: 'ajustes' as App, items: [CONFIGURACION] }, item: CONFIGURACION }
  }
  const activa = rutaActiva(ruta, secciones)
  for (const s of secciones) {
    const item = s.items.find((i) => i.href === activa)
    if (item) return { seccion: s, item }
  }
  return null
}
