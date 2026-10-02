import { and, desc, eq, isNull } from 'drizzle-orm'
import { CheckCircle2, ChevronRight, FileText } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, Boton, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { enviosFormulario, formularios } from '@/db/schema'
import { tecnicoDeUsuario } from '@/modulos/servicio/servicio'
import { listarFormularios } from '@/modulos/servicio/sueltos'

import { paginaContratos } from '../../contratos/modulo'
import { empezarAccion } from '../../servicio/formularios/acciones'

export const metadata: Metadata = { title: 'Formularios' }

/** Formularios sueltos para el técnico (checklist de la camioneta, relevamientos…), pensado para el celular. */
export default async function FormulariosTecnico({ searchParams }: PageProps<'/tecnico/formularios'>) {
  const sesion = await paginaContratos('servicio.trabajar')
  const { enviado, error } = (await searchParams) as { enviado?: string; error?: string }
  const datos = await conEmpresa(sesion, async (tx) => {
    const t = await tecnicoDeUsuario(tx, sesion.usuario)
    if (!t) return null
    return {
      lista: await listarFormularios(tx, 'tecnico'),
      borradores: await tx
        .select({ id: enviosFormulario.id, nombre: formularios.nombre, creado: enviosFormulario.creado })
        .from(enviosFormulario)
        .innerJoin(formularios, eq(formularios.id, enviosFormulario.formularioId))
        .where(
          and(
            eq(enviosFormulario.tecnicoId, t.id),
            eq(enviosFormulario.usuarioId, sesion.usuario.id),
            isNull(enviosFormulario.enviado),
          ),
        )
        .orderBy(desc(enviosFormulario.creado)),
    }
  })
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/tecnico" className="text-sm text-acento hover:underline">
        ← Mi agenda
      </Link>
      <EncabezadoPagina titulo="Formularios" />
      {enviado && (
        <div className="mb-4">
          <Aviso tono="ok">
            <span className="flex items-center gap-2">
              <CheckCircle2 aria-hidden className="size-4" /> Formulario N° {enviado} enviado.
            </span>
          </Aviso>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}
      {!datos ? (
        <Panel className="p-5 text-sm text-texto-2">Tu usuario no está vinculado a un técnico.</Panel>
      ) : (
        <>
          {datos.borradores.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-texto-2 uppercase">Sin terminar</h2>
              <ul className="flex flex-col gap-2">
                {datos.borradores.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/servicio/envios/${b.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-borde bg-superficie p-3 hover:border-acento"
                    >
                      <span className="font-medium">{b.nombre}</span>
                      <ChevronRight aria-hidden className="size-5 text-texto-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {datos.lista.length === 0 ? (
            <Panel className="p-5 text-sm text-texto-2">No hay formularios para completar.</Panel>
          ) : (
            <ul className="flex flex-col gap-2">
              {datos.lista.map((f) => (
                <li key={f.id}>
                  <form action={empezarAccion.bind(null, f.id, 'tecnico', undefined)}>
                    <Boton
                      type="submit"
                      className="flex h-auto w-full items-center justify-between gap-3 rounded-lg p-3 text-left"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <FileText aria-hidden className="size-5 shrink-0" style={{ color: f.color }} />
                        <span className="min-w-0">
                          <span className="block font-medium">{f.nombre}</span>
                          {f.descripcion && (
                            <span className="block truncate text-xs font-normal text-texto-2">{f.descripcion}</span>
                          )}
                        </span>
                      </span>
                      <ChevronRight aria-hidden className="size-5 shrink-0 text-texto-3" />
                    </Boton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
