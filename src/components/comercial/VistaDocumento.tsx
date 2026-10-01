import { Chip } from '@/components/ui'
import { formatearMonto } from '@/lib/dinero'
import { calcularTotales, TASAS_IVA } from '@/modulos/comercial/calculo'

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$', '060': '€' }

export type ItemVista = {
  id: string
  descripcion: string
  cantidad: string
  precioUnitario: string
  descuento: string
  alicuotaIva: number
  neto: string
  cantidadEntregada?: string
}

const cantidad = (v: string) => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 4 })

/** Renglones y totales de un presupuesto o pedido (pantalla e impresión). */
export function VistaDocumento({ moneda, items, entregas = false }: { moneda: string; items: ItemVista[]; entregas?: boolean }) {
  const simbolo = SIMBOLO[moneda] ?? moneda
  const { totales } = calcularTotales(items.map((i) => ({ ...i })))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-borde text-left text-xs text-texto-2">
            <th className="px-3 py-2 font-medium">Descripción</th>
            <th className="px-3 py-2 text-right font-medium">Cantidad</th>
            {entregas && <th className="px-3 py-2 text-right font-medium">Entregado</th>}
            <th className="px-3 py-2 text-right font-medium">Precio unit.</th>
            <th className="px-3 py-2 text-right font-medium">Desc.</th>
            <th className="px-3 py-2 text-right font-medium">IVA</th>
            <th className="px-3 py-2 text-right font-medium">Subtotal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {items.map((i) => {
            const pendiente = entregas ? Number(i.cantidad) - Number(i.cantidadEntregada ?? 0) : 0
            return (
              <tr key={i.id}>
                <td className="px-3 py-2">{i.descripcion}</td>
                <td className="cifras px-3 py-2 text-right">{cantidad(i.cantidad)}</td>
                {entregas && (
                  <td className="cifras px-3 py-2 text-right">
                    {cantidad(i.cantidadEntregada ?? '0')}
                    {pendiente > 0 && <span className="ml-1 text-xs text-aviso">(faltan {cantidad(String(pendiente))})</span>}
                  </td>
                )}
                <td className="cifras px-3 py-2 text-right whitespace-nowrap">{formatearMonto(i.precioUnitario, simbolo)}</td>
                <td className="cifras px-3 py-2 text-right">{Number(i.descuento) ? `${cantidad(i.descuento)} %` : '—'}</td>
                <td className="cifras px-3 py-2 text-right">{TASAS_IVA[i.alicuotaIva]?.replace('.', ',')} %</td>
                <td className="cifras px-3 py-2 text-right whitespace-nowrap">{formatearMonto(i.neto, simbolo)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <dl className="cifras ml-auto flex max-w-xs flex-col gap-1 border-t border-borde px-3 py-3 text-sm">
        <div className="flex justify-between">
          <dt className="font-sans text-texto-2">Neto</dt>
          <dd>{formatearMonto(totales.neto, simbolo)}</dd>
        </div>
        {totales.porAlicuota
          .filter((a) => Number(a.iva) !== 0)
          .map((a) => (
            <div key={a.alicuotaIva} className="flex justify-between text-texto-2">
              <dt className="font-sans">IVA {TASAS_IVA[a.alicuotaIva].replace('.', ',')} %</dt>
              <dd>{formatearMonto(a.iva, simbolo)}</dd>
            </div>
          ))}
        <div className="mt-1 flex justify-between border-t border-borde pt-2 text-base font-medium">
          <dt className="font-sans">Total</dt>
          <dd>{formatearMonto(totales.total, simbolo)}</dd>
        </div>
      </dl>
    </div>
  )
}

const TONO: Record<string, 'neutro' | 'info' | 'ok' | 'error' | 'aviso' | 'acento'> = {
  borrador: 'neutro',
  enviado: 'info',
  aceptado: 'ok',
  rechazado: 'error',
  pendiente: 'aviso',
  parcial: 'info',
  entregado: 'ok',
  cancelado: 'neutro',
  emitido: 'ok',
  anulado: 'error',
}

export function ChipEstado({ estado }: { estado: string }) {
  return <Chip tono={TONO[estado] ?? 'neutro'}>{estado.charAt(0).toUpperCase() + estado.slice(1)}</Chip>
}
