import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CompletarEnvio } from '@/components/servicio/CompletarEnvio'
import { EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { enviosFormulario } from '@/db/schema'
import { tienePermiso } from '@/lib/permisos'
import { tecnicoDeUsuario } from '@/modulos/servicio/servicio'
import { borradorDe, type Autor } from '@/modulos/servicio/sueltos'

import { paginaContratos } from '../../../contratos/modulo'
import { buscarClientesServicio, equiposDelClienteAccion } from '../../acciones'
import {
  descartarAccion,
  enviarAccion,
  guardarBorradorAccion,
  quitarArchivoEnvioAccion,
  subirArchivoEnvioAccion,
} from '../../formularios/acciones'

export const metadata: Metadata = { title: 'Completar formulario' }

/** Completar un formulario suelto: la oficina o el técnico (desde el celular). */
export default async function CompletarFormulario({ params }: PageProps<'/servicio/envios/[id]'>) {
  const sesion = await paginaContratos('servicio.ver')
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const b = await conEmpresa(sesion, async (tx) => {
    const [e] = await tx.select({ origen: enviosFormulario.origen }).from(enviosFormulario).where(eq(enviosFormulario.id, id))
    if (!e) return null
    let autor: Autor | null = null
    if (e.origen === 'tecnico') {
      const t = await tecnicoDeUsuario(tx, sesion.usuario)
      if (t) autor = { quien: 'tecnico', usuarioId: sesion.usuario.id, tecnicoId: t.id }
    } else if (e.origen === 'oficina' && tienePermiso(sesion.permisos, 'servicio.cargar'))
      autor = { quien: 'oficina', usuarioId: sesion.usuario.id }
    if (!autor) return null
    const borrador = await borradorDe(tx, id, autor)
    return borrador ? { ...borrador, quien: autor.quien } : null
  })
  if (!b) notFound()
  const volver = b.quien === 'tecnico' ? '/tecnico/formularios' : '/servicio/formularios'
  return (
    <div className={b.quien === 'tecnico' ? 'mx-auto max-w-2xl' : ''}>
      <Link href={volver} className="text-sm text-acento hover:underline">
        ← Formularios
      </Link>
      <EncabezadoPagina titulo={b.formulario.nombre} bajada={b.formulario.descripcion ?? undefined} />
      <Panel className="p-4">
        <CompletarEnvio
          campos={b.campos}
          inicial={b.valores}
          pideCliente={b.formulario.pideCliente}
          cliente={b.cliente}
          ubicar={b.quien === 'tecnico'}
          buscarClientes={buscarClientesServicio}
          equiposDe={equiposDelClienteAccion}
          enviar={enviarAccion.bind(null, b.id)}
          guardar={guardarBorradorAccion.bind(null, b.id)}
          subir={subirArchivoEnvioAccion.bind(null, b.id)}
          quitar={quitarArchivoEnvioAccion.bind(null, b.id)}
          descartar={descartarAccion.bind(null, b.id)}
          rutaArchivos="/servicio/archivo"
        />
      </Panel>
    </div>
  )
}
