import { ChevronRight, FileText } from 'lucide-react'
import type { Metadata } from 'next'

import { Aviso, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { enviosDelCliente, listarFormularios } from '@/modulos/servicio/sueltos'

import { empezarFormularioAccion } from '../../acciones'
import { requerirPortal } from '../../sesion'

export const metadata: Metadata = { title: 'Formularios' }

const fecha = (d: Date | null) => (d ? d.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '')

export default async function FormulariosPortal({ searchParams }: PageProps<'/portal/formularios'>) {
  const s = await requerirPortal()
  const { enviado, error } = (await searchParams) as { enviado?: string; error?: string }
  const { lista, envios } = await conEmpresa(s.empresaId, async (tx) => ({
    lista: await listarFormularios(tx, 'portal'),
    envios: await enviosDelCliente(tx, s.cliente.id),
  }))
  return (
    <>
      <h1 className="text-xl font-semibold">Formularios</h1>
      {enviado && <Aviso tono="ok">Recibimos tu formulario (N° {enviado}). Te vamos a responder a la brevedad.</Aviso>}
      {error && <Aviso>{error}</Aviso>}
      {lista.length === 0 ? (
        <Panel className="p-4 text-sm text-texto-2">No hay formularios disponibles.</Panel>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((f) => (
            <li key={f.id}>
              <form action={empezarFormularioAccion.bind(null, f.id)}>
                <button
                  type="submit"
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-borde bg-superficie shadow-suave p-4 text-left hover:border-acento"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <FileText aria-hidden className="size-5 shrink-0 text-acento" />
                    <span className="min-w-0">
                      <span className="block font-medium">{f.nombre}</span>
                      {f.descripcion && <span className="block text-sm text-texto-2">{f.descripcion}</span>}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-texto-3" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {envios.length > 0 && (
        <Panel>
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Lo que mandaste</h2>
          <ul className="divide-y divide-borde text-sm">
            {envios.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>
                  <span className="font-medium">
                    {e.formulario} · N° {e.numero}
                  </span>
                  <span className="block text-xs text-texto-2">{fecha(e.enviado)}</span>
                </span>
                {e.estado && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: `color-mix(in srgb, ${e.estado.color} 15%, transparent)`, color: e.estado.color }}
                  >
                    {e.estado.nombre}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  )
}
