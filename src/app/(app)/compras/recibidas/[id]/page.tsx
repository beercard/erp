import { ExternalLink, RotateCw, Trash2 } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Aviso, Boton, BotonEnlace, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { TIPOS_TRIBUTO } from '@/modulos/compras/compras'
import { obtenerRecibida } from '@/modulos/compras/recibidas'
import { iaConfigurada } from '@/modulos/ia/claude'

import { descartarAccion, releerAccion } from '../acciones'
import { Revision } from './Revision'

export const metadata: Metadata = { title: 'Revisar factura recibida' }

export default async function RevisarRecibida({ params }: PageProps<'/compras/recibidas/[id]'>) {
  await exigirPermiso('compras.cargar')
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const r = await enLaEmpresa('compras.ver', (tx) => obtenerRecibida(tx, id))
  if (!r) notFound()
  const d = (r.datos ?? {}) as Record<string, unknown> & { avisos?: string[] }
  const archivo = `/compras/recibidas/${id}/archivo`
  return (
    <>
      <EncabezadoPagina
        titulo="Revisar factura recibida"
        bajada="Compará con el original y corregí lo que haga falta. Recién al registrarla entra a Compras."
        acciones={
          <Link href="/compras/recibidas" className="text-sm text-acento hover:underline">
            Volver a la bandeja
          </Link>
        }
      />
      {r.estado === 'registrada' && r.compraId && (
        <div className="mb-4">
          <Aviso tono="ok">
            Ya está registrada.{' '}
            <Link href={`/compras/${r.compraId}`} className="font-medium underline">
              Ver la compra
            </Link>
          </Aviso>
        </div>
      )}
      {r.error && (
        <div className="mb-4">
          <Aviso>No se pudo leer sola ({r.error}). Completala a mano.</Aviso>
        </div>
      )}
      {d.avisos?.length ? (
        <div className="mb-4">
          <Aviso tono="aviso">
            <span className="font-semibold">Para revisar:</span>
            <ul className="mt-1 list-disc pl-5">
              {d.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Aviso>
        </div>
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel className="flex flex-col gap-3 p-4 lg:sticky lg:top-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Original</h2>
            <BotonEnlace href={archivo} target="_blank" variante="fantasma">
              <ExternalLink aria-hidden /> Abrir
            </BotonEnlace>
          </div>
          {r.tipoArchivo.startsWith('image/') ? (
            // eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por el ERP
            <img
              src={archivo}
              alt="Factura recibida"
              className="max-h-[75vh] w-full rounded-lg border border-borde object-contain"
            />
          ) : (
            <p className="rounded-lg bg-superficie-2 p-6 text-center text-sm text-texto-2">
              Es un PDF{r.nombreArchivo ? ` (${r.nombreArchivo})` : ''}: abrilo con el botón de arriba para compararlo.
            </p>
          )}
        </Panel>
        <Panel className="p-5">
          {['lista', 'error'].includes(r.estado) ? (
            <>
              <Revision id={id} d={d as Parameters<typeof Revision>[0]['d']} tributos={TIPOS_TRIBUTO} />
              <div className="mt-5 flex flex-wrap gap-2 border-t border-borde pt-4">
                {iaConfigurada() && (
                  <form action={releerAccion.bind(null, id)}>
                    <Boton type="submit" variante="fantasma">
                      <RotateCw aria-hidden /> Volver a leer
                    </Boton>
                  </form>
                )}
                <form action={descartarAccion.bind(null, id)}>
                  <Boton type="submit" variante="fantasma">
                    <Trash2 aria-hidden /> Descartar
                  </Boton>
                </form>
              </div>
            </>
          ) : (
            <p className="text-sm text-texto-2">
              {r.estado === 'leyendo' ? 'Se está leyendo: actualizá en unos segundos.' : 'No hay nada para revisar.'}
            </p>
          )}
        </Panel>
      </div>
    </>
  )
}
