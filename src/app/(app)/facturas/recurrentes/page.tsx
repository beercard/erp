import { Plus, Repeat } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EnlaceAyuda } from '@/components/ayuda/EnlaceAyuda'
import { Aviso, BotonEnlace, Chip, EncabezadoPagina, Panel, Vacio } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { fechaCorta } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { listarRecurrentes } from '@/modulos/facturacion/automatica'

export const metadata: Metadata = { title: 'Facturas recurrentes' }

const CADA: Record<number, string> = { 1: 'Mensual', 2: 'Bimestral', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' }
const TASA: Record<number, number> = { 5: 21, 4: 10.5, 6: 27, 8: 5, 9: 2.5, 3: 0 }
const pesos = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })

export default async function Recurrentes({ searchParams }: PageProps<'/facturas/recurrentes'>) {
  const { guardada } = await searchParams
  const sesion = await requerirEmpresa()
  const filas = await enLaEmpresa('ventas.ver', (tx) => listarRecurrentes(tx))
  const puede = tienePermiso(sesion.permisos, 'ventas.facturar')
  return (
    <>
      <EncabezadoPagina
        titulo="Facturas recurrentes"
        bajada="Abonos y servicios que se facturan solos cada mes (o cada 2, 3, 6 o 12): se arman el día que toca, se autorizan en ARCA y le llegan al cliente por email."
        acciones={
          <div className="flex gap-2">
            <EnlaceAyuda guia="facturacion-automatica" />
            {puede && (
              <BotonEnlace href="/facturas/recurrentes/nueva" variante="primario">
                <Plus aria-hidden className="size-4" /> Nueva recurrente
              </BotonEnlace>
            )}
          </div>
        }
      />
      {guardada && (
        <div className="mb-4">
          <Aviso tono="ok">Guardada. Se factura sola en la fecha indicada (desde las 7 de la mañana).</Aviso>
        </div>
      )}
      <Panel className="overflow-x-auto">
        {!filas.length ? (
          <Vacio icono={Repeat} titulo="Todavía no hay facturas recurrentes">
            Cargá los abonos de tus clientes una vez y olvidate de facturarlos todos los meses.
          </Vacio>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium">Nombre</th>
                <th className="px-4 py-2.5 font-medium">Frecuencia</th>
                <th className="px-4 py-2.5 font-medium">Próxima</th>
                <th className="px-4 py-2.5 text-right font-medium">Importe</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => {
                const total = r.renglones.reduce(
                  (s, i) => s + Number(i.cantidad) * Number(i.precioUnitario) * (1 + (TASA[i.alicuotaIva] ?? 0) / 100),
                  0,
                )
                return (
                  <tr key={r.id} className="border-b border-borde last:border-0 hover:bg-superficie-2/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/facturas/recurrentes/${r.id}`} className="font-medium hover:text-acento">
                        {r.cliente}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-texto-2">{r.nombre}</td>
                    <td className="px-4 py-2.5">{CADA[r.cadaMeses]}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.activa ? fechaCorta(r.proxima) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{pesos(total)}</td>
                    <td className="px-4 py-2.5">
                      {r.ultimoError ? (
                        <span title={r.ultimoError}>
                          <Chip tono="error">Con error</Chip>
                        </span>
                      ) : r.activa ? (
                        <Chip tono="ok">{r.autorizar ? (r.enviar ? 'Factura y envía' : 'Factura sola') : 'Deja borrador'}</Chip>
                      ) : (
                        <Chip>Pausada</Chip>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  )
}
