import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel, Vacio } from '@/components/ui'
import { listarAuditoria } from '@/modulos/plataforma/consola'

import { exigirAdmin } from '../admin'
import { ETIQUETA_ACCION, fechaHora } from '../componentes'

export const metadata: Metadata = { title: 'Auditoría · Plataforma' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Detalle corto de una acción: lo que más sirve para saber qué cambió. */
function resumen(detalle: Record<string, unknown> | null) {
  if (!detalle) return ''
  return Object.entries(detalle)
    .filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ')
}

export default async function Auditoria({ searchParams }: PageProps<'/plataforma/auditoria'>) {
  await exigirAdmin()
  const { empresa } = (await searchParams) as { empresa?: string }
  const empresaId = empresa && UUID.test(empresa) ? empresa : undefined
  const filas = await listarAuditoria({ empresaId, limite: 300 })

  return (
    <>
      <EncabezadoPagina
        titulo="Auditoría"
        bajada={
          empresaId ? (
            <>
              Lo que hizo la plataforma sobre {filas[0]?.empresa ?? 'esta empresa'}.{' '}
              <Link href="/plataforma/auditoria" className="text-acento hover:underline">
                Ver todo
              </Link>
            </>
          ) : (
            'Todo lo que hacen quienes administran la plataforma: cambios de plan, pagos, suspensiones, accesos de soporte y usuarios.'
          )
        }
      />
      <Panel className="overflow-x-auto">
        {filas.length === 0 ? (
          <Vacio titulo="Todavía no hay acciones registradas" />
        ) : (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Quién</th>
                <th className="px-4 py-2 font-medium">Qué hizo</th>
                <th className="px-4 py-2 font-medium">Sobre</th>
                <th className="px-4 py-2 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((a) => (
                <tr key={a.id} className="align-top">
                  <td className="cifras px-4 py-2 text-xs whitespace-nowrap text-texto-2">
                    {fechaHora(a.creado)}
                    {a.ip && <span className="block text-texto-3">{a.ip}</span>}
                  </td>
                  <td className="px-4 py-2">
                    {a.usuario ?? '—'}
                    <span className="block text-xs text-texto-3">{a.email}</span>
                  </td>
                  <td className="px-4 py-2">{ETIQUETA_ACCION[a.accion] ?? a.accion}</td>
                  <td className="px-4 py-2">
                    {a.empresaId && (
                      <Link href={`/plataforma/empresas/${a.empresaId}`} className="hover:text-acento">
                        {a.empresa}
                      </Link>
                    )}
                    {a.sobreUsuario && <span className="block text-xs text-texto-2">{a.sobreUsuario}</span>}
                  </td>
                  <td className="max-w-sm px-4 py-2 text-xs break-words text-texto-3">{resumen(a.detalle)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  )
}
