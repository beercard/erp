import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { obtenerAsiento } from '@/modulos/contabilidad/asientos'

import { pesos } from '../../../impuestos/periodo'
import { AnularAsiento } from '../../Formularios'
import { ORIGENES, rutaOrigen } from '../../origenes'

export const metadata: Metadata = { title: 'Asiento' }

const UUID = /^[0-9a-f-]{36}$/i

export default async function Asiento({ params }: PageProps<'/contabilidad/asientos/[id]'>) {
  const sesion = await exigirPermiso('contabilidad.ver')
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const a = await conEmpresa(sesion, (tx) => obtenerAsiento(tx, id))
  if (!a) notFound()
  const debe = a.lineas.reduce((s, l) => s + Number(l.debe), 0)
  const haber = a.lineas.reduce((s, l) => s + Number(l.haber), 0)
  const operacion = a.revierteId ? null : rutaOrigen(a.origen, a.origenId)
  return (
    <>
      <EncabezadoPagina
        titulo={`Asiento ${a.numero}`}
        bajada={
          <>
            {a.fecha.split('-').reverse().join('/')} · {a.concepto}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Chip tono={a.automatico ? 'neutro' : 'acento'}>{a.automatico ? 'Automático' : 'Manual'}</Chip>
        <Chip>{ORIGENES[a.origen]}</Chip>
        {operacion && (
          <Link href={operacion} className="text-acento hover:underline">
            Ver la operación
          </Link>
        )}
        {a.revierteId && (
          <Link href={`/contabilidad/asientos/${a.revierteId}`} className="text-acento hover:underline">
            Anula al asiento original
          </Link>
        )}
        {a.revertidoPor && (
          <Link href={`/contabilidad/asientos/${a.revertidoPor.id}`} className="text-acento hover:underline">
            Anulado por el asiento {a.revertidoPor.numero}
          </Link>
        )}
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-borde text-left text-xs text-texto-2">
            <tr>
              <th className="px-4 py-2 font-medium">Cuenta</th>
              <th className="px-4 py-2 font-medium">Detalle</th>
              <th className="px-4 py-2 text-right font-medium">Debe</th>
              <th className="px-4 py-2 text-right font-medium">Haber</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {a.lineas.map((l) => (
              <tr key={l.id}>
                <td className={`px-4 py-2 ${Number(l.haber) ? 'pl-10' : ''}`}>
                  <Link href={`/contabilidad/libros?vista=mayor&cuenta=${l.cuentaId}`} className="hover:underline">
                    <span className="cifras mr-2 text-texto-2">{l.codigo}</span>
                    {l.cuenta}
                  </Link>
                </td>
                <td className="px-4 py-2 text-texto-2">{[l.tercero, l.detalle].filter(Boolean).join(' · ')}</td>
                <td className="cifras px-4 py-2 text-right">{Number(l.debe) ? pesos(Number(l.debe)) : ''}</td>
                <td className="cifras px-4 py-2 text-right">{Number(l.haber) ? pesos(Number(l.haber)) : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-borde font-semibold">
            <tr>
              <td className="px-4 py-2" colSpan={2}>
                Totales
              </td>
              <td className="cifras px-4 py-2 text-right">{pesos(debe)}</td>
              <td className="cifras px-4 py-2 text-right">{pesos(haber)}</td>
            </tr>
          </tfoot>
        </table>
      </Panel>
      {!a.automatico && !a.revierteId && !a.revertidoPor && tienePermiso(sesion.permisos, 'contabilidad.asientos') && (
        <Panel className="mt-4 p-4">
          <h2 className="mb-2 text-sm font-semibold">Anular</h2>
          <AnularAsiento id={a.id} hoy={hoyArgentina()} />
        </Panel>
      )}
    </>
  )
}
