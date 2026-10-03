import { Check, Minus } from 'lucide-react'
import type { ReactNode } from 'react'

import { APLICACIONES, FUNCIONES, MESES_COBRADOS_EN_ANUAL, PLANES, planPorId, type Funcion, type Plan } from '@/lib/planes'

/** "$ 129.900" */
export const pesos = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`

/** Precio por mes según el ciclo: en el anual se pagan 10 meses de 12. */
export const precioDelCiclo = (mensual: number, ciclo: 'mensual' | 'anual') =>
  ciclo === 'anual' ? (mensual * MESES_COBRADOS_EN_ANUAL) / 12 : mensual

const FILAS: Funcion[] = ['facturacion', 'comercial', 'stock', 'compras', 'tesoreria', 'informes', 'roles', 'api']

const limite = (n: number | null, unidad: string) =>
  n === null ? `Sin límite de ${unidad.replace(/ por mes$/, '')}` : `${n.toLocaleString('es-AR')} ${unidad}`

/** Tarjetas de los planes (todos, o los que se pasen). El pie de cada una (botón) lo pone quien las usa. */
export function TarjetasPlanes({
  ciclo,
  actual,
  pie,
  planes = PLANES,
}: {
  ciclo: 'mensual' | 'anual'
  actual?: string
  pie: (plan: Plan) => ReactNode
  /** Los planes a mostrar (en el sitio, los tres pagos; el gratis va aparte). */
  planes?: Plan[]
}) {
  return (
    <div className={`grid gap-4 ${planes.length === 3 ? 'md:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
      {planes.map((p) => (
        <section
          key={p.id}
          className={`flex flex-col gap-4 rounded-lg border bg-superficie p-5 ${
            p.id === actual ? 'border-acento ring-1 ring-acento' : p.destacado ? 'border-acento/60' : 'border-borde'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">{p.nombre}</h3>
            {p.id === actual ? (
              <span className="rounded-full bg-acento px-2 py-0.5 text-xs font-medium text-sobre-acento">Tu plan</span>
            ) : p.destacado ? (
              <span className="rounded-full bg-acento-suave px-2 py-0.5 text-xs font-medium text-acento">El más elegido</span>
            ) : null}
          </div>
          <p className="min-h-10 text-sm text-texto-2">{p.lema}</p>
          <div>
            <span className="cifras text-3xl font-semibold">
              {p.precioMensual ? pesos(precioDelCiclo(p.precioMensual, ciclo)) : 'Gratis'}
            </span>
            {p.precioMensual > 0 && <span className="text-sm text-texto-2"> /mes + IVA</span>}
            {p.precioMensual > 0 && ciclo === 'anual' && (
              <span className="block text-xs text-texto-3">{pesos(p.precioMensual * MESES_COBRADOS_EN_ANUAL)} por año</span>
            )}
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            <li>{limite(p.limites.usuarios, p.limites.usuarios === 1 ? 'usuario' : 'usuarios')}</li>
            <li>{limite(p.limites.comprobantesMes, 'comprobantes con CAE por mes')}</li>
            <li>{limite(p.limites.puntosVenta, p.limites.puntosVenta === 1 ? 'punto de venta' : 'puntos de venta')}</li>
          </ul>
          <ul className="flex flex-col gap-1.5 border-t border-borde pt-3 text-sm">
            {p.funciones.map((f) => (
              <li key={f} className="flex gap-2">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />
                {FUNCIONES[f].nombre}
              </li>
            ))}
            {p.beneficios.map((b) => (
              <li key={b} className="flex gap-2 text-texto-2">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-texto-3" />
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-2">{pie(p)}</div>
        </section>
      ))}
    </div>
  )
}

/** Tabla comparativa de funciones por plan. */
export function ComparativaPlanes() {
  return (
    <div className="overflow-x-auto tarjeta">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-borde text-left text-xs text-texto-2">
          <tr>
            <th className="px-4 py-3 font-medium">Incluye</th>
            {PLANES.map((p) => (
              <th key={p.id} className="px-4 py-3 text-center font-medium">
                {p.nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {FILAS.map((f) => (
            <tr key={f}>
              <td className="px-4 py-2.5">
                <span className="font-medium">{FUNCIONES[f].nombre}</span>
                <span className="block text-xs text-texto-3">{FUNCIONES[f].detalle}</span>
              </td>
              {PLANES.map((p) => (
                <td key={p.id} className="px-4 py-2.5 text-center">
                  {p.funciones.includes(f) ? (
                    <Check aria-label="Incluido" className="mx-auto size-4 text-ok" />
                  ) : (
                    <Minus aria-label="No incluido" className="mx-auto size-4 text-texto-3" />
                  )}
                </td>
              ))}
            </tr>
          ))}
          {APLICACIONES.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-2.5">
                <span className="font-medium">{FUNCIONES[a.id].nombre}</span>
                <span className="block text-xs text-texto-3">Aplicación aparte: {pesos(a.precioMensual)} /mes + IVA</span>
              </td>
              {PLANES.map((p) => (
                <td key={p.id} className="px-4 py-2.5 text-center text-xs text-texto-2">
                  {!a.disponible ? 'Pronto' : PLANES.indexOf(p) >= PLANES.indexOf(planPorId(a.desde)) ? 'Opcional' : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
