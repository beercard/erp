import { Chip } from '@/components/ui'
import { AYUDA_ESTADOS, ESTADOS_ORDEN, type EstadoOrden } from '@/modulos/servicio/tipos'

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
export function ChipEstado({ estado, cobertura, facturada }: { estado: string; cobertura: string; facturada: boolean }) {
  const e = estado as EstadoOrden
  const texto = ESTADOS_ORDEN[e] ?? estado
  const porFacturar = (e === 'cerrada_ok' || e === 'cerrada_desvio') && cobertura === 'cargo'
  return (
    <span title={AYUDA_ESTADOS[e]} className="inline-flex flex-wrap gap-1">
      <Chip tono={TONO_ESTADO[e] ?? 'neutro'}>{texto}</Chip>
      {porFacturar && (facturada ? <Chip tono="ok">Facturada</Chip> : <Chip tono="acento">A facturar</Chip>)}
    </span>
  )
}
