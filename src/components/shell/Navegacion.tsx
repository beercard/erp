'use client'

import {
  BookOpen,
  Boxes,
  ClipboardList,
  FileInput,
  HandCoins,
  Scale,
  FileText,
  Landmark,
  LayoutDashboard,
  Package,
  Printer,
  Receipt,
  Settings,
  Truck,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Item = { href: string; texto: string; icono: LucideIcon; etapa?: string }

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
      { href: '/presupuestos', texto: 'Presupuestos', icono: FileText },
      { href: '/pedidos', texto: 'Pedidos', icono: ClipboardList },
      { href: '/remitos', texto: 'Remitos', icono: Truck },
      { href: '/stock', texto: 'Stock', icono: Boxes },
    ],
  },
  {
    titulo: 'Facturación',
    items: [
      { href: '/facturas', texto: 'Facturas y notas', icono: Receipt },
      { href: '/cobranzas', texto: 'Cobranzas', icono: Wallet },
      { href: '/cuentas', texto: 'Cuentas corrientes', icono: BookOpen },
    ],
  },
  {
    titulo: 'Compras',
    items: [
      { href: '/ordenes-compra', texto: 'Órdenes de compra', icono: ShoppingCart },
      { href: '/compras', texto: 'Comprobantes de compra', icono: FileInput },
      { href: '/pagos', texto: 'Pagos a proveedores', icono: HandCoins },
      { href: '/cuentas-proveedores', texto: 'Cuentas de proveedores', icono: Scale },
    ],
  },
  {
    titulo: 'Próximas etapas',
    items: [{ href: '#tesoreria', texto: 'Caja y bancos', icono: Landmark, etapa: 'Etapa 4' }],
  },
]

const CONTRATOS: Item = { href: '#contratos', texto: 'Contratos y equipos', icono: Printer, etapa: 'Etapa 5' }

export function Navegacion({ modulos }: { modulos: string[] }) {
  const ruta = usePathname()
  const secciones = modulos.includes('contratos') ? [...SECCIONES, { titulo: 'Módulos', items: [CONTRATOS] }] : SECCIONES
  return (
    <nav aria-label="Secciones" className="flex flex-col gap-5">
      {secciones.map((s, i) => (
        <div key={s.titulo ?? i} className="flex flex-col gap-0.5">
          {s.titulo && <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-wider text-texto-3 uppercase">{s.titulo}</p>}
          {s.items.map((item) => {
            const activo = item.href === '/' ? ruta === '/' : ruta.startsWith(item.href)
            const Icono = item.icono
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
