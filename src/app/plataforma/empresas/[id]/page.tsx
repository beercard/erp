import { ArrowLeft, LifeBuoy } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { pesos } from '@/components/planes/TarjetasPlanes'
import { Aviso, Boton, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { formatearCuit } from '@/lib/cuit'
import { fechaCorta, hoyArgentina } from '@/lib/fechas'
import { MINUTOS_DE_SOPORTE } from '@/lib/auth/sesiones'
import { FUNCIONES, MESES_COBRADOS_EN_ANUAL, planPorId, precioDeLista, situacion, type Funcion } from '@/lib/planes'
import { fichaEmpresa, listarAuditoria } from '@/modulos/plataforma/consola'
import { historial, suscripcionDe, usoDe } from '@/modulos/plataforma/suscripciones'

import { agregarNotaAccion, bajaEmpresaAccion, entrarSoporteAccion, extenderPruebaAccion, suspenderAccion } from '../../acciones'
import { exigirAdmin } from '../../admin'
import { ChipEstado, ETIQUETA_ACCION, fechaHora, hace, Indicador, Indicadores, TituloPanel } from '../../componentes'
import { BotonAccion, FormularioExtenderPrueba, FormularioNota } from '../../Formularios'
import { FormularioPago, FormularioSuscripcionAdmin } from './FormulariosAdmin'

export const metadata: Metadata = { title: 'Empresa · Plataforma' }

/** Texto legible de un evento del historial de la suscripción. */
function describirEvento(tipo: string, detalle: unknown): string {
  const d = (detalle ?? {}) as Record<string, unknown>
  switch (tipo) {
    case 'alta':
      return `Alta con prueba del plan ${planPorId(String(d.plan ?? 'pyme')).nombre} hasta ${d.pruebaHasta ? fechaCorta(String(d.pruebaHasta)) : '—'}`
    case 'pago':
      return `Pago de $ ${String(d.importe ?? '')} (${String(d.medio ?? '')})${d.hasta ? `, pagado hasta ${fechaCorta(String(d.hasta))}` : ''}${d.referencia ? ` · ${String(d.referencia)}` : ''}`
    case 'pedido':
      return `Pidió el plan ${planPorId(String(d.plan ?? 'gratis')).nombre} (${String(d.ciclo ?? 'mensual')})`
    case 'cambio': {
      const despues = (d.despues ?? d) as Record<string, unknown>
      const partes = [
        despues.plan && `plan ${planPorId(String(despues.plan)).nombre}`,
        despues.estado && `estado ${String(despues.estado)}`,
        despues.pruebaHasta && `prueba hasta ${fechaCorta(String(despues.pruebaHasta))}`,
        despues.pagadoHasta && `pagado hasta ${fechaCorta(String(despues.pagadoHasta))}`,
      ].filter(Boolean)
      return `Cambio: ${partes.join(', ') || 'datos de la suscripción'}`
    }
    default:
      return tipo
  }
}

export default async function FichaEmpresa({ params, searchParams }: PageProps<'/plataforma/empresas/[id]'>) {
  await exigirAdmin()
  const { id } = await params
  const { error } = (await searchParams) as { error?: string }
  const ficha = await fichaEmpresa(id)
  if (!ficha) notFound()
  const hoy = hoyArgentina()
  const [s, uso, eventos, acciones] = await Promise.all([
    suscripcionDe(id),
    usoDe(id, hoy),
    historial(id),
    listarAuditoria({ empresaId: id, limite: 30 }),
  ])
  const sit = situacion(s, hoy)
  const mensual = s.precioAcordado ? Number(s.precioAcordado) : precioDeLista(s)
  const periodo = s.ciclo === 'anual' ? mensual * MESES_COBRADOS_EN_ANUAL : mensual
  const { empresa, miembros, pendientes, notas, ingresos } = ficha
  const activos = miembros.filter((m) => m.activa)

  return (
    <>
      <Link href="/plataforma/empresas" className="mb-3 flex w-fit items-center gap-1.5 text-sm text-texto-2 hover:text-texto">
        <ArrowLeft aria-hidden className="size-4" /> Empresas
      </Link>
      <EncabezadoPagina
        titulo={empresa.razonSocial}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            <span className="cifras">CUIT {formatearCuit(empresa.cuit)}</span>
            <span aria-hidden>·</span>
            <span>alta {fechaCorta(hoyArgentina(empresa.creado))}</span>
            <ChipEstado estado={s.estado} />
            {!empresa.activa && <Chip tono="error">Dada de baja</Chip>}
            {empresa.activa && sit.soloLectura && <Chip tono="error">Solo lectura</Chip>}
          </span>
        }
        acciones={
          <form action={entrarSoporteAccion.bind(null, id)}>
            <Boton
              type="submit"
              variante="primario"
              title={`Solo lectura, durante ${MINUTOS_DE_SOPORTE} minutos. Queda registrado en la empresa.`}
            >
              <LifeBuoy aria-hidden /> Entrar como soporte
            </Boton>
          </form>
        }
      />

      <div className="flex flex-col gap-5">
        {error && <Aviso>{error}</Aviso>}
        {sit.aviso && <Aviso tono={sit.aviso.tono === 'error' ? 'error' : 'aviso'}>{sit.aviso.texto}</Aviso>}

        <Indicadores columnas={5}>
          <Indicador
            rotulo="Plan"
            valor={planPorId(s.plan).nombre}
            detalle={[s.ciclo, ...s.aplicaciones.map((a) => FUNCIONES[a as Funcion]?.nombre)].join(' · ')}
          />
          <Indicador
            rotulo="Precio mensual"
            valor={mensual ? pesos(mensual) : 'Gratis'}
            detalle={s.precioAcordado ? 'acordado, sin IVA' : 'de lista, sin IVA'}
          />
          <Indicador
            rotulo="Usuarios"
            valor={`${uso.usuarios} / ${sit.limites.usuarios ?? '∞'}`}
            detalle="incluye invitaciones pendientes"
          />
          <Indicador
            rotulo="Comprobantes este mes"
            valor={`${uso.comprobantesMes}${sit.limites.comprobantesMes !== null ? ` / ${sit.limites.comprobantesMes}` : ''}`}
            detalle={`${uso.puntosVenta} puntos de venta electrónicos`}
          />
          <Indicador
            rotulo={s.estado === 'prueba' ? 'Prueba hasta' : 'Pagado hasta'}
            valor={
              (s.estado === 'prueba' ? s.pruebaHasta : s.pagadoHasta)
                ? fechaCorta((s.estado === 'prueba' ? s.pruebaHasta : s.pagadoHasta)!)
                : '—'
            }
            detalle={s.mpEstado ? `Mercado Pago: ${s.mpEstado}` : undefined}
          />
        </Indicadores>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <Panel>
              <TituloPanel>Suscripción</TituloPanel>
              <div className="p-4">
                <FormularioSuscripcionAdmin
                  // Se vuelve a armar con lo guardado (el formulario se reinicia al enviarse).
                  key={JSON.stringify(s)}
                  empresaId={id}
                  inicial={{
                    plan: s.plan,
                    estado: s.estado,
                    ciclo: s.ciclo,
                    aplicaciones: s.aplicaciones,
                    usuariosAdicionales: s.usuariosAdicionales,
                    pruebaHasta: s.pruebaHasta,
                    pagadoHasta: s.pagadoHasta,
                    precioAcordado: s.precioAcordado,
                    observaciones: s.observaciones,
                  }}
                />
              </div>
            </Panel>

            <Panel>
              <TituloPanel>Registrar un pago</TituloPanel>
              <div className="p-4">
                <p className="mb-3 text-xs text-texto-2">
                  Corre la fecha de pago un {s.ciclo === 'anual' ? 'año' : 'mes'} desde el vencimiento (o desde hoy si ya venció)
                  y deja la suscripción activa. Período: {pesos(periodo)} + IVA = {pesos(periodo * 1.21)}.
                </p>
                <FormularioPago empresaId={id} sugerido={(periodo * 1.21).toFixed(2).replace('.', ',')} />
              </div>
            </Panel>

            <Panel>
              <TituloPanel>Acciones</TituloPanel>
              <div className="flex flex-wrap items-start gap-6 p-4">
                <FormularioExtenderPrueba accion={extenderPruebaAccion.bind(null, id)} />
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-texto-2">Suscripción</span>
                  {s.estado === 'suspendida' ? (
                    <BotonAccion accion={suspenderAccion.bind(null, id, false)} texto="Reactivar" />
                  ) : (
                    <BotonAccion
                      accion={suspenderAccion.bind(null, id, true)}
                      texto="Suspender"
                      variante="peligro"
                      pregunta="¿Suspender la suscripción? La empresa queda en solo lectura hasta reactivarla."
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-texto-2">Acceso a la empresa</span>
                  {empresa.activa ? (
                    <BotonAccion
                      accion={bajaEmpresaAccion.bind(null, id, false)}
                      texto="Dar de baja"
                      variante="peligro"
                      pregunta="¿Dar de baja la empresa? Nadie va a poder entrar; los datos quedan guardados."
                    />
                  ) : (
                    <BotonAccion accion={bajaEmpresaAccion.bind(null, id, true)} texto="Habilitar de nuevo" />
                  )}
                </div>
              </div>
            </Panel>

            <Panel className="overflow-x-auto">
              <TituloPanel>Historial de la suscripción</TituloPanel>
              {eventos.length === 0 ? (
                <p className="px-4 py-4 text-sm text-texto-2">Sin movimientos.</p>
              ) : (
                <table className="w-full min-w-[560px] text-sm">
                  <tbody className="divide-y divide-borde">
                    {eventos.map((e) => (
                      <tr key={e.id}>
                        <td className="cifras px-4 py-2 align-top text-xs whitespace-nowrap text-texto-2">
                          {fechaHora(e.creado)}
                        </td>
                        <td className="px-4 py-2">
                          {describirEvento(e.tipo, e.detalle)}
                          {e.estado && <span className="text-texto-3"> · {e.estado}</span>}
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-texto-3">{e.usuario ?? 'Sistema'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <Panel>
              <TituloPanel>Notas internas</TituloPanel>
              <div className="p-4">
                <FormularioNota accion={agregarNotaAccion.bind(null, id)} />
              </div>
              {notas.length > 0 && (
                <ul className="divide-y divide-borde border-t border-borde text-sm">
                  {notas.map((n) => (
                    <li key={n.id} className="px-4 py-2.5">
                      <p className="whitespace-pre-line">{String((n.detalle as { texto?: string }).texto ?? '')}</p>
                      <p className="mt-1 text-xs text-texto-3">
                        {n.usuario ?? '—'} · {fechaHora(n.creado)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel>
              <TituloPanel extra={<span className="text-xs text-texto-2">{activos.length} con acceso</span>}>
                Usuarios
              </TituloPanel>
              <ul className="divide-y divide-borde text-sm">
                {miembros.map((m) => (
                  <li
                    key={m.id}
                    className={`flex items-center justify-between gap-3 px-4 py-2.5 ${m.activa ? '' : 'text-texto-3'}`}
                  >
                    <span className="min-w-0">
                      <Link
                        href={`/plataforma/usuarios?q=${encodeURIComponent(m.email)}`}
                        className="block truncate font-medium hover:text-acento"
                      >
                        {m.nombre}
                      </Link>
                      <span className="block truncate text-xs text-texto-3">
                        {m.email} · {m.rol}
                        {!m.activa && ' · sin acceso'}
                        {!m.usuarioActivo && ' · desactivado'}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-texto-2" title={fechaHora(m.ultimoIngreso)}>
                      {hace(m.ultimoIngreso)}
                    </span>
                  </li>
                ))}
              </ul>
              {pendientes.length > 0 && (
                <div className="border-t border-borde px-4 py-3">
                  <p className="mb-1.5 text-xs font-medium text-texto-2">Invitaciones pendientes</p>
                  <ul className="flex flex-col gap-1 text-xs">
                    {pendientes.map((i) => (
                      <li key={`${i.email}-${i.creada.toISOString()}`}>
                        {i.email} · {i.rol} · vence {fechaHora(i.vence)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>

            <Panel>
              <TituloPanel>Últimos ingresos</TituloPanel>
              {ingresos.length === 0 ? (
                <p className="px-4 py-4 text-sm text-texto-2">Nadie entró todavía.</p>
              ) : (
                <ul className="divide-y divide-borde text-sm">
                  {ingresos.map((i, n) => (
                    <li key={n} className="flex justify-between gap-3 px-4 py-2">
                      <span className={i.entidad === 'soporte' ? 'text-info' : ''}>{i.usuario}</span>
                      <span className="cifras text-xs text-texto-2">{fechaHora(i.fecha)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel>
              <TituloPanel>Datos de la empresa</TituloPanel>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
                {[
                  ['Nombre de fantasía', empresa.nombreFantasia],
                  [
                    'Domicilio fiscal',
                    [empresa.domicilioFiscal, empresa.localidad, empresa.provincia].filter(Boolean).join(', '),
                  ],
                  ['Ingresos Brutos', [empresa.iibbNumero, empresa.iibbRegimen].filter(Boolean).join(' · ')],
                  ['Inicio de actividades', empresa.inicioActividades && fechaCorta(empresa.inicioActividades)],
                ].map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-texto-2">{k}</dt>
                    <dd className="break-words">{v || '—'}</dd>
                  </div>
                ))}
              </dl>
            </Panel>

            {acciones.length > 0 && (
              <Panel>
                <TituloPanel
                  extra={
                    <Link
                      href={`/plataforma/auditoria?empresa=${id}`}
                      className="text-xs font-medium text-acento hover:underline"
                    >
                      Ver todo
                    </Link>
                  }
                >
                  Cambios hechos por la plataforma
                </TituloPanel>
                <ul className="divide-y divide-borde text-sm">
                  {acciones.slice(0, 8).map((a) => (
                    <li key={a.id} className="flex justify-between gap-3 px-4 py-2">
                      <span>
                        {ETIQUETA_ACCION[a.accion] ?? a.accion}
                        <span className="block text-xs text-texto-3">{a.usuario ?? '—'}</span>
                      </span>
                      <span className="cifras text-xs text-texto-2">{fechaHora(a.creado)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
