import { FilePlus2 } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { listarAsientos } from '@/modulos/contabilidad/libros'
import { configuracionContableDe } from '@/modulos/contabilidad/plan'

import { pesos } from '../../impuestos/periodo'
import { ORIGENES, rangoPedido } from '../origenes'

export const metadata: Metadata = { title: 'Asientos' }

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm'

export default async function Asientos({ searchParams }: PageProps<'/contabilidad/asientos'>) {
  const sesion = await exigirPermiso('contabilidad.ver')
  const p = (await searchParams) as { desde?: string; hasta?: string; origen?: string; q?: string }
  const { desde, hasta } = rangoPedido(p, hoyArgentina())
  const origen = p.origen && ORIGENES[p.origen] ? p.origen : null
  const lista = await conEmpresa(sesion, async (tx) =>
    (await configuracionContableDe(tx)) ? listarAsientos(tx, { desde, hasta, origen, q: p.q }) : null,
  )
  if (!lista) redirect('/contabilidad')
  return (
    <>
      <EncabezadoPagina
        titulo="Asientos"
        bajada="Los automáticos salen de las operaciones (se anulan anulando la operación); los manuales se anulan con un contraasiento."
        acciones={
          tienePermiso(sesion.permisos, 'contabilidad.asientos') && (
            <BotonEnlace href="/contabilidad/asientos/nuevo" variante="primario">
              <FilePlus2 aria-hidden className="size-4" /> Asiento manual
            </BotonEnlace>
          )
        }
      />
      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-texto-2">Desde</span>
          <input type="date" name="desde" defaultValue={desde} className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-texto-2">Hasta</span>
          <input type="date" name="hasta" defaultValue={hasta} className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-texto-2">Origen</span>
          <select name="origen" defaultValue={origen ?? ''} className={control}>
            <option value="">Todos</option>
            {Object.entries(ORIGENES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-texto-2">Buscar</span>
          <input name="q" defaultValue={p.q ?? ''} placeholder="Concepto o número" className={control} />
        </label>
        <button className="h-9 rounded-md border border-borde px-3 hover:bg-superficie-2">Filtrar</button>
      </form>
      <Panel className="overflow-x-auto">
        {lista.length ? (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">N.º</th>
                <th className="px-4 py-2 font-medium">Concepto</th>
                <th className="px-4 py-2 font-medium">Origen</th>
                <th className="px-4 py-2 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {lista.map((a) => (
                <tr key={a.id} className={a.revertido || a.revierteId ? 'text-texto-2' : ''}>
                  <td className="px-4 py-2 whitespace-nowrap">{a.fecha.split('-').reverse().join('/')}</td>
                  <td className="cifras px-4 py-2">{a.numero}</td>
                  <td className="px-4 py-2">
                    <Link href={`/contabilidad/asientos/${a.id}`} className="hover:underline">
                      {a.concepto}
                    </Link>
                    {a.revertido && <span className="ml-2 text-xs">(anulado)</span>}
                  </td>
                  <td className="px-4 py-2">
                    <Chip tono={a.revierteId ? 'aviso' : a.automatico ? 'neutro' : 'acento'}>
                      {a.revierteId ? 'Contraasiento' : ORIGENES[a.origen]}
                    </Chip>
                  </td>
                  <td className="cifras px-4 py-2 text-right">{pesos(a.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-3 text-sm text-texto-2">No hay asientos con esos filtros.</p>
        )}
      </Panel>
    </>
  )
}
