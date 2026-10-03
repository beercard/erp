import { Plus, Sparkles } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, Boton, BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { tienePermiso } from '@/lib/permisos'
import { MODELOS } from '@/modulos/servicio/formularios'
import { TIPOS_ORDEN } from '@/modulos/servicio/tipos'
import { listarTipos } from '@/modulos/servicio/tiposOrden'

import { paginaContratos } from '../../contratos/modulo'
import { crearModelosAccion } from '../acciones'

export const metadata: Metadata = { title: 'Tipos de orden' }

export default async function TiposOrden({ searchParams }: PageProps<'/servicio/tipos'>) {
  const sesion = await paginaContratos('servicio.ver')
  const { creados, error } = (await searchParams) as { creados?: string; error?: string }
  const tipos = await conEmpresa(sesion, (tx) => listarTipos(tx))
  const editar = tienePermiso(sesion.permisos, 'servicio.configurar')
  const faltan = MODELOS.filter((m) => !tipos.some((t) => t.codigo === m.codigo))

  return (
    <>
      <EncabezadoPagina
        titulo="Tipos de orden"
        bajada="Cada tipo tiene su formulario de instrucciones (oficina) y de devolución (técnico). Al cambiarlos se crea una versión nueva."
        acciones={
          editar && (
            <BotonEnlace href="/servicio/tipos/nuevo" variante="primario">
              <Plus aria-hidden className="size-4" /> Nuevo tipo
            </BotonEnlace>
          )
        }
      />
      {creados && (
        <div className="mb-4">
          <Aviso tono="ok">{creados === '0' ? 'Ya estaban todos los modelos.' : `Se crearon ${creados} tipos de orden.`}</Aviso>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}
      {editar && faltan.length > 0 && (
        <Panel className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-texto-2">
            Modelos listos para fotocopiadoras e impresoras: {faltan.map((m) => m.nombre).join(', ')}. Se pueden ajustar después.
          </p>
          <form action={crearModelosAccion}>
            <Boton type="submit">
              <Sparkles aria-hidden className="size-4" /> Crear los modelos
            </Boton>
          </form>
        </Panel>
      )}
      {tipos.length === 0 ? (
        <Panel className="p-6 text-sm text-texto-2">Todavía no hay tipos de orden.</Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Clase</th>
                <th className="px-4 py-2 text-right font-medium">Duración</th>
                <th className="px-4 py-2 text-right font-medium">Plazo</th>
                <th className="px-4 py-2 text-right font-medium">Versión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {tipos.map((t) => (
                <tr key={t.id} className="group hover:bg-superficie-2">
                  <td className="px-4 py-2">
                    <Link
                      href={`/servicio/tipos/${t.id}`}
                      className="flex items-center gap-2 font-medium group-hover:text-acento"
                    >
                      <span aria-hidden className="size-2.5 rounded-full" style={{ background: t.color }} />
                      {t.nombre}
                      <span className="cifras text-xs font-normal text-texto-3">{t.codigo}</span>
                      {!t.activo && <Chip>De baja</Chip>}
                      {t.portal && <Chip tono="ok">Portal</Chip>}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-texto-2">{TIPOS_ORDEN[t.clase as keyof typeof TIPOS_ORDEN]}</td>
                  <td className="cifras px-4 py-2 text-right">{t.duracion} min</td>
                  <td className="cifras px-4 py-2 text-right">{t.plazoHoras} h</td>
                  <td className="cifras px-4 py-2 text-right">v{t.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  )
}
