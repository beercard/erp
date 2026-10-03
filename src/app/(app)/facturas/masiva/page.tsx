import { Download } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { listarLotes } from '@/modulos/facturacion/automatica'

import { opcionesRecurrente } from '../recurrentes/datos'
import { SubirPlanilla } from './Subir'

export const metadata: Metadata = { title: 'Facturación masiva' }

const ESTADO: Record<string, { texto: string; tono: 'ok' | 'aviso' | 'neutro' }> = {
  preparado: { texto: 'Armado', tono: 'neutro' },
  autorizando: { texto: 'Autorizando', tono: 'aviso' },
  terminado: { texto: 'Terminado', tono: 'ok' },
}

export default async function FacturacionMasiva() {
  await exigirPermiso('ventas.facturar')
  const [lotes, o] = await enLaEmpresa('ventas.facturar', (tx) => Promise.all([listarLotes(tx), opcionesRecurrente(tx)]))
  return (
    <>
      <EncabezadoPagina
        titulo="Facturación masiva"
        bajada="Subí una planilla con muchas facturas: se revisan, se arman, se autorizan en ARCA y les llegan a tus clientes. Hasta 500 por planilla."
        acciones={
          <Link
            download
            prefetch={false}
            href="/facturas/masiva/modelo"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-acento hover:underline"
          >
            <Download aria-hidden className="size-4" /> Bajar la planilla modelo
          </Link>
        }
      />
      {!o.puntosVenta.length ? (
        <Aviso tono="aviso">
          No hay puntos de venta de factura electrónica. Cargá uno en Configuración → Puntos de venta (tipo electrónico).
        </Aviso>
      ) : (
        <SubirPlanilla puntosVenta={o.puntosVenta} />
      )}
      {!!lotes.length && (
        <Panel className="mt-6 overflow-x-auto">
          <h2 className="border-b border-borde px-4 py-3 font-semibold">Lotes anteriores</h2>
          <table className="w-full text-sm">
            <tbody>
              {lotes.map((l) => (
                <tr key={l.id} className="border-b border-borde last:border-0 hover:bg-superficie-2/60">
                  <td className="px-4 py-2.5">
                    <Link href={`/facturas/masiva/${l.id}`} className="font-medium hover:text-acento">
                      {l.nombre}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-texto-2 tabular-nums">
                    {l.cantidad} {l.cantidad === 1 ? 'factura' : 'facturas'}
                  </td>
                  <td className="px-4 py-2.5 text-texto-2 tabular-nums">
                    {new Date(l.creado).toLocaleString('es-AR', {
                      timeZone: 'America/Argentina/Buenos_Aires',
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    <Chip tono={ESTADO[l.estado].tono}>{ESTADO[l.estado].texto}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  )
}
