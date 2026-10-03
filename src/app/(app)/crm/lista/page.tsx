import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonEnlace, EncabezadoPagina } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { asegurarEtapas, listarOportunidades, responsables } from '@/modulos/crm/crm'

import { Atajos } from '../Atajos'
import { pesosServidor } from '../formato'
import { TablaOportunidades } from './TablaOportunidades'

export const metadata: Metadata = { title: 'Oportunidades' }

const FILTROS = [
  { valor: 'abierta', texto: 'Abiertas' },
  { valor: 'ganada', texto: 'Ganadas' },
  { valor: 'perdida', texto: 'Perdidas' },
  { valor: 'todas', texto: 'Todas' },
] as const

export default async function ListaOportunidades({ searchParams }: PageProps<'/crm/lista'>) {
  const sesion = await exigirPermiso('crm.ver')
  const { q, estado, mias, etiqueta } = await searchParams
  const texto = typeof q === 'string' ? q : ''
  const filtro = (FILTROS.find((f) => f.valor === estado)?.valor ?? 'abierta') as (typeof FILTROS)[number]['valor']
  const soloMias = mias === '1'
  const tag = typeof etiqueta === 'string' ? etiqueta : undefined
  const [filas, etapas, personas] = await enLaEmpresa(
    'crm.ver',
    async (tx) =>
      [
        await listarOportunidades(tx, {
          q: texto,
          estado: filtro,
          responsableId: soloMias ? sesion.usuario.id : null,
          etiqueta: tag,
        }),
        await asegurarEtapas(tx),
        await responsables(tx, sesion.empresa.id),
      ] as const,
  )
  const editar = tienePermiso(sesion.permisos, 'crm.oportunidades')
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
          editar && (
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
      <TablaOportunidades
        filas={filas.map((o) => ({
          id: o.id,
          titulo: o.titulo,
          cliente: o.cliente,
          esProspecto: o.esProspecto,
          etapa: o.etapa,
          estado: o.estado,
          ingresoEsperado: o.ingresoEsperado,
          probabilidad: o.probabilidad,
          cierreEstimado: o.cierreEstimado,
          prioridad: o.prioridad,
          responsable: o.responsable,
          etiquetas: o.etiquetas,
          proxima: o.proxima,
        }))}
        etapas={etapas.map((e) => ({ id: e.id, nombre: e.nombre }))}
        personas={personas}
        editar={editar}
        parametros={{ ...(texto ? { q: texto } : {}), estado: filtro, ...(soloMias ? { mias: '1' } : {}) }}
        vacio={`No hay oportunidades ${texto || soloMias || tag ? 'con este filtro' : 'todavía'}.`}
      />
      <Atajos nueva={editar ? '/crm/nueva' : undefined} />
    </>
  )
}
