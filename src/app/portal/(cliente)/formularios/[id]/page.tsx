import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CompletarEnvio } from '@/components/servicio/CompletarEnvio'
import { Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { borradorDe } from '@/modulos/servicio/sueltos'

import {
  descartarFormularioPortalAccion,
  enviarFormularioPortalAccion,
  equiposPortalAccion,
  guardarFormularioPortalAccion,
  quitarArchivoPortalAccion,
  subirArchivoPortalAccion,
} from '../../../acciones'
import { requerirPortal } from '../../../sesion'

export const metadata: Metadata = { title: 'Formulario' }

export default async function CompletarPortal({ params }: PageProps<'/portal/formularios/[id]'>) {
  const s = await requerirPortal()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const b = await conEmpresa(s.empresaId, (tx) =>
    borradorDe(tx, id, { quien: 'portal', usuarioPortalId: s.usuario.id, terceroId: s.cliente.id }),
  )
  if (!b) notFound()
  return (
    <>
      <Link href="/portal/formularios" className="text-sm text-acento hover:underline">
        ← Formularios
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{b.formulario.nombre}</h1>
        {b.formulario.descripcion && <p className="text-sm text-texto-2">{b.formulario.descripcion}</p>}
      </div>
      <Panel className="p-5">
        <CompletarEnvio
          campos={b.campos}
          inicial={b.valores}
          pideCliente={b.formulario.pideCliente}
          cliente={s.cliente}
          clienteFijo
          equiposDe={equiposPortalAccion}
          enviar={enviarFormularioPortalAccion.bind(null, b.id)}
          guardar={guardarFormularioPortalAccion.bind(null, b.id)}
          subir={subirArchivoPortalAccion.bind(null, b.id)}
          quitar={quitarArchivoPortalAccion.bind(null, b.id)}
          descartar={descartarFormularioPortalAccion.bind(null, b.id)}
          rutaArchivos="/portal/archivo"
        />
      </Panel>
    </>
  )
}
