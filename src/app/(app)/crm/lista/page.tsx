import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { listarOportunidades } from '@/modulos/crm/crm'

import { Estrellas, Iniciales, ProximaActividad } from '../componentes'
import { pesosServidor } from '../formato'

export const metadata: Metadata = { title: 'Oportunidades' }

const FILTROS = [
  { valor: 'abierta', texto: 'Abiertas' },
  { valor: 'ganada', texto: 'Ganadas' },
  { valor: 'perdida', texto: 'Perdidas' },
  { valor: 'todas', texto: 'Todas' },
] as const

const TONO = { abierta: 'info', ganada: 'ok', perdida: 'error' } as const

export default async function ListaOportunidades({ searchParams }: PageProps<'/crm/lista'>) {
  const sesion = await exigirPermiso('crm.ver')
  const { q, estado, mias, etiqueta } = await searchParams
  const texto = typeof q === 'string' ? q : ''
  const filtro = (FILTROS.find((f) => f.valor === estado)?.valor ?? 'abierta') as (typeof FILTROS)[number]['valor']
  const soloMias = mias === '1'
  const tag = typeof etiqueta === 'string' ? etiqueta : undefined
  const filas = await enLaEmpresa('crm.ver', (tx) =>
    listarOportunidades(tx, { q: texto, estado: filtro, responsableId: soloMias ? sesion.usuario.id : null, etiqueta: tag }),
  )
  const total = filas.reduce((s, o) => s + Number(o.ingresoEsperado), 0)
  const enlace = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams({
      ...(texto ? { q: texto } : {}),
      estado: filtro,
      ...(soloMias ? { mias: '1' } : {}),
      ...(tag ? { etiqueta: tag } : {}),
    })
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k)
      else p.set(k, v)
    }
    return `/crm/lista?${p}`
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Oportunidades"
        bajada={
          <>
            {filas.length} {filas.length === 1 ? 'oportunidad' : 'oportunidades'} ·{' '}
            <span className="cifras">{pesosServidor(total)}</span>
            {tag && (
              <>
                {' '}
                · etiqueta “{tag}”{' '}
                <Link href={enlace({ etiqueta: null })} className="text-acento hover:underline">
                  quitar
                </Link>
              </>
            )}
          </>
        }
        acciones={
          tienePermiso(sesion.permisos, 'crm.oportunidades') && (
            <BotonEnlace href="/crm/nueva" variante="primario">
              <Plus aria-hidden /> Nueva oportunidad
            </BotonEnlace>
          )
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <form role="search" className="w-full max-w-sm">
          <input type="hidden" name="estado" value={filtro} />
          {soloMias && <input type="hidden" name="mias" value="1" />}
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
        <nav aria-label="Filtrar" className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <Link
              key={f.valor}
              href={enlace({ estado: f.valor })}
              aria-current={filtro === f.valor ? 'page' : undefined}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium ${
                filtro === f.valor
                  ? 'border-acento bg-acento-suave text-acento'
                  : 'border-borde text-texto-2 hover:bg-superficie-2'
              }`}
            >
              {f.texto}
            </Link>
          ))}
          <Link
            href={enlace({ mias: soloMias ? null : '1' })}
            aria-pressed={soloMias}
            className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium ${
              soloMias ? 'border-acento bg-acento-suave text-acento' : 'border-borde text-texto-2 hover:bg-superficie-2'
            }`}
          >
            Solo mías
          </Link>
        </nav>
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-borde text-left text-xs text-texto-2">
              <th className="px-4 py-2.5 font-medium">Oportunidad</th>
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="px-4 py-2.5 font-medium">Etapa</th>
              <th className="px-4 py-2.5 text-right font-medium">Ingreso</th>
              <th className="px-4 py-2.5 text-right font-medium">Prob.</th>
              <th className="px-4 py-2.5 font-medium">Cierre</th>
              <th className="px-4 py-2.5 font-medium">Próxima actividad</th>
              <th className="px-4 py-2.5 font-medium">Resp.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {!filas.length && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-texto-2">
                  No hay oportunidades {texto || soloMias || tag ? 'con este filtro' : 'todavía'}.
                </td>
              </tr>
            )}
            {filas.map((o) => (
              <tr key={o.id} className="group">
                <td className="px-4 py-2.5">
                  <Link href={`/crm/${o.id}`} className="font-medium group-hover:text-acento">
                    {o.titulo}
                  </Link>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Estrellas valor={o.prioridad} tamano="size-3" />
                    {o.etiquetas.slice(0, 3).map((e) => (
                      <Link
                        key={e}
                        href={enlace({ etiqueta: e })}
                        className="rounded-md bg-superficie-2 px-1.5 text-[11px] text-texto-2 hover:text-acento"
                      >
                        {e}
                      </Link>
                    ))}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-texto-2">
                  {o.cliente}
                  {o.esProspecto && <span className="text-texto-3"> · prospecto</span>}
                </td>
                <td className="px-4 py-2.5">
                  {o.estado === 'abierta' ? (
                    o.etapa
                  ) : (
                    <Chip tono={TONO[o.estado as keyof typeof TONO]}>
                      {o.estado === 'ganada' ? 'Ganada' : `Perdida en ${o.etapa}`}
                    </Chip>
                  )}
                </td>
                <td className="cifras px-4 py-2.5 text-right whitespace-nowrap">{pesosServidor(o.ingresoEsperado)}</td>
                <td className="cifras px-4 py-2.5 text-right text-texto-2">{o.probabilidad} %</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-texto-2">
                  {o.cierreEstimado ? o.cierreEstimado.split('-').reverse().join('/') : '—'}
                </td>
                <td className="px-4 py-2.5">
                  {o.estado === 'abierta' ? <ProximaActividad proxima={o.proxima} /> : <span className="text-texto-3">—</span>}
                </td>
                <td className="px-4 py-2.5">
                  <Iniciales nombre={o.responsable} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  )
}
