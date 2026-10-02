/**
 * La jornada de un técnico un día dado: la semanal (días y horario de su
 * ficha) con las excepciones de ese día. Sin dependencias de la base: la usan
 * el asistente de huecos y el calendario (en el navegador).
 *
 * Prioridad: lo cargado para el técnico manda sobre lo general (un feriado
 * vale para todos salvo que el técnico tenga un horario especial ese día); un
 * horario especial hace trabajar aunque sea fin de semana.
 */

export type Excepcion = {
  tecnicoId: string | null
  desde: string
  hasta: string
  tipo: string
  jornadaDesde: string | null
  jornadaHasta: string | null
  motivo: string
}

export type TecnicoJornada = { id: string; dias: string; jornadaDesde: string; jornadaHasta: string }

export type JornadaDia = { trabaja: boolean; desde: string; hasta: string; motivo: string | null; especial: boolean }

/** 1 = lunes … 7 = domingo. */
const diaSemana = (fecha: string) => {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d
}

export function jornadaDelDia(t: TecnicoJornada, fecha: string, excepciones: Excepcion[]): JornadaDia {
  const delDia = excepciones.filter((e) => e.desde <= fecha && e.hasta >= fecha)
  const propia = delDia.find((e) => e.tecnicoId === t.id)
  const general = delDia.find((e) => e.tecnicoId === null)
  const e = propia ?? general
  const normal = { desde: t.jornadaDesde, hasta: t.jornadaHasta }
  if (e?.tipo === 'ausencia') return { trabaja: false, ...normal, motivo: e.motivo, especial: true }
  if (e?.tipo === 'horario' && e.jornadaDesde && e.jornadaHasta)
    return { trabaja: true, desde: e.jornadaDesde, hasta: e.jornadaHasta, motivo: e.motivo, especial: true }
  return { trabaja: t.dias.includes(String(diaSemana(fecha))), ...normal, motivo: null, especial: false }
}
