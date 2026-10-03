import { ArrowDownToLine, History } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, BotonEnlace, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { tienePermiso } from '@/lib/permisos'
import { cajas, inicioTurno, listarCierres, resumenTurno } from '@/modulos/tesoreria/cierres'

import { CerrarCaja } from './Piezas'
import { ResumenCaja } from './Resumen'

export const metadata: Metadata = { title: 'Cierre de caja' }

const hora = (d: Date) =>
  d.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

/** Turno abierto de una caja: lo cobrado hasta ahora y el cierre (como en un POS). */
export default async function CierreDeCaja({ searchParams }: PageProps<'/cobranzas/caja'>) {
  const sesion = await requerirEmpresa()
  const { c } = await searchParams
  const lista = await enLaEmpresa('ventas.ver', (tx) => cajas(tx))
  const cajaId = (typeof c === 'string' && lista.find((x) => x.id === c)?.id) || lista[0]?.id
  const datos = cajaId
    ? await enLaEmpresa('ventas.ver', async (tx) => {
        const desde = await inicioTurno(tx, cajaId)
        return { desde, resumen: await resumenTurno(tx, cajaId, desde), cierres: await listarCierres(tx, { cuentaId: cajaId }) }
      })
    : null
  const cerrar = tienePermiso(sesion.permisos, 'ventas.cobrar')
  return (
    <>
      <EncabezadoPagina
        titulo="Cierre de caja"
        bajada={
          datos
            ? `Turno abierto desde el ${hora(datos.desde)}: lo cobrado, por qué medio y quién, y cuánto efectivo debería haber.`
            : 'Resumen del turno y arqueo de la caja.'
        }
        acciones={
          <BotonEnlace href="/tesoreria/movimiento" variante="secundario">
            Registrar un retiro o gasto
          </BotonEnlace>
        }
      />
      {!lista.length && (
        <Aviso tono="info">
          Para hacer cierres, creá una cuenta de tipo <b>caja</b> en{' '}
          <Link href="/tesoreria/cuentas/nueva" className="font-medium underline">
            Tesorería
          </Link>
          .
        </Aviso>
      )}
      {lista.length > 1 && (
        <nav aria-label="Caja" className="mb-4 flex flex-wrap gap-1.5">
          {lista.map((x) => (
            <Link
              key={x.id}
              href={`/cobranzas/caja?c=${x.id}`}
              aria-current={x.id === cajaId ? 'page' : undefined}
              className="inline-flex h-8 items-center rounded-full border border-borde px-3 text-[13px] font-medium text-texto-2 aria-[current=page]:border-acento aria-[current=page]:bg-acento-suave aria-[current=page]:text-acento"
            >
              {x.nombre}
            </Link>
          ))}
        </nav>
      )}
      {datos && cajaId && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <ResumenCaja r={datos.resumen} />
          <div className="flex flex-col gap-5">
            {cerrar && (
              <Panel className="p-5">
                <h2 className="mb-4 font-semibold">Cerrar el turno</h2>
                <CerrarCaja cuentaId={cajaId} esperado={Number(datos.resumen.esperado)} />
              </Panel>
            )}
            <Panel>
              <h2 className="flex items-center gap-2 border-b border-borde px-5 py-3 font-semibold">
                <History aria-hidden className="size-4 text-texto-3" /> Cierres anteriores
              </h2>
              {datos.cierres.length ? (
                <ul className="divide-y divide-borde">
                  {datos.cierres.slice(0, 15).map((x) => (
                    <li key={x.id}>
                      <Link
                        href={`/cobranzas/caja/${x.id}`}
                        className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm hover:bg-superficie-2"
                      >
                        <span>
                          {hora(x.hasta)}
                          <span className="block text-xs text-texto-3">{x.usuario}</span>
                        </span>
                        <span className={`cifras text-right ${Number(x.diferencia) === 0 ? 'text-ok' : 'text-error'}`}>
                          {Number(x.diferencia) === 0 ? 'Cuadró' : formatearMonto(x.diferencia, '$')}
                          <span className="block text-xs text-texto-3">{formatearMonto(x.contado, '$')}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-4 text-sm text-texto-3">Todavía no hay cierres de esta caja.</p>
              )}
              {datos.cierres.length > 0 && (
                <p className="border-t border-borde px-5 py-2.5 text-right">
                  <a
                    href={`/cobranzas/caja/${datos.cierres[0].id}/excel?todos=1`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-acento hover:underline"
                  >
                    <ArrowDownToLine aria-hidden className="size-3.5" /> Exportar cierres a Excel
                  </a>
                </p>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}
