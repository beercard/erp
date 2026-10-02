import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { equipos, terceros } from '@/db/schema'
import { hoyArgentina } from '@/lib/fechas'
import { listarTecnicos } from '@/modulos/servicio/servicio'
import { tiposParaOrden } from '@/modulos/servicio/tiposOrden'

import { paginaContratos } from '../../contratos/modulo'
import { FormularioOrden } from '../Formularios'

export const metadata: Metadata = { title: 'Nueva orden de servicio' }

/** Desde la ficha de un equipo llega con ?equipo=… y queda elegido con su cliente. */
export default async function NuevaOrden({ searchParams }: PageProps<'/servicio/nueva'>) {
  const sesion = await paginaContratos('servicio.cargar')
  const { equipo } = (await searchParams) as { equipo?: string }
  const { tecnicos, tipos, desde } = await conEmpresa(sesion.empresa.id, async (tx) => ({
    tecnicos: await listarTecnicos(tx),
    tipos: await tiposParaOrden(tx),
    desde:
      equipo && /^[0-9a-f-]{36}$/i.test(equipo)
        ? (
            await tx
              .select({ id: equipos.id, terceroId: equipos.terceroId, cliente: terceros.razonSocial })
              .from(equipos)
              .innerJoin(terceros, eq(terceros.id, equipos.terceroId))
              .where(eq(equipos.id, equipo))
          )[0]
        : undefined,
  }))
  return (
    <>
      <EncabezadoPagina
        titulo="Nueva orden de servicio"
        bajada="Lo que pide el cliente: una falla, un preventivo, una instalación o un retiro."
      />
      {tipos.length === 0 && (
        <div className="mb-4">
          <Aviso tono="info">
            Todavía no hay tipos de orden con formularios. Se cargan en{' '}
            <Link href="/servicio/tipos" className="font-medium underline">
              Servicio técnico › Tipos de orden
            </Link>{' '}
            (hay modelos listos para fotocopiadoras).
          </Aviso>
        </div>
      )}
      <Panel className="p-4">
        <FormularioOrden
          id={null}
          inicial={{
            fecha: hoyArgentina(),
            terceroId: desde?.terceroId ?? undefined,
            cliente: desde?.cliente,
            equipoId: desde?.id ?? null,
          }}
          tecnicos={tecnicos.map((t) => ({ valor: t.id, texto: t.nombre }))}
          tipos={tipos}
        />
      </Panel>
    </>
  )
}
