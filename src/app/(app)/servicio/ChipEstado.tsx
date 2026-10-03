import { Chip } from '@/components/ui'
import { AYUDA_ESTADOS, ESTADOS_ORDEN, situacionSla, TEXTO_SLA, type EstadoOrden, type EstadoSla } from '@/modulos/servicio/tipos'

/** Colores de estado como en el calendario de Persat. */
export const TONO_ESTADO: Record<EstadoOrden, 'aviso' | 'info' | 'ok' | 'error' | 'neutro' | 'acento'> = {
  pendiente: 'neutro',
  proyectada: 'info',
  asignada: 'info',
  informe: 'acento',
  vencida: 'error',
  cerrada_ok: 'ok',
  cerrada_desvio: 'aviso',
  cerrada_no_cumplida: 'error',
  cancelada: 'neutro',
}

/** Estado de la orden; una hecha con cargo dice si falta facturarla. */
export function ChipEstado({
  estado,
  cobertura,
  facturada,
  migrada = false,
}: {
  estado: string
  cobertura: string
  facturada: boolean
  /** Cerrada en Persat: se facturó en el sistema anterior. */
  migrada?: boolean
}) {
  const e = estado as EstadoOrden
  const texto = ESTADOS_ORDEN[e] ?? estado
  const porFacturar = !migrada && (e === 'cerrada_ok' || e === 'cerrada_desvio') && cobertura === 'cargo'
  return (
    <span title={AYUDA_ESTADOS[e]} className="inline-flex flex-wrap gap-1">
      <Chip tono={TONO_ESTADO[e] ?? 'neutro'}>{texto}</Chip>
      {porFacturar && (facturada ? <Chip tono="ok">Facturada</Chip> : <Chip tono="acento">A facturar</Chip>)}
    </span>
  )
}

const TONO_SLA: Record<EstadoSla, 'ok' | 'aviso' | 'error' | 'neutro'> = {
  en_termino: 'neutro',
  por_vencer: 'aviso',
  vencido: 'error',
  cumplido: 'ok',
  incumplido: 'error',
}

const hora = (d: Date) =>
  d.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

/**
 * Situación del SLA de una orden. En el listado (compacto) solo aparece si
 * pide atención: por vencer, vencido o fuera de término.
 */
export function ChipSla({ o, compacto = false }: { o: Parameters<typeof situacionSla>[0]; compacto?: boolean }) {
  const s = situacionSla(o)
  const filas = [
    { nombre: 'Respuesta', estado: s.respuesta, limite: o.slaRespuesta },
    { nombre: 'Resolución', estado: s.resolucion, limite: o.slaResolucion },
  ].filter((f) => f.estado && (!compacto || ['por_vencer', 'vencido', 'incumplido'].includes(f.estado)))
  if (!filas.length) return null
  return (
    <span className="inline-flex flex-wrap gap-1">
      {filas.map((f) => (
        <span key={f.nombre} title={f.limite ? `${f.nombre} hasta el ${hora(f.limite)}` : undefined}>
          <Chip tono={TONO_SLA[f.estado!]}>
            {f.nombre}: {TEXTO_SLA[f.estado!].toLowerCase()}
            {!compacto && f.limite && (f.estado === 'en_termino' || f.estado === 'por_vencer')
              ? ` · hasta ${hora(f.limite)}`
              : ''}
          </Chip>
        </span>
      ))}
    </span>
  )
}
