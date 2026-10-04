import { ChevronLeft, Download } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EnlaceAyuda } from '@/components/ayuda/EnlaceAyuda'
import { EncabezadoPagina, Panel } from '@/components/ui'
import { requerirEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'

import { Importador } from './Importador'
import { IMPORTACIONES, type TipoImportacion } from './tipos'

export const metadata: Metadata = { title: 'Importar desde planillas' }

/** Las tres importaciones, en el orden en que conviene hacerlas: los saldos necesitan a los clientes y proveedores. */
const ORDEN: TipoImportacion[] = ['terceros', 'articulos', 'saldos']

export default async function Importar() {
  const sesion = await requerirEmpresa()
  const tipos = ORDEN.filter((t) => tienePermiso(sesion.permisos, IMPORTACIONES[t].permiso))

  return (
    <>
      <Link href="/configuracion" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Configuración
      </Link>
      <EncabezadoPagina
        acciones={<EnlaceAyuda guia="importar" />}
        titulo="Importar desde planillas"
        bajada="Traé lo que tenías en otro sistema o en Excel. Primero ves qué va a pasar; nada se guarda hasta que confirmás."
      />
      {tipos.length === 0 && (
        <Panel className="p-4 text-sm text-texto-2">
          Tu rol no tiene permiso para importar datos. Pedíselo a quien administra.
        </Panel>
      )}
      <div className="flex flex-col gap-6">
        {tipos.map((t, i) => {
          const imp = IMPORTACIONES[t]
          return (
            <Panel key={t} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-3 text-sm">
                <h2 className="font-semibold">
                  {i + 1}. {imp.titulo}
                </h2>
                <p className="text-texto-2">{imp.detalle}</p>
                <dl className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                  {imp.columnas.map(([c, q]) => (
                    <div key={c} className="contents">
                      <dt className="cifras break-words text-texto">{c}</dt>
                      <dd className="text-texto-2">{q}</dd>
                    </div>
                  ))}
                </dl>
                <a
                  href={`/configuracion/importar/modelo/${t}`}
                  className="inline-flex w-fit items-center gap-1.5 text-xs text-acento hover:underline"
                >
                  <Download aria-hidden className="size-3.5" /> Descargar la planilla modelo
                </a>
              </div>
              <Importador tipo={t} />
            </Panel>
          )
        })}
      </div>
    </>
  )
}
