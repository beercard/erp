import {
  BadgeCheck,
  Boxes,
  LayoutDashboard,
  type LucideIcon,
  Receipt,
  Search,
  ShoppingBag,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Pantallas de muestra del sistema, hechas en HTML: se ven nítidas en
 * cualquier pantalla, respetan el tema oscuro y no muestran datos de nadie
 * (son de ejemplo).
 */
const MENU: { icono: LucideIcon; texto: string }[] = [
  { icono: LayoutDashboard, texto: 'Inicio' },
  { icono: Users, texto: 'Clientes' },
  { icono: Receipt, texto: 'Facturas' },
  { icono: Boxes, texto: 'Stock' },
  { icono: Wallet, texto: 'Cobranzas' },
  { icono: ShoppingBag, texto: 'Tiendas online' },
  { icono: Wrench, texto: 'Servicio técnico' },
]

const TONO = {
  ok: 'bg-ok-suave text-ok',
  aviso: 'bg-aviso-suave text-aviso',
  info: 'bg-info-suave text-info',
} as const

/** Navegador con el marco del sistema (barra oscura y menú lateral). */
export function MarcoNavegador({
  ruta,
  activo,
  etiqueta,
  children,
}: {
  ruta: string
  activo: string
  etiqueta: string
  children: ReactNode
}) {
  return (
    <div
      role="img"
      aria-label={etiqueta}
      className="@container overflow-hidden rounded-xl bg-fondo text-left shadow-[0_30px_70px_-25px_rgb(0_0_0/0.5)] ring-1 ring-black/10"
    >
      <div className="flex items-center gap-1.5 border-b border-borde bg-superficie px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-error/60" />
        <span className="size-2.5 rounded-full bg-aviso/60" />
        <span className="size-2.5 rounded-full bg-ok/60" />
        <span className="ml-3 truncate rounded-md bg-superficie-2 px-3 py-0.5 font-mono text-[11px] text-texto-3">
          app.vektra/{ruta}
        </span>
      </div>
      <div className="flex items-center gap-3 bg-barra px-4 py-2">
        <span className="grid size-5 place-items-center rounded-md bg-acento text-[10px] font-black text-sobre-acento">V</span>
        <span className="hidden text-[11px] font-semibold text-sobre-barra @md:inline">Vektra</span>
        <span className="mx-auto flex h-5 w-2/5 items-center gap-1.5 rounded-md bg-barra-2 px-2 text-[10px] text-sobre-barra-2">
          <Search className="size-3" /> Buscar…
        </span>
        <span className="size-5 rounded-full bg-acento" />
      </div>
      <div className="flex">
        <aside className="hidden w-40 shrink-0 flex-col gap-0.5 bg-lateral p-3 @xl:flex">
          {MENU.map(({ icono: I, texto }) => (
            <span
              key={texto}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${texto === activo ? 'bg-superficie font-semibold text-texto shadow-suave ring-1 ring-borde' : 'text-texto-2'}`}
            >
              <I aria-hidden className="size-3.5" />
              {texto}
            </span>
          ))}
        </aside>
        <div className="flex min-h-[19rem] min-w-0 flex-1 flex-col gap-3 p-4">{children}</div>
      </div>
    </div>
  )
}

const FACTURAS = [
  { n: 'B 0003-00001842', cliente: 'Librería del Centro', total: '$ 184.320,00', estado: 'Emitida', tono: 'ok' },
  { n: 'A 0003-00000917', cliente: 'Distribuidora Norte S.R.L.', total: '$ 1.250.400,00', estado: 'Emitida', tono: 'ok' },
  { n: 'B 0004-00000311', cliente: 'Pedido Mercado Libre #20001', total: '$ 42.990,00', estado: 'Por facturar', tono: 'aviso' },
  { n: 'A 0003-00000916', cliente: 'Estudio Pérez & Asoc.', total: '$ 96.800,00', estado: 'Cobrada', tono: 'info' },
] as const

const BARRAS = [38, 52, 45, 61, 57, 72, 66, 80, 74, 88, 83, 96]

/** Inicio: cifras del mes, últimas facturas y ventas por mes. */
export function VistaPanel() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-4">
        {[
          ['Ventas del mes', '$ 18,4 M', '+12 %'],
          ['A cobrar', '$ 3,1 M', '27 clientes'],
          ['Pedidos online', '46', 'hoy 9'],
          ['IVA del mes', '$ 1,2 M', 'a pagar'],
        ].map(([t, v, d]) => (
          <div key={t} className="tarjeta p-3">
            <p className="text-[11px] text-texto-3">{t}</p>
            <p className="cifras mt-1 text-base font-semibold">{v}</p>
            <p className="text-[11px] text-acento">{d}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 @4xl:grid-cols-[1fr_200px]">
        <div className="tarjeta">
          <p className="border-b border-borde px-3 py-2 text-xs font-semibold">Últimas facturas</p>
          {FACTURAS.map((f) => (
            <div key={f.n} className="flex items-center gap-3 border-b border-borde px-3 py-2 text-[11px] last:border-0">
              <span className="cifras hidden w-28 text-texto-3 @2xl:block">{f.n}</span>
              <span className="min-w-0 flex-1 truncate">{f.cliente}</span>
              <span className="cifras">{f.total}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TONO[f.tono]}`}>{f.estado}</span>
            </div>
          ))}
        </div>
        <div className="hidden tarjeta p-3 @4xl:block">
          <p className="text-xs font-semibold">Ventas por mes</p>
          <div className="mt-3 flex h-24 items-end gap-1">
            {BARRAS.map((h, i) => (
              <span key={i} style={{ height: `${h}%` }} className="flex-1 rounded-t-sm bg-acento/80" />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

/** Nueva factura: cliente, renglones y la autorización de ARCA. */
export function VistaFactura() {
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">Nueva factura</p>
        <span className="flex items-center gap-1 rounded-full bg-ok-suave px-2 py-0.5 text-[10px] font-semibold text-ok">
          <BadgeCheck className="size-3" /> CAE recibido
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        {[
          ['Cliente', 'Distribuidora Norte S.R.L.'],
          ['Comprobante', 'Factura A'],
          ['Punto de venta', '0003'],
          ['Condición', 'Cuenta corriente 30 días'],
        ].map(([e, v]) => (
          <div key={e} className="tarjeta px-2.5 py-1.5">
            <p className="text-[10px] text-texto-3">{e}</p>
            <p className="truncate text-[11px] font-medium">{v}</p>
          </div>
        ))}
      </div>
      <div className="tarjeta overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-superficie-2 px-3 py-1.5 text-[10px] font-medium text-texto-2">
          <span>Artículo</span>
          <span>Cant.</span>
          <span className="w-20 text-right">Subtotal</span>
        </div>
        {[
          ['Tóner 85A compatible', '10', '$ 420.000'],
          ['Resma A4 75 g', '40', '$ 288.000'],
          ['Servicio de instalación', '1', '$ 85.000'],
        ].map(([a, c, s]) => (
          <div key={a} className="grid grid-cols-[1fr_auto_auto] gap-3 border-t border-borde px-3 py-1.5 text-[11px]">
            <span className="truncate">{a}</span>
            <span className="cifras text-texto-2">{c}</span>
            <span className="cifras w-20 text-right">{s}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-end justify-between gap-3">
        <div className="text-[11px] text-texto-2">
          <p>Neto $ 793.000 · IVA 21 % $ 166.530</p>
          <p className="cifras text-texto-3">CAE 74412093318562 · vence 12/10</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-texto-3">Total</p>
          <p className="cifras text-lg leading-none font-bold">$ 959.530</p>
        </div>
      </div>
    </>
  )
}

/** Tiendas online: pedidos que entran solos y stock sincronizado. */
export function VistaTiendas() {
  const canales = [
    ['Mercado Libre', '128 publicaciones', 'bg-aviso-suave text-aviso'],
    ['Tienda Nube', '64 productos', 'bg-info-suave text-info'],
    ['WooCommerce', '41 productos', 'bg-app-impuestos/14 text-app-impuestos'],
  ]
  const pedidos = [
    ['#20001', 'Mercado Libre', 'Facturado', 'ok'],
    ['#1873', 'Tienda Nube', 'Por facturar', 'aviso'],
    ['#20002', 'Mercado Libre', 'Facturado', 'ok'],
    ['#552', 'WooCommerce', 'Entregado', 'info'],
  ] as const
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {canales.map(([n, d, c]) => (
          <div key={n} className="tarjeta flex items-center gap-2 p-2.5">
            <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${c}`}>
              <ShoppingBag className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-semibold">{n}</span>
              <span className="block truncate text-[10px] text-texto-3">{d}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="tarjeta">
        <p className="flex items-center justify-between border-b border-borde px-3 py-2 text-xs font-semibold">
          Pedidos de hoy
          <span className="flex items-center gap-1 text-[10px] font-medium text-ok">
            <span className="size-1.5 rounded-full bg-ok" /> Stock sincronizado
          </span>
        </p>
        {pedidos.map(([n, c, e, t]) => (
          <div key={n} className="flex items-center gap-3 border-b border-borde px-3 py-2 text-[11px] last:border-0">
            <span className="cifras w-14 text-texto-3">{n}</span>
            <span className="min-w-0 flex-1 truncate">{c}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TONO[t]}`}>{e}</span>
          </div>
        ))}
      </div>
    </>
  )
}

/** La vista de inicio sola (la usan las páginas de funciones y soluciones). */
export function Maqueta() {
  return (
    <MarcoNavegador
      ruta="inicio"
      activo="Inicio"
      etiqueta="Vista del panel de Vektra ERP con ventas del mes, facturas emitidas y stock"
    >
      <VistaPanel />
    </MarcoNavegador>
  )
}
