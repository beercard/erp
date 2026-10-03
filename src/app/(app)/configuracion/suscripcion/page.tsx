import type { Metadata } from 'next'
import { EnlaceAyuda } from '@/components/ayuda/EnlaceAyuda'
import Link from 'next/link'

import { ComparativaPlanes, pesos } from '@/components/planes/TarjetasPlanes'
import { Aviso, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { requerirEmpresa } from '@/lib/auth/servidor'
import { fechaCorta, hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { APLICACIONES, FUNCIONES, planPorId, planQueIncluye, precioDeLista, situacion, type Funcion } from '@/lib/planes'
import { ESTADOS_DEBITO, mpConfigurado } from '@/modulos/plataforma/mercadopago'
import { historial, suscripcionDe, usoDe } from '@/modulos/plataforma/suscripciones'

import { DarDeBaja, FormularioSuscripcion, PagarConMercadoPago } from './FormularioSuscripcion'

export const metadata: Metadata = { title: 'Suscripción' }

const ESTADOS: Record<string, { texto: string; tono: 'ok' | 'info' | 'aviso' | 'error' | 'neutro' }> = {
  prueba: { texto: 'Prueba gratis', tono: 'info' },
  activa: { texto: 'Activa', tono: 'ok' },
  impaga: { texto: 'Impaga', tono: 'aviso' },
  suspendida: { texto: 'Suspendida', tono: 'error' },
  cancelada: { texto: 'Cancelada', tono: 'neutro' },
}

const EVENTOS: Record<string, string> = { alta: 'Alta', cambio: 'Cambio', pago: 'Pago', pedido: 'Pedido de cambio', nota: 'Nota' }

function Uso({ titulo, usado, tope }: { titulo: string; usado: number; tope: number | null }) {
  const pct = tope ? Math.min(100, (usado / tope) * 100) : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-2 text-sm">
        <span>{titulo}</span>
        <span className="cifras text-texto-2">
          {usado.toLocaleString('es-AR')} {tope === null ? '· sin límite' : `de ${tope.toLocaleString('es-AR')}`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-superficie-2" aria-hidden>
        <div
          className={`h-full ${pct >= 90 ? 'bg-error' : pct >= 70 ? 'bg-aviso' : 'bg-acento'}`}
          style={{ width: `${tope === null ? 4 : pct}%` }}
        />
      </div>
    </div>
  )
}

export default async function Suscripcion({ searchParams }: PageProps<'/configuracion/suscripcion'>) {
  const sesion = await requerirEmpresa()
  const { funcion, mp } = (await searchParams) as { funcion?: string; mp?: string }
  const hoy = hoyArgentina()
  const [s, uso, eventos] = await Promise.all([
    suscripcionDe(sesion.empresa.id),
    usoDe(sesion.empresa.id, hoy),
    historial(sesion.empresa.id),
  ])
  const sit = situacion(s, hoy)
  const plan = planPorId(s.plan)
  const precio = s.precioAcordado ? Number(s.precioAcordado) : precioDeLista(s)
  const pendiente = eventos.find((e) => e.tipo === 'pedido' && e.estado === 'pendiente')
  const falta = funcion && funcion in FUNCIONES ? (funcion as Funcion) : null
  const estado = ESTADOS[s.estado] ?? ESTADOS.activa

  return (
    <>
      <EncabezadoPagina
        acciones={<EnlaceAyuda guia="suscripcion" />}
        titulo="Suscripción"
        bajada="Plan, aplicaciones y uso de la empresa en el sistema."
      />
      {falta && !sit.funciones.includes(falta) && (
        <div className="mb-4">
          <Aviso tono="info">
            {FUNCIONES[falta].nombre} no está incluido en el plan {plan.nombre}.{' '}
            {APLICACIONES.some((a) => a.id === falta)
              ? 'Es una aplicación: se suma abajo, en Aplicaciones.'
              : `Está desde el plan ${planQueIncluye(falta)?.nombre}.`}
          </Aviso>
        </div>
      )}
      {sit.aviso && (
        <div className="mb-4">
          <Aviso tono={sit.aviso.tono === 'error' ? 'error' : sit.aviso.tono}>{sit.aviso.texto}</Aviso>
        </div>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Plan {plan.nombre}</h2>
            <Chip tono={estado.tono}>{estado.texto}</Chip>
            {s.aplicaciones.map((a) => (
              <Chip key={a} tono="acento">
                {FUNCIONES[a as Funcion]?.nombre ?? a}
              </Chip>
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-texto-2">Precio</dt>
            <dd className="cifras">
              {precio ? `${pesos(precio)} /mes + IVA` : 'Gratis'}
              {s.precioAcordado && <span className="block text-xs text-texto-3">Precio acordado</span>}
            </dd>
            <dt className="text-texto-2">Forma de pago</dt>
            <dd>{s.ciclo === 'anual' ? 'Anual' : 'Mensual'}</dd>
            {s.pruebaHasta && (
              <>
                <dt className="text-texto-2">Prueba hasta</dt>
                <dd className="cifras">{fechaCorta(s.pruebaHasta)}</dd>
              </>
            )}
            {s.pagadoHasta && (
              <>
                <dt className="text-texto-2">Pagado hasta</dt>
                <dd className="cifras">{fechaCorta(s.pagadoHasta)}</dd>
              </>
            )}
          </dl>
          {pendiente && (
            <Aviso tono="aviso">
              Hay un pedido de cambio al plan {planPorId((pendiente.detalle as { plan: string }).plan).nombre} del{' '}
              {fechaCorta(hoyArgentina(pendiente.creado))}, esperando el pago.
            </Aviso>
          )}
          {mp === '1' && s.mpEstado !== 'authorized' && (
            <Aviso tono="info">Si autorizaste el débito en Mercado Pago, en unos minutos queda registrado acá.</Aviso>
          )}
          {mpConfigurado() && (precio > 0 || pendiente) && tienePermiso(sesion.permisos, 'empresa.suscripcion') && (
            <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-3">
              {s.mpEstado === 'authorized' ? (
                <Chip tono="ok">Débito automático de Mercado Pago activo</Chip>
              ) : (
                <>
                  <PagarConMercadoPago />
                  <span className="text-xs text-texto-2">
                    Con tarjeta o dinero en cuenta. Se debita solo{s.ciclo === 'anual' ? ' cada año' : ' cada mes'} y la
                    suscripción se renueva sola.
                    {s.mpEstado && s.mpEstado !== 'pending' && ` Estado actual: ${ESTADOS_DEBITO[s.mpEstado] ?? s.mpEstado}.`}
                  </span>
                </>
              )}
            </div>
          )}
        </Panel>
        <Panel className="flex flex-col gap-4 p-4">
          <h2 className="text-sm font-semibold">Uso</h2>
          <Uso titulo="Usuarios (con invitaciones pendientes)" usado={uso.usuarios} tope={sit.limites.usuarios} />
          <Uso titulo="Comprobantes con CAE este mes" usado={uso.comprobantesMes} tope={sit.limites.comprobantesMes} />
          <Uso titulo="Puntos de venta electrónicos" usado={uso.puntosVenta} tope={sit.limites.puntosVenta} />
        </Panel>
      </div>

      <Panel className="mb-4 p-4">
        <h2 className="mb-3 text-sm font-semibold">Cambiar la suscripción</h2>
        {!tienePermiso(sesion.permisos, 'empresa.suscripcion') && (
          <p className="mb-3 text-sm text-texto-2">Solo quien administra la empresa puede cambiarla.</p>
        )}
        <FormularioSuscripcion
          plan={s.plan}
          ciclo={s.ciclo}
          aplicaciones={s.aplicaciones}
          usuariosAdicionales={s.usuariosAdicionales}
          enPrueba={s.estado === 'prueba'}
          puedeCambiar={tienePermiso(sesion.permisos, 'empresa.suscripcion')}
        />
      </Panel>

      <section className="mb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Qué incluye cada plan</h2>
          <Link href="/precios" target="_blank" className="text-sm text-acento hover:underline">
            Ver la página de precios
          </Link>
        </div>
        <ComparativaPlanes />
      </section>

      {tienePermiso(sesion.permisos, 'empresa.suscripcion') && s.estado !== 'cancelada' && (
        <Panel id="baja" className="mb-4 p-4">
          <h2 className="mb-2 text-sm font-semibold">Dar de baja</h2>
          <DarDeBaja
            bajaDesde={s.bajaDesde ?? null}
            hastaFuncionando={s.estado !== 'prueba' && s.pagadoHasta && s.pagadoHasta >= hoy ? s.pagadoHasta : hoy}
          />
        </Panel>
      )}

      {eventos.length > 0 && (
        <Panel className="overflow-x-auto">
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Historial</h2>
          <table className="w-full min-w-[520px] text-sm">
            <tbody className="divide-y divide-borde">
              {eventos.map((e) => {
                const d = e.detalle as { plan?: string; despues?: { plan?: string }; hasta?: string }
                const planDe = d.plan ?? d.despues?.plan
                return (
                  <tr key={e.id}>
                    <td className="cifras px-4 py-2 text-texto-2">{fechaCorta(hoyArgentina(e.creado))}</td>
                    <td className="px-4 py-2">
                      {EVENTOS[e.tipo] ?? e.tipo}
                      {planDe && ` · plan ${planPorId(planDe).nombre}`}
                      {d.hasta && ` · pagado hasta ${fechaCorta(d.hasta)}`}
                      {e.estado && e.estado !== 'pendiente' && <span className="text-texto-3"> · {e.estado}</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-texto-3">{e.usuario}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  )
}
