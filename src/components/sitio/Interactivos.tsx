'use client'

import { ArrowRight, Check, Download, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { DIAS_DE_PRUEBA, MESES_COBRADOS_EN_ANUAL, PLANES } from '@/lib/planes'

const pesos = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`

/* ---------- Números en vivo (datos de ejemplo) ---------- */

const PERIODOS = {
  hoy: {
    vendiste: 1_843_000,
    cobraste: 1_212_400,
    facturas: 47,
    cambios: ['+12,4 %', '+8 %', '+5'],
    barras: [22, 18, 26, 35, 41, 38, 52, 64, 58, 61, 72, 66],
    etiquetas: ['8h', '9h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h', '18h', '19h'],
  },
  semana: {
    vendiste: 11_920_500,
    cobraste: 9_406_000,
    facturas: 296,
    cambios: ['+6,1 %', '+4,3 %', '+18'],
    barras: [52, 61, 58, 70, 82, 47, 20],
    etiquetas: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
  },
  mes: {
    vendiste: 48_310_000,
    cobraste: 41_870_000,
    facturas: 1_184,
    cambios: ['+9,8 %', '+11 %', '+96'],
    barras: [40, 46, 44, 52, 58, 55, 63, 66, 61, 70, 74, 79, 72, 81, 86],
    etiquetas: ['1', '3', '5', '7', '9', '11', '13', '15', '17', '19', '21', '23', '25', '27', '29'],
  },
} as const

type Periodo = keyof typeof PERIODOS

export function NumerosEnVivo() {
  const [vista, setVista] = useState<'ventas' | 'cobranzas'>('ventas')
  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const d = PERIODOS[periodo]
  const tarjetas = [
    { t: 'Vendiste', v: pesos(d.vendiste), s: 'facturado con IVA', c: d.cambios[0] },
    { t: 'Cobraste', v: pesos(d.cobraste), s: 'efectivo, transferencias y cheques', c: d.cambios[1] },
    { t: 'Comprobantes', v: d.facturas.toLocaleString('es-AR'), s: 'con CAE de ARCA', c: d.cambios[2] },
  ]
  const factor = vista === 'ventas' ? 1 : 0.82
  return (
    <div className="overflow-hidden rounded-3xl bg-superficie shadow-[0_20px_50px_-25px_rgb(0_0_0/0.3)] ring-1 ring-borde">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde p-4 sm:p-5">
        <div role="tablist" aria-label="Qué ver" className="flex rounded-xl bg-superficie-2 p-1">
          {(['ventas', 'cobranzas'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className="rounded-lg px-4 py-1.5 text-sm font-medium text-texto-2 capitalize aria-selected:bg-superficie aria-selected:text-texto aria-selected:shadow-suave"
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['hoy', 'Hoy'],
              ['semana', '7 días'],
              ['mes', '30 días'],
            ] as const
          ).map(([p, t]) => (
            <button
              key={p}
              type="button"
              aria-pressed={periodo === p}
              onClick={() => setPeriodo(p)}
              className="rounded-lg bg-superficie-2 px-3 py-1.5 text-sm font-medium text-texto-2 hover:text-texto aria-pressed:bg-acento aria-pressed:text-sobre-acento"
            >
              {t}
            </button>
          ))}
          <span className="hidden items-center gap-1.5 rounded-lg bg-superficie-2 px-3 py-1.5 text-sm font-medium text-texto-2 sm:flex">
            <Download aria-hidden className="size-4" /> Excel
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="grid gap-3 md:grid-cols-3">
          {tarjetas.map((x) => (
            <div key={x.t} className="rounded-2xl bg-fondo-sitio p-5 ring-1 ring-borde/60">
              <p className="text-sm text-texto-2">{x.t}</p>
              <p className="mt-1 font-mono text-3xl font-semibold tracking-tight">{x.v}</p>
              <p className="mt-1 text-xs text-texto-3">{x.s}</p>
              <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-ok-suave px-2 py-0.5 text-xs font-semibold text-ok">
                <TrendingUp aria-hidden className="size-3.5" /> {x.c}
              </span>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-3 flex items-center justify-between text-sm">
            <p className="font-semibold">{vista === 'ventas' ? 'Ventas' : 'Cobranzas'} por período</p>
            <p className="flex items-center gap-1.5 text-xs text-texto-2">
              <span className="size-2 rounded-full bg-acento" /> Datos de ejemplo
            </p>
          </div>
          <div className="flex h-40 items-end gap-1.5 sm:gap-2" aria-hidden>
            {d.barras.map((h, n) => (
              <div key={`${periodo}-${n}`} className="flex h-full flex-1 items-end">
                <span
                  style={{ height: `${h * factor}%` }}
                  className="w-full rounded-t-md bg-gradient-to-t from-acento to-acento/60 transition-all duration-500"
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5 sm:gap-2" aria-hidden>
            {d.etiquetas.map((e) => (
              <span key={e} className="flex-1 text-center font-mono text-[10px] text-texto-3">
                {e}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Calculadora de tiempo ---------- */

const DESLIZADORES = [
  {
    id: 'facturas',
    t: 'Facturas y ventas por día',
    a: 'Comprobantes que hacés o anotás',
    min: 5,
    max: 200,
    paso: 5,
    inicial: 40,
    u: 'por día',
  },
  {
    id: 'minutos',
    t: 'Minutos por factura a mano',
    a: 'Buscar el cliente, el precio y cargarla en ARCA',
    min: 1,
    max: 10,
    paso: 1,
    inicial: 3,
    u: 'min c/u',
  },
  {
    id: 'impuestos',
    t: 'Horas por mes en IVA y libros',
    a: 'Planillas para el contador y el Libro IVA',
    min: 0,
    max: 40,
    paso: 1,
    inicial: 10,
    u: 'h/mes',
  },
  {
    id: 'caja',
    t: 'Minutos por día en caja y cobranzas',
    a: 'Cuadrar la caja y ver quién te debe',
    min: 0,
    max: 90,
    paso: 5,
    inicial: 30,
    u: 'min/día',
  },
] as const

/** Cuánto de cada tarea se ahorra con el sistema (supuestos de la estimación, a la vista). */
const AHORRO = { facturas: 0.8, impuestos: 0.85, caja: 0.7 }
const DIAS_HABILES = 22

export function Calculadora() {
  const [v, setV] = useState<Record<string, number>>(Object.fromEntries(DESLIZADORES.map((d) => [d.id, d.inicial])))
  const facturar = ((v.facturas * v.minutos * DIAS_HABILES) / 60) * AHORRO.facturas
  const impuestos = v.impuestos * AHORRO.impuestos
  const caja = ((v.caja * DIAS_HABILES) / 60) * AHORRO.caja
  const total = facturar + impuestos + caja
  const filas = [
    { t: 'Facturación', d: 'Clientes, precios y CAE en el mismo paso', h: facturar },
    { t: 'Impuestos y libros', d: 'Libro IVA y paquete del contador automáticos', h: impuestos },
    { t: 'Caja y cobranzas', d: 'Saldos y cuentas corrientes al día', h: caja },
  ]
  return (
    <div className="grid overflow-hidden rounded-3xl ring-1 ring-borde lg:grid-cols-2">
      <div className="flex flex-col gap-7 bg-superficie p-6 sm:p-8">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-texto-3 uppercase">Tu empresa</p>
          <p className="mt-1 text-xl font-bold">¿Cómo lo hacés hoy?</p>
        </div>
        {DESLIZADORES.map((d) => (
          <div key={d.id} className="flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-4">
              <label htmlFor={`calc-${d.id}`} className="font-medium">
                {d.t}
                <span className="block text-xs font-normal text-texto-3">{d.a}</span>
              </label>
              <span className="shrink-0 font-mono text-lg font-semibold text-acento">
                {v[d.id]} <span className="text-sm">{d.u}</span>
              </span>
            </div>
            <input
              id={`calc-${d.id}`}
              type="range"
              min={d.min}
              max={d.max}
              step={d.paso}
              value={v[d.id]}
              onChange={(e) => setV((x) => ({ ...x, [d.id]: Number(e.target.value) }))}
              className="w-full"
            />
          </div>
        ))}
      </div>
      <div className="relative flex flex-col gap-5 overflow-hidden bg-barra p-6 text-sobre-barra sm:p-8">
        <div aria-hidden className="absolute -top-24 -right-24 size-72 rounded-full bg-marca/60 blur-3xl" />
        <div className="relative">
          <p className="font-mono text-xs tracking-[0.18em] text-sobre-barra-2 uppercase">Tiempo que recuperás por mes</p>
          <p className="mt-2 font-mono text-6xl font-semibold tracking-tight sm:text-7xl" aria-live="polite">
            {total.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h
          </p>
          <p className="mt-2 text-sobre-barra-2">
            Son <span className="font-semibold text-acento-claro">{Math.round((total * 12) / 8)} jornadas de 8 horas</span> por
            año.
          </p>
        </div>
        <ul className="relative flex flex-col divide-y divide-white/10 border-y border-white/10">
          {filas.map((f) => (
            <li key={f.t} className="flex items-center justify-between gap-4 py-3.5">
              <span>
                <span className="block font-medium">{f.t}</span>
                <span className="block text-xs text-sobre-barra-2">{f.d}</span>
              </span>
              <span className="shrink-0 font-mono text-lg whitespace-nowrap">
                +{f.h.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h
              </span>
            </li>
          ))}
        </ul>
        <Link
          href="/registro"
          className="relative mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white font-semibold text-marca-2 transition hover:bg-white/90"
        >
          Recuperar ese tiempo <ArrowRight aria-hidden className="size-4" />
        </Link>
        <p className="relative text-[11px] text-sobre-barra-2">
          Estimación con {DIAS_HABILES} días hábiles y un ahorro del 80 % al facturar, 85 % en impuestos y 70 % en caja. Cada
          empresa es distinta.
        </p>
      </div>
    </div>
  )
}

/* ---------- Planes con selector mensual / anual ---------- */

export function PlanesPortada() {
  const [anual, setAnual] = useState(false)
  const pagos = PLANES.filter((p) => p.precioMensual > 0)
  const gratis = PLANES.find((p) => p.precioMensual === 0)
  const descuento = Math.round((1 - MESES_COBRADOS_EN_ANUAL / 12) * 100)
  return (
    <div className="flex flex-col items-center gap-10">
      <div role="radiogroup" aria-label="Forma de pago" className="flex rounded-full bg-superficie p-1 ring-1 ring-borde">
        {[
          [false, 'Mensual'],
          [true, 'Anual'],
        ].map(([valor, texto]) => (
          <button
            key={String(valor)}
            type="button"
            role="radio"
            aria-checked={anual === valor}
            onClick={() => setAnual(valor as boolean)}
            className="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium text-texto-2 aria-checked:bg-texto aria-checked:text-fondo-sitio"
          >
            {texto as string}
            {valor && (
              <span className="rounded-full bg-ok-suave px-1.5 py-px font-mono text-[11px] font-semibold text-ok">
                -{descuento}%
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="grid w-full gap-4 lg:grid-cols-3">
        {pagos.map((p) => {
          const mes = anual ? (p.precioMensual * MESES_COBRADOS_EN_ANUAL) / 12 : p.precioMensual
          const oscuro = p.destacado
          return (
            <div
              key={p.id}
              className={`relative flex flex-col gap-6 rounded-3xl p-7 ${
                oscuro ? 'bg-barra text-sobre-barra ring-2 ring-acento lg:-my-3 lg:py-10' : 'bg-superficie ring-1 ring-borde'
              }`}
            >
              {oscuro && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-acento px-3 py-0.5 text-xs font-bold text-sobre-acento">
                  El más elegido
                </span>
              )}
              <div>
                <h3 className="text-xl font-bold">Plan {p.nombre}</h3>
                <p className={`mt-1 text-sm ${oscuro ? 'text-sobre-barra-2' : 'text-texto-2'}`}>{p.lema}</p>
              </div>
              <div>
                <p className="flex items-baseline gap-1">
                  <span className={`text-lg ${oscuro ? 'text-sobre-barra-2' : 'text-texto-2'}`}>$</span>
                  <span className="font-mono text-5xl font-semibold tracking-tight">
                    {Math.round(mes).toLocaleString('es-AR')}
                  </span>
                </p>
                <p className={`mt-1 text-sm ${oscuro ? 'text-sobre-barra-2' : 'text-texto-2'}`}>por mes + IVA</p>
                <p className={`text-xs ${oscuro ? 'text-sobre-barra-2' : 'text-texto-3'}`}>
                  {anual
                    ? `${pesos(p.precioMensual * MESES_COBRADOS_EN_ANUAL)} por año: ${12 - MESES_COBRADOS_EN_ANUAL} meses de regalo`
                    : 'Sin permanencia'}
                </p>
              </div>
              <ul className="flex flex-col gap-2.5 text-sm">
                {[
                  `Hasta ${p.limites.usuarios} usuarios`,
                  p.limites.comprobantesMes
                    ? `${p.limites.comprobantesMes.toLocaleString('es-AR')} comprobantes por mes`
                    : 'Comprobantes sin límite',
                  `${p.limites.puntosVenta} puntos de venta`,
                  ...p.beneficios,
                ].map((b) => (
                  <li key={b} className="flex gap-2.5">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />
                    <span className={oscuro ? '' : 'text-texto-2'}>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-col items-center gap-2">
                <Link
                  href="/registro"
                  className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-full font-semibold transition ${
                    oscuro ? 'bg-acento text-sobre-acento hover:bg-acento-hover' : 'bg-texto text-fondo-sitio hover:bg-texto/85'
                  }`}
                >
                  Elegir {p.nombre} <ArrowRight aria-hidden className="size-4" />
                </Link>
                <span className={`text-xs ${oscuro ? 'text-sobre-barra-2' : 'text-texto-3'}`}>
                  Probalo gratis {DIAS_DE_PRUEBA} días
                </span>
              </div>
            </div>
          )
        })}
      </div>
      {gratis && (
        <div className="flex w-full flex-col items-center justify-between gap-4 rounded-3xl bg-superficie p-6 ring-1 ring-borde sm:flex-row">
          <div>
            <p className="font-bold">
              Plan {gratis.nombre} <span className="font-mono text-acento">$ 0</span>
            </p>
            <p className="text-sm text-texto-2">
              {gratis.lema} Hasta {gratis.limites.comprobantesMes} comprobantes por mes.
            </p>
          </div>
          <Link
            href="/registro"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 font-semibold ring-1 ring-borde-fuerte hover:bg-superficie-2"
          >
            Empezar gratis <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
