import { Chip } from '@/components/ui'
import { ESTADOS_ORDEN } from '@/modulos/servicio/tipos'

const TONO = { pendiente: 'aviso', asignada: 'info', resuelta: 'ok', cancelada: 'neutro' } as const

/** Estado de la orden; una resuelta con cargo dice si falta facturarla. */
export function ChipEstado({ estado, cobertura, facturada }: { estado: string; cobertura: string; facturada: boolean }) {
  const e = estado as keyof typeof ESTADOS_ORDEN
  if (e === 'resuelta' && cobertura === 'cargo') {
    return facturada ? <Chip tono="ok">Facturada</Chip> : <Chip tono="acento">Resuelta · a facturar</Chip>
  }
  return <Chip tono={TONO[e] ?? 'neutro'}>{ESTADOS_ORDEN[e] ?? estado}</Chip>
}
