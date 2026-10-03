import { hoyArgentina } from '@/lib/fechas'

const PERIODO = /^[0-9]{4}-(0[1-9]|1[0-2])$/

/** El período pedido o, si no, el mes anterior (el que se suele presentar). */
export function periodoPedido(v: string | undefined) {
  if (v && PERIODO.test(v)) return v
  return moverPeriodo(hoyArgentina().slice(0, 7), -1)
}

export function moverPeriodo(periodo: string, n: number) {
  const [a, m] = periodo.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export const nombrePeriodo = (periodo: string) =>
  new Date(`${periodo}-15T12:00:00Z`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export const pesos = (n: number) =>
  (Object.is(n, -0) || Math.abs(n) < 0.005 ? 0 : n).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
