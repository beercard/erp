'use client'

import {
  Banknote,
  BookOpen,
  Boxes,
  ClipboardList,
  FileInput,
  FileSignature,
  FileSpreadsheet,
  Gauge,
  HandCoins,
  Scale,
  FileText,
  Landmark,
  LayoutDashboard,
  Lock,
  Package,
  Printer,
  Receipt,
  ReceiptText,
  Settings,
  Truck,
  ShoppingCart,
  Users,
  Wallet,
  Wrench,
  CalendarDays,
  ListChecks,
  RefreshCw,
  Smartphone,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { planQueIncluye, type Funcion } from '@/lib/planes'

type Item = { href: string; texto: string; icono: LucideIcon; etapa?: string; funcion?: Funcion }

const SECCIONES: { titulo?: string; items: Item[] }[] = [
  { items: [{ href: '/', texto: 'Inicio', icono: LayoutDashboard }] },
  {
    titulo: 'Maestros',
    items: [
      { href: '/terceros', texto: 'Clientes y proveedores', icono: Users },
      { href: '/articulos', texto: 'Artículos y precios', icono: Package },
    ],
  },
  {
    titulo: 'Operación',
    items: [
      { href: '/presupuestos', texto: 'Presupuestos', icono: FileText, funcion: 'comercial' },
      { href: '/pedidos', texto: 'Pedidos', icono: ClipboardList, funcion: 'comercial' },
      { href: '/remitos', texto: 'Remitos', icono: Truck, funcion: 'comercial' },
      { href: '/stock', texto: 'Stock', icono: Boxes, funcion: 'stock' },
    ],
  },
  {
    titulo: 'Facturación',
    items: [
      { href: '/facturas', texto: 'Facturas y notas', icono: Receipt, funcion: 'facturacion' },
      { href: '/cobranzas', texto: 'Cobranzas', icono: Wallet, funcion: 'facturacion' },
      { href: '/cuentas', texto: 'Cuentas corrientes', icono: BookOpen, funcion: 'facturacion' },
    ],
  },
  {
    titulo: 'Compras',
    items: [
      { href: '/ordenes-compra', texto: 'Órdenes de compra', icono: ShoppingCart, funcion: 'compras' },
      { href: '/compras', texto: 'Comprobantes de compra', icono: FileInput, funcion: 'compras' },
      { href: '/pagos', texto: 'Pagos a proveedores', icono: HandCoins, funcion: 'compras' },
      { href: '/cuentas-proveedores', texto: 'Cuentas de proveedores', icono: Scale, funcion: 'compras' },
    ],
  },
  {
    titulo: 'Tesorería',
    items: [
      { href: '/tesoreria', texto: 'Cajas y bancos', icono: Landmark, funcion: 'tesoreria' },
      { href: '/tesoreria/cheques', texto: 'Cheques', icono: Banknote, funcion: 'tesoreria' },
    ],
  },
  {
    titulo: 'Próximamente',
    items: [{ href: '#fiscal', texto: 'Libros de IVA e informes', icono: FileSpreadsheet, etapa: 'Pronto' }],
  },
]

const CONTRATOS: { titulo: string; items: Item[] } = {
  titulo: 'Contratos',
  items: [
    { href: '/contratos', texto: 'Contratos', icono: FileSignature },
    { href: '/equipos', texto: 'Equipos', icono: Printer },
    { href: '/contratos/lecturas', texto: 'Lecturas', icono: Gauge },
    { href: '/contratos/facturar', texto: 'Facturar el mes', icono: ReceiptText },
  ],
}

const SERVICIO: { titulo: string; items: Item[] } = {
  titulo: 'Servicio técnico',
  items: [
    { href: '/servicio', texto: 'Órdenes', icono: Wrench },
    { href: '/servicio/calendario', texto: 'Calendario', icono: CalendarDays },
    { href: '/tecnico', texto: 'Mi agenda', icono: Smartphone },
    { href: '/servicio/preventivos', texto: 'Preventivos', icono: RefreshCw },
    { href: '/servicio/tipos', texto: 'Tipos de orden', icono: ListChecks },
  ],
}

/** Activo: la ruta más larga del menú que coincide (así "Contratos" no se marca en "Lecturas"). */
function rutaActiva(ruta: string, secciones: { items: Item[] }[]) {
  return secciones
    .flatMap((s) => s.items.map((i) => i.href))
    .filter((h) => (h === '/' ? ruta === '/' : ruta === h || ruta.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0]
}

export function Navegacion({ funciones }: { funciones: string[] }) {
  const ruta = usePathname()
  const secciones = funciones.includes('contratos')
    ? [...SECCIONES.slice(0, -1), CONTRATOS, SERVICIO, SECCIONES[SECCIONES.length - 1]]
    : SECCIONES
  const activa = rutaActiva(ruta, secciones)
  return (
    <nav aria-label="Secciones" className="flex flex-col gap-5">
      {secciones.map((s, i) => (
        <div key={s.titulo ?? i} className="flex flex-col gap-0.5">
          {s.titulo && <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-wider text-texto-3 uppercase">{s.titulo}</p>}
          {s.items.map((item) => {
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
            if (item.etapa) {
              return (
                <span
                  key={item.href}
                  className="flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-1.5 text-texto-3"
                  title={`Llega en la ${item.etapa.toLowerCase()}`}
                >
                  <Icono aria-hidden className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.texto}</span>
                  <span className="text-[10px] font-medium">{item.etapa}</span>
                </span>
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
      ))}
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
