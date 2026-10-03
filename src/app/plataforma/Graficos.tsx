'use client'

import { useState } from 'react'

type Punto = { mes: string; valor: number }

const nombreMes = (mes: string, largo = false) => {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString('es-AR', {
    month: largo ? 'long' : 'short',
    year: largo ? 'numeric' : undefined,
    timeZone: 'UTC',
  })
}

/**
 * Tope del eje: un número "limpio" (1, 2, 2,5 o 5 por potencia de 10) con
 * aire sobre el máximo para el rótulo. Para cantidades, entero y como mínimo 2.
 */
function topeLimpio(max: number, enteros: boolean) {
  const objetivo = max * 1.15
  if (objetivo <= 0) return enteros ? 2 : 1
  const p = 10 ** Math.floor(Math.log10(objetivo))
  for (const f of enteros ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]) {
    const tope = f * p
    if (tope >= objetivo && (!enteros || (Number.isInteger(tope) && tope >= 2))) return tope
  }
  return Math.max(10 * p, enteros ? 2 : 0)
}

const compacto = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
    : n >= 1_000
      ? `${(n / 1_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} mil`
      : n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

/**
 * Columnas por mes, una sola serie (el título dice qué es: no lleva leyenda).
 * Barras finas con la punta redondeada sobre una línea de base, rótulo solo en
 * el máximo y en el mes actual, el valor de cada mes al pasar o con el
 * teclado, y la tabla con todos los valores debajo.
 */
export function ColumnasMes({ titulo, datos, pesos = false }: { titulo: string; datos: Punto[]; pesos?: boolean }) {
  const [activo, setActivo] = useState<number | null>(null)
  const formato = (n: number) => (pesos ? `$ ${Math.round(n).toLocaleString('es-AR')}` : n.toLocaleString('es-AR'))
  const max = Math.max(0, ...datos.map((d) => d.valor))
  const tope = topeLimpio(max, !pesos)
  // Rejilla en 0, la mitad (si es un valor que se puede leer) y el tope.
  const marcas = !pesos && !Number.isInteger(tope / 2) ? [1, 0] : [1, 0.5, 0]
  const iMax = max > 0 ? datos.findIndex((d) => d.valor === max) : -1
  const ultimo = datos.length - 1
  const total = datos.reduce((t, d) => t + d.valor, 0)

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{titulo}</span>
        <span className="text-xs text-texto-2">
          12 meses: <span className="cifras font-medium text-texto">{formato(total)}</span>
        </span>
      </figcaption>

      {max === 0 ? (
        <p className="grid h-44 place-items-center rounded-lg bg-superficie-2/60 text-sm text-texto-3">
          Sin movimientos en los últimos 12 meses.
        </p>
      ) : (
        <div className="relative mt-2 h-44 pl-14" onPointerLeave={() => setActivo(null)}>
          {marcas.map((f) => (
            <div key={f} className="pointer-events-none absolute inset-x-0 flex items-center" style={{ bottom: `${f * 100}%` }}>
              <span className="cifras w-13 pr-2 text-right text-[11px] whitespace-nowrap text-texto-3">{compacto(tope * f)}</span>
              <span className={`h-px flex-1 ${f === 0 ? 'bg-borde-fuerte' : 'bg-borde'}`} />
            </div>
          ))}
          <div className="absolute inset-y-0 right-0 left-14 flex items-end">
            {datos.map((d, i) => {
              const alto = (d.valor / tope) * 100
              const rotulo = (i === iMax || i === ultimo) && d.valor > 0
              return (
                <button
                  key={d.mes}
                  type="button"
                  onPointerEnter={() => setActivo(i)}
                  onFocus={() => setActivo(i)}
                  onBlur={() => setActivo(null)}
                  aria-label={`${nombreMes(d.mes, true)}: ${formato(d.valor)}`}
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                >
                  {rotulo && (
                    <span
                      className="cifras pointer-events-none absolute text-[11px] font-medium whitespace-nowrap text-texto-2"
                      style={{ bottom: `calc(${alto}% + 4px)` }}
                    >
                      {compacto(d.valor)}
                    </span>
                  )}
                  <span
                    className={`block w-[min(24px,70%)] rounded-t-[4px] transition-[filter] ${
                      activo === i ? 'bg-acento-hover' : 'bg-acento'
                    } group-focus-visible:ring-2 group-focus-visible:ring-anillo`}
                    style={{ height: d.valor > 0 ? `max(${alto}%, 2px)` : '0' }}
                  />
                </button>
              )
            })}
          </div>
          {activo !== null && (
            <div
              role="status"
              className={`pointer-events-none absolute -top-2 z-10 -translate-y-full rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-xs whitespace-nowrap shadow-flotante ${
                // En los extremos se alinea hacia adentro para no salirse del panel.
                activo < 2 ? '-translate-x-4' : activo > datos.length - 3 ? '-translate-x-[calc(100%-1rem)]' : '-translate-x-1/2'
              }`}
              style={{ left: `calc(3.5rem + (100% - 3.5rem) * ${(activo + 0.5) / datos.length})` }}
            >
              <span className="cifras block text-sm font-semibold">{formato(datos[activo].valor)}</span>
              <span className="text-texto-2 first-letter:uppercase">{nombreMes(datos[activo].mes, true)}</span>
            </div>
          )}
        </div>
      )}
      <div className="flex pl-14" aria-hidden>
        {datos.map((d) => (
          // En el celular, un mes sí y uno no: no entran los doce.
          <span key={d.mes} className="flex-1 text-center text-[11px] text-texto-3 max-sm:odd:invisible">
            {nombreMes(d.mes).replace('.', '')}
          </span>
        ))}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-texto-2 hover:text-texto">Ver como tabla</summary>
        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-texto-2">
            <tr>
              <th className="py-1 font-medium">Mes</th>
              <th className="py-1 text-right font-medium">{pesos ? 'Importe' : 'Cantidad'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {datos.map((d) => (
              <tr key={d.mes}>
                <td className="py-1 first-letter:uppercase">{nombreMes(d.mes, true)}</td>
                <td className="cifras py-1 text-right">{formato(d.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

/** Barras horizontales de una sola serie (cantidad por categoría), con el valor en la punta. */
export function BarrasHorizontales({ datos }: { datos: { texto: string; valor: number }[] }) {
  const max = Math.max(1, ...datos.map((d) => d.valor))
  return (
    <ul className="flex flex-col gap-2.5">
      {datos.map((d) => (
        <li key={d.texto} className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 text-sm">
          <span className="truncate text-texto-2">{d.texto}</span>
          <span className="flex items-center gap-2">
            <span
              className="block h-3 rounded-r-[4px] bg-acento"
              style={{ width: d.valor ? `max(${(d.valor / max) * 85}%, 3px)` : '0' }}
              title={`${d.texto}: ${d.valor}`}
            />
            <span className="cifras text-xs font-medium">{d.valor}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
