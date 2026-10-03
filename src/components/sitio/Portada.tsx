import { ArrowDownRight, ArrowUpRight, BadgeCheck, Bell, CircleAlert, MessageCircle, Package, ShoppingBag } from 'lucide-react'
import type { ReactNode } from 'react'

import { contacto } from '@/lib/marca'

/*
 * Piezas visuales de la portada. Son HTML (nítidas en cualquier pantalla y en
 * los dos temas) y muestran datos de ejemplo, nunca de un cliente real.
 */

/** Celular con la factura recién emitida. */
export function MaquetaCelular({ className = '' }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Vektra ERP en el celular: factura emitida con CAE"
      className={`w-[210px] rounded-[2.2rem] bg-barra p-2 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.55)] ring-1 ring-white/10 ${className}`}
    >
      <div className="overflow-hidden rounded-[1.75rem] bg-fondo">
        <div className="flex items-center justify-between bg-barra px-4 pt-2 pb-2.5 text-[9px] text-sobre-barra">
          <span>9:41</span>
          <span className="h-4 w-14 rounded-full bg-black" />
          <span>100%</span>
        </div>
        <div className="flex flex-col gap-2.5 p-3 text-left">
          <div className="tarjeta flex flex-col items-center gap-1.5 px-3 py-4 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-ok-suave text-ok">
              <BadgeCheck aria-hidden className="size-5" />
            </span>
            <p className="text-[12px] font-bold">Factura emitida</p>
            <p className="cifras text-[10px] text-texto-2">B 0003-00001843</p>
            <p className="cifras text-lg leading-none font-bold">$ 58.900</p>
            <p className="cifras rounded-md bg-superficie-2 px-2 py-0.5 text-[9px] text-texto-2">CAE 74412093318562</p>
          </div>
          <div className="tarjeta flex flex-col gap-1.5 p-2.5">
            {[
              ['Yerba 1 kg × 6', '$ 32.400'],
              ['Azúcar 1 kg × 10', '$ 14.500'],
              ['Café 500 g × 2', '$ 12.000'],
            ].map(([a, b]) => (
              <div key={a} className="flex justify-between text-[10px]">
                <span className="text-texto-2">{a}</span>
                <span className="cifras font-medium">{b}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <span className="rounded-lg bg-acento py-1.5 text-center text-[10px] font-semibold text-sobre-acento">Enviar</span>
            <span className="rounded-lg bg-superficie py-1.5 text-center text-[10px] font-semibold ring-1 ring-borde">
              Imprimir
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Notificación que flota sobre la maqueta. */
export function AvisoFlotante({
  icono,
  titulo,
  texto,
  tono,
  className = '',
}: {
  icono: ReactNode
  titulo: string
  texto: string
  tono: string
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={`flotar flex w-[19rem] items-center gap-3 rounded-2xl bg-superficie/95 p-3 text-left shadow-flotante ring-1 ring-borde backdrop-blur ${className}`}
    >
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tono}`}>{icono}</span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold">{titulo}</span>
        <span className="block truncate text-xs text-texto-2">{texto}</span>
      </span>
    </div>
  )
}

/* ---- Mini pantallas de las tarjetas de funciones ---- */

export function MiniFactura() {
  return (
    <div aria-hidden className="tarjeta relative mx-auto w-full max-w-sm rotate-[-2deg] p-4 text-left">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] text-texto-3">Factura</p>
          <p className="text-2xl leading-none font-black">B</p>
        </div>
        <div className="text-right">
          <p className="cifras text-[11px] text-texto-2">0003-00001843</p>
          <p className="text-[11px] text-texto-3">02/10/2026</p>
        </div>
      </div>
      <div className="my-3 h-px bg-borde" />
      {[
        ['Servicio de mantenimiento', '$ 45.000'],
        ['Repuesto rodillo', '$ 13.900'],
      ].map(([a, b]) => (
        <div key={a} className="flex justify-between py-0.5 text-xs">
          <span className="text-texto-2">{a}</span>
          <span className="cifras">{b}</span>
        </div>
      ))}
      <div className="mt-2 flex justify-between border-t border-borde pt-2 text-sm font-bold">
        <span>Total</span>
        <span className="cifras">$ 58.900</span>
      </div>
      <span className="absolute -right-3 -bottom-3 rotate-[-8deg] rounded-lg border-2 border-ok bg-superficie px-2 py-1 text-[11px] font-black tracking-wide text-ok uppercase shadow-panel">
        CAE aprobado
      </span>
    </div>
  )
}

export function MiniStock() {
  const filas = [
    { n: 'Tóner 85A', v: 82, c: 'bg-ok' },
    { n: 'Resma A4', v: 46, c: 'bg-acento' },
    { n: 'Cartucho 664', v: 12, c: 'bg-error' },
  ]
  return (
    <div aria-hidden className="flex w-full flex-col gap-2.5 text-left">
      {filas.map((f) => (
        <div key={f.n} className="flex items-center gap-3 text-xs">
          <Package className="size-3.5 shrink-0 text-texto-3" />
          <span className="w-24 shrink-0 truncate">{f.n}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-superficie-2">
            <span style={{ width: `${f.v}%` }} className={`block h-full rounded-full ${f.c}`} />
          </span>
        </div>
      ))}
      <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg bg-error-suave px-2 py-1 text-[11px] font-semibold text-error">
        <CircleAlert className="size-3.5" /> Reponer: Cartucho 664
      </span>
    </div>
  )
}

export function MiniPedidos() {
  const pedidos = [
    { canal: 'Mercado Libre', n: '#20001', m: '$ 42.990', c: 'bg-aviso-suave text-aviso' },
    { canal: 'Tienda Nube', n: '#1873', m: '$ 18.500', c: 'bg-info-suave text-info' },
    { canal: 'WooCommerce', n: '#552', m: '$ 9.900', c: 'bg-app-impuestos/14 text-app-impuestos' },
  ]
  return (
    <div aria-hidden className="flex w-full flex-col gap-2 text-left">
      {pedidos.map((p) => (
        <div key={p.n} className="flex items-center gap-2.5 rounded-xl bg-superficie p-2 text-xs ring-1 ring-borde">
          <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${p.c}`}>
            <ShoppingBag className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{p.canal}</span>
            <span className="cifras block text-[11px] text-texto-3">Pedido {p.n} · stock descontado</span>
          </span>
          <span className="cifras font-semibold">{p.m}</span>
        </div>
      ))}
    </div>
  )
}

export function MiniCuentas() {
  const filas = [
    { n: 'Kiosco San Martín', d: '45 días', m: '$ 86.200', c: 'text-error' },
    { n: 'Almacén La Esquina', d: '12 días', m: '$ 23.400', c: 'text-aviso' },
    { n: 'Bar El Puerto', d: 'Al día', m: '$ 0', c: 'text-ok' },
  ]
  return (
    <div aria-hidden className="flex w-full flex-col divide-y divide-borde text-left">
      {filas.map((f) => (
        <div key={f.n} className="flex items-center justify-between gap-3 py-2 text-xs">
          <span className="min-w-0">
            <span className="block truncate font-medium">{f.n}</span>
            <span className={`block text-[11px] font-semibold ${f.c}`}>{f.d}</span>
          </span>
          <span className="cifras font-semibold">{f.m}</span>
        </div>
      ))}
    </div>
  )
}

export function MiniIva() {
  return (
    <div aria-hidden className="flex w-full flex-col gap-2 text-left text-xs">
      <div className="flex justify-between">
        <span className="flex items-center gap-1.5 text-texto-2">
          <ArrowUpRight className="size-3.5 text-error" /> Débito fiscal
        </span>
        <span className="cifras font-semibold">$ 1.284.300</span>
      </div>
      <div className="flex justify-between">
        <span className="flex items-center gap-1.5 text-texto-2">
          <ArrowDownRight className="size-3.5 text-ok" /> Crédito fiscal
        </span>
        <span className="cifras font-semibold">$ 902.150</span>
      </div>
      <div className="flex justify-between border-t border-borde pt-2 text-sm font-bold">
        <span>A pagar</span>
        <span className="cifras">$ 382.150</span>
      </div>
      <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg bg-ok-suave px-2 py-1 text-[11px] font-semibold text-ok">
        <BadgeCheck className="size-3.5" /> Libro IVA listo para ARCA
      </span>
    </div>
  )
}

export function MiniAvisos() {
  return (
    <div aria-hidden className="flex w-full flex-col gap-2 text-left">
      {[
        ['Vence el IVA en 3 días', 'Ya está calculado'],
        ['Cheque de $ 250.000', 'Se acredita mañana'],
      ].map(([t, d]) => (
        <div key={t} className="flex items-center gap-2.5 rounded-xl bg-superficie p-2 text-xs ring-1 ring-borde">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-acento-suave text-acento">
            <Bell className="size-3.5" />
          </span>
          <span>
            <span className="block font-semibold">{t}</span>
            <span className="block text-[11px] text-texto-3">{d}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

/** Botón flotante de WhatsApp, solo si la empresa configuró el número. */
export function BotonWhatsapp() {
  const { whatsapp } = contacto()
  if (!whatsapp) return null
  return (
    <a
      href={`https://wa.me/${whatsapp}?text=${encodeURIComponent('Hola, quiero saber más de Vektra ERP')}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribinos por WhatsApp"
      className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-whatsapp px-4 py-3 text-sm font-semibold text-sobre-whatsapp shadow-flotante transition hover:scale-105 sm:right-6 sm:bottom-6"
    >
      <MessageCircle aria-hidden className="size-5" />
      <span className="hidden sm:inline">¿Hablamos?</span>
    </a>
  )
}
