import { Boxes, LayoutDashboard, Receipt, ShoppingBag, Users, Wallet, Wrench } from 'lucide-react'

/**
 * Pantalla de muestra del sistema, hecha en HTML: se ve nítida en cualquier
 * pantalla, respeta el tema oscuro y no muestra datos de nadie (son de ejemplo).
 */
const MENU = [
  { icono: LayoutDashboard, texto: 'Inicio', activo: true },
  { icono: Users, texto: 'Clientes' },
  { icono: Receipt, texto: 'Facturas' },
  { icono: Boxes, texto: 'Stock' },
  { icono: Wallet, texto: 'Cobranzas' },
  { icono: ShoppingBag, texto: 'Tiendas online' },
  { icono: Wrench, texto: 'Servicio técnico' },
]

const FACTURAS = [
  { n: 'B 0003-00001842', cliente: 'Librería del Centro', total: '$ 184.320,00', estado: 'Emitida', tono: 'ok' },
  { n: 'A 0003-00000917', cliente: 'Distribuidora Norte S.R.L.', total: '$ 1.250.400,00', estado: 'Emitida', tono: 'ok' },
  { n: 'B 0004-00000311', cliente: 'Pedido Mercado Libre #20001', total: '$ 42.990,00', estado: 'Por facturar', tono: 'aviso' },
  { n: 'A 0003-00000916', cliente: 'Estudio Pérez & Asoc.', total: '$ 96.800,00', estado: 'Cobrada', tono: 'info' },
] as const

const TONO = { ok: 'bg-ok-suave text-ok', aviso: 'bg-aviso-suave text-aviso', info: 'bg-info-suave text-info' }

const BARRAS = [38, 52, 45, 61, 57, 72, 66, 80, 74, 88, 83, 96]

export function Maqueta() {
  return (
    <div
      role="img"
      aria-label="Vista del panel de Vektra ERP con ventas del mes, facturas emitidas y stock"
      className="overflow-hidden rounded-xl border border-borde bg-fondo text-left shadow-[0_24px_60px_-20px_rgb(0_0_0/0.35)]"
    >
      <div className="flex items-center gap-1.5 border-b border-borde bg-superficie px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-error/60" />
        <span className="size-2.5 rounded-full bg-aviso/60" />
        <span className="size-2.5 rounded-full bg-ok/60" />
        <span className="ml-3 truncate rounded bg-superficie-2 px-3 py-0.5 text-[11px] text-texto-3">app.vektra · Inicio</span>
      </div>
      <div className="flex">
        <aside className="hidden w-44 shrink-0 flex-col gap-0.5 border-r border-borde bg-superficie p-3 sm:flex">
          {MENU.map(({ icono: I, texto, activo }) => (
            <span
              key={texto}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${activo ? 'bg-acento-suave font-medium text-acento' : 'text-texto-2'}`}
            >
              <I aria-hidden className="size-3.5" />
              {texto}
            </span>
          ))}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Ventas del mes', '$ 18,4 M', '+12 %'],
              ['A cobrar', '$ 3,1 M', '27 clientes'],
              ['Pedidos online', '46', 'hoy 9'],
              ['IVA del mes', '$ 1,2 M', 'a pagar'],
            ].map(([t, v, d]) => (
              <div key={t} className="rounded-xl border border-borde bg-superficie shadow-suave p-3">
                <p className="text-[11px] text-texto-3">{t}</p>
                <p className="cifras mt-1 text-base font-semibold">{v}</p>
                <p className="text-[11px] text-acento">{d}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_200px]">
            <div className="rounded-xl border border-borde bg-superficie shadow-suave">
              <p className="border-b border-borde px-3 py-2 text-xs font-semibold">Últimas facturas</p>
              {FACTURAS.map((f) => (
                <div key={f.n} className="flex items-center gap-3 border-b border-borde px-3 py-2 text-[11px] last:border-0">
                  <span className="cifras hidden w-28 text-texto-3 sm:block">{f.n}</span>
                  <span className="min-w-0 flex-1 truncate">{f.cliente}</span>
                  <span className="cifras">{f.total}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TONO[f.tono]}`}>{f.estado}</span>
                </div>
              ))}
            </div>
            <div className="hidden rounded-xl border border-borde bg-superficie shadow-suave p-3 lg:block">
              <p className="text-xs font-semibold">Ventas por mes</p>
              <div className="mt-3 flex h-24 items-end gap-1">
                {BARRAS.map((h, i) => (
                  <span key={i} style={{ height: `${h}%` }} className="flex-1 rounded-t-sm bg-acento/80" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
