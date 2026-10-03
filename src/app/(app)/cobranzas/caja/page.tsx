import { ArrowDownToLine, History, Settings2 } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, BotonEnlace, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { tienePermiso } from '@/lib/permisos'
import { arqueables, cajas, listarCierres, turnoEnCurso } from '@/modulos/tesoreria/cierres'
import { saldoCuenta } from '@/modulos/tesoreria/cuentas'

import { AbrirCaja, CerrarCaja, ConfigurarCaja } from './Piezas'
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
  const elegida = (typeof c === 'string' && lista.find((x) => x.id === c)) || lista[0]
  const cajaId = elegida?.id
  const datos = cajaId
    ? await enLaEmpresa('ventas.ver', async (tx) => {
        const { turno, desde, resumen } = await turnoEnCurso(tx, cajaId)
        return {
          turno,
          desde,
          resumen,
          saldo: await saldoCuenta(tx, cajaId),
          abrio: turno?.usuarioId === sesion.usuario.id ? 'vos' : null,
          cierres: await listarCierres(tx, { cuentaId: cajaId }),
        }
      })
    : null
  const cerrar = tienePermiso(sesion.permisos, 'ventas.cobrar')
  const supervisar = tienePermiso(sesion.permisos, 'ventas.supervisar_caja')
  // Caja por turnos sin turno abierto: lo primero es abrirla.
  const cerrada = !!elegida?.exigeTurno && !datos?.turno
  return (
    <>
      <EncabezadoPagina
        titulo="Cierre de caja"
        bajada={
          !datos
            ? 'Resumen del turno y arqueo de la caja.'
            : cerrada
              ? 'La caja está cerrada: abrila contando el fondo inicial para empezar a cobrar.'
              : datos.turno
                ? `Caja abierta desde el ${hora(datos.desde)} con ${formatearMonto(datos.turno.fondoContado, '$')} de fondo: lo cobrado, por qué medio y quién, y cuánto efectivo debería haber.`
                : `Turno desde el ${hora(datos.desde)}: lo cobrado, por qué medio y quién, y cuánto efectivo debería haber.`
        }
        acciones={
          <>
            <BotonEnlace href="/tesoreria/vales" variante="secundario">
              Vales a rendir
            </BotonEnlace>
            <BotonEnlace href="/tesoreria/movimiento" variante="secundario">
              Registrar un retiro o gasto
            </BotonEnlace>
          </>
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
          {cerrada ? (
            <Panel className="p-5">
              <h2 className="mb-4 font-semibold">Abrir la caja</h2>
              {cerrar ? (
                <AbrirCaja cuentaId={cajaId} esperado={Number(datos.saldo)} />
              ) : (
                <p className="text-sm text-texto-3">No tenés permiso para abrir la caja.</p>
              )}
            </Panel>
          ) : (
            <ResumenCaja r={datos.resumen} />
          )}
          <div className="flex flex-col gap-5">
            {cerrar && !cerrada && (
              <Panel className="p-5">
                <h2 className="mb-4 font-semibold">{datos.turno ? 'Cerrar la caja' : 'Cerrar el turno'}</h2>
                <CerrarCaja
                  cuentaId={cajaId}
                  esperado={Number(datos.resumen.esperado)}
                  medios={arqueables(datos.resumen)}
                  maxima={elegida.diferenciaMaxima != null && !supervisar ? Number(elegida.diferenciaMaxima) : null}
                />
              </Panel>
            )}
            {supervisar && (
              <Panel className="p-5">
                <h2 className="mb-4 flex items-center gap-2 font-semibold">
                  <Settings2 aria-hidden className="size-4 text-texto-3" /> Configuración de la caja
                </h2>
                <ConfigurarCaja
                  key={`${elegida.exigeTurno}-${elegida.diferenciaMaxima}-${JSON.stringify(elegida.avisoCierre)}`}
                  cuentaId={cajaId}
                  exigeTurno={elegida.exigeTurno}
                  diferenciaMaxima={elegida.diferenciaMaxima}
                  correos={elegida.avisoCierre?.correos ?? []}
                  telefonos={elegida.avisoCierre?.telefonos ?? []}
                />
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
