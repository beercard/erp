/**
 * Fechas de negocio en hora de Argentina. El servidor y la base trabajan en
 * UTC: después de las 21 h el "hoy" de UTC ya es mañana, y un precio o un
 * vencimiento se adelantaría un día. Toda fecha de negocio sale de acá.
 */
const ZONA = 'America/Argentina/Buenos_Aires'
const iso = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' })

/** "2026-10-01" según el calendario de Argentina. */
export function hoyArgentina(ahora: Date = new Date()): string {
  return iso.format(ahora)
}

/** "2026-10-01" → "01/10/2026". */
export function fechaCorta(fechaIso: string): string {
  const [a, m, d] = fechaIso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** Suma días a una fecha ISO (sin horas). */
export function sumarDias(fechaIso: string, dias: number): string {
  const f = new Date(`${fechaIso}T12:00:00Z`)
  f.setUTCDate(f.getUTCDate() + dias)
  return f.toISOString().slice(0, 10)
}
