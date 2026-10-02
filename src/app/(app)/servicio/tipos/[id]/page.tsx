import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { DescargarExcel } from '@/components/servicio/DescargarExcel'
import { EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { tienePermiso } from '@/lib/permisos'
import { TIPOS_CAMPO } from '@/modulos/servicio/formularios'
import { obtenerTipo } from '@/modulos/servicio/tiposOrden'

import { paginaContratos } from '../../../contratos/modulo'
import { EditorTipo } from '../EditorTipo'

export const metadata: Metadata = { title: 'Tipo de orden' }

export default async function TipoOrden({ params }: PageProps<'/servicio/tipos/[id]'>) {
  const sesion = await paginaContratos('servicio.ver')
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const t = await conEmpresa(sesion, (tx) => obtenerTipo(tx, id))
  if (!t || !t.plantilla) notFound()
  const editar = tienePermiso(sesion.permisos, 'servicio.configurar')
  return (
    <>
      <EncabezadoPagina
        titulo={t.nombre}
        bajada={`Formularios en la versión ${t.version} · ${t.versiones.length} ${t.versiones.length === 1 ? 'versión' : 'versiones'} en total`}
        acciones={
          tienePermiso(sesion.permisos, 'servicio.cargar') ? (
            <DescargarExcel ruta={`/servicio/reportes/tipo/${t.id}`} texto="Órdenes en Excel" />
          ) : undefined
        }
      />
      {editar ? (
        <Panel className="p-4">
          <EditorTipo
            id={t.id}
            inicial={{ ...t, instrucciones: t.plantilla.instrucciones, devolucion: t.plantilla.devolucion }}
          />
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(['instrucciones', 'devolucion'] as const).map((k) => (
            <Panel key={k} className="p-4">
              <h2 className="mb-2 text-sm font-semibold">{k === 'instrucciones' ? 'Instrucciones' : 'Devolución del técnico'}</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {t.plantilla![k].map((c) => (
                  <li key={c.id}>
                    {c.etiqueta} <span className="text-xs text-texto-3">({TIPOS_CAMPO[c.tipo]})</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </>
  )
}
