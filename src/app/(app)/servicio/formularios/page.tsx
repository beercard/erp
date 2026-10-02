import { Inbox, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, Boton, BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { tienePermiso } from '@/lib/permisos'
import { estadosDeBandeja, listarFormularios } from '@/modulos/servicio/sueltos'

import { paginaContratos } from '../../contratos/modulo'
import { crearModelosSueltosAccion, empezarAccion } from './acciones'
import { EstadosBandeja } from './Estados'

export const metadata: Metadata = { title: 'Formularios' }

/** Formularios sueltos (fuera de una orden) y los estados de la bandeja de entrada. */
export default async function Formularios({ searchParams }: PageProps<'/servicio/formularios'>) {
  const sesion = await paginaContratos('servicio.cargar')
  const { error } = (await searchParams) as { error?: string }
  const configura = tienePermiso(sesion.permisos, 'servicio.configurar')
  const { lista, estados } = await conEmpresa(sesion, async (tx) => ({
    lista: await listarFormularios(tx),
    estados: await estadosDeBandeja(tx),
  }))
  return (
    <>
      <EncabezadoPagina
        titulo="Formularios"
        bajada="Relevamientos, checklists, pedidos del cliente: formularios que no son una orden. Lo que se manda llega a la bandeja de entrada."
        acciones={
          <>
            <BotonEnlace href="/servicio/bandeja">
              <Inbox aria-hidden className="size-4" /> Bandeja de entrada
            </BotonEnlace>
            {configura && (
              <BotonEnlace href="/servicio/formularios/nuevo" variante="primario">
                <Plus aria-hidden className="size-4" /> Nuevo formulario
              </BotonEnlace>
            )}
          </>
        }
      />
      {error && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}
      <Panel className="mb-4 overflow-x-auto">
        {lista.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-texto-2">
            Todavía no hay formularios.
            {configura && (
              <form action={crearModelosSueltosAccion}>
                <Boton type="submit">Cargar los de ejemplo (relevamiento, control de la camioneta, pedido de presupuesto)</Boton>
              </form>
            )}
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <tbody className="divide-y divide-borde">
              {lista.map((f) => (
                <tr key={f.id} className={f.activo ? '' : 'text-texto-3'}>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2 font-medium">
                      <span aria-hidden className="size-2.5 rounded-full" style={{ background: f.color }} />
                      {configura ? (
                        <Link href={`/servicio/formularios/${f.id}`} className="hover:underline">
                          {f.nombre}
                        </Link>
                      ) : (
                        f.nombre
                      )}
                      <span className="cifras text-xs font-normal text-texto-3">{f.codigo}</span>
                    </span>
                    {f.descripcion && <span className="block text-xs text-texto-2">{f.descripcion}</span>}
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex flex-wrap gap-1">
                      {f.tecnico && <Chip>Técnicos</Chip>}
                      {f.portal && <Chip tono="ok">Portal</Chip>}
                      {!f.activo && <Chip>De baja</Chip>}
                    </span>
                  </td>
                  <td className="cifras px-4 py-2 text-right text-xs text-texto-3">v{f.version}</td>
                  <td className="px-4 py-2 text-right">
                    <a
                      href={`/servicio/reportes/formulario/${f.id}`}
                      title="Envíos de los últimos 30 días en Excel"
                      className="text-xs text-acento hover:underline"
                    >
                      Excel
                    </a>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {f.activo && (
                      <form action={empezarAccion.bind(null, f.id, 'oficina', undefined)}>
                        <Boton type="submit" className="h-7 px-2 text-xs">
                          Completar
                        </Boton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      {configura && (
        <Panel className="p-4">
          <h2 className="text-sm font-semibold">Estados de la bandeja de entrada</h2>
          <p className="mb-2 text-xs text-texto-2">
            Por dónde pasa cada envío hasta resolverse. Los finales ya no cuentan como pendientes.
          </p>
          <EstadosBandeja estados={estados} />
        </Panel>
      )}
    </>
  )
}
