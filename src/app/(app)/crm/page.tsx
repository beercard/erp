import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonEnlace, EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { responsables, tablero } from '@/modulos/crm/crm'

import { pesosServidor } from './formato'
import { Embudo } from './Embudo'

export const metadata: Metadata = { title: 'Embudo de ventas' }

export default async function PaginaEmbudo({ searchParams }: PageProps<'/crm'>) {
  const sesion = await exigirPermiso('crm.ver')
  const { q, resp } = await searchParams
  const texto = typeof q === 'string' ? q : ''
  const quien = typeof resp === 'string' ? resp : ''
  const responsableId = quien === 'mias' ? sesion.usuario.id : quien || null
  const [columnas, personas] = await enLaEmpresa('crm.ver', async (tx) => [
    await tablero(tx, { q: texto, responsableId }),
    await responsables(tx, sesion.empresa.id),
  ])
  const abiertas = columnas.flatMap((c) => c.oportunidades.filter((o) => o.estado === 'abierta'))
  const embudo = abiertas.reduce((s, o) => s + Number(o.ingresoEsperado), 0)
  const ponderado = abiertas.reduce((s, o) => s + (Number(o.ingresoEsperado) * o.probabilidad) / 100, 0)
  const vencidas = abiertas.filter((o) => o.proxima?.estado === 'vencida').length
  const editar = tienePermiso(sesion.permisos, 'crm.oportunidades')
  const enlace = (r: string) => `/crm?${new URLSearchParams({ ...(texto ? { q: texto } : {}), ...(r ? { resp: r } : {}) })}`

  return (
    <>
      <EncabezadoPagina
        titulo="Embudo de ventas"
        bajada={
          <>
            {abiertas.length} abiertas · <span className="cifras font-medium text-texto">{pesosServidor(embudo)}</span> en juego ·{' '}
            <span className="cifras">{pesosServidor(ponderado)}</span> ponderado
            {vencidas > 0 && <span className="text-error"> · {vencidas} con actividad vencida</span>}
          </>
        }
        acciones={
          editar && (
            <BotonEnlace href="/crm/nueva" variante="primario">
              <Plus aria-hidden /> Nueva oportunidad
            </BotonEnlace>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form role="search" className="w-full max-w-sm">
          {quien && <input type="hidden" name="resp" value={quien} />}
          <label htmlFor="q" className="sr-only">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            defaultValue={texto}
            placeholder="Oportunidad, cliente o email, y Enter"
            className="h-9 w-full rounded-lg border border-borde-fuerte/80 bg-superficie px-3 text-sm shadow-suave"
          />
        </form>
        <nav aria-label="Filtrar por responsable" className="flex flex-wrap gap-1.5">
          {[
            ['', 'Todas'],
            ['mias', 'Mías'],
          ].map(([v, t]) => (
            <Link
              key={v}
              href={enlace(v)}
              aria-current={quien === v ? 'page' : undefined}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${
                quien === v ? 'border-acento bg-acento-suave text-acento' : 'border-borde text-texto-2 hover:bg-superficie-2'
              }`}
            >
              {t}
            </Link>
          ))}
          {personas.length > 1 && (
            <form className="flex">
              {texto && <input type="hidden" name="q" value={texto} />}
              <label htmlFor="resp" className="sr-only">
                Responsable
              </label>
              <select
                id="resp"
                name="resp"
                defaultValue={quien && quien !== 'mias' ? quien : ''}
                className="h-8 rounded-full border border-borde bg-superficie px-3 text-[13px]"
              >
                <option value="">Por responsable…</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="ml-1 h-8 rounded-full px-3 text-[13px] font-medium text-acento hover:bg-acento-suave"
              >
                Ver
              </button>
            </form>
          )}
        </nav>
      </div>
      <Embudo columnas={columnas} editar={editar} />
    </>
  )
}
