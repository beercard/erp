import { and, asc, eq, inArray } from 'drizzle-orm'
import { MapPin, Printer, Smartphone } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { VistaRespuestas } from '@/components/servicio/VistaRespuestas'
import { Aviso, BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { depositos, puntosVenta } from '@/db/schema'
import { formatearMonto, monto, sumar } from '@/lib/dinero'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { listarEtiquetas } from '@/modulos/servicio/etiquetas'
import { geocercaDeOrden } from '@/modulos/servicio/jornada'
import { equiposDelCliente, listarTecnicos, marcarVencidas, obtenerOrden } from '@/modulos/servicio/servicio'
import { cerradaEnPersat, CIERRES, COBERTURAS, estaAbierta, estaHecha, seTrabaja, TIPOS_ORDEN } from '@/modulos/servicio/tipos'
import { tiposParaOrden } from '@/modulos/servicio/tiposOrden'
import { correoConfigurado } from '@/modulos/comunicaciones/correo'

import { alicuotas, paginaContratos } from '../../contratos/modulo'
import { quitarItemAccion, reabrirAccion } from '../acciones'
import { AvisosCliente } from '../AvisosCliente'
import { ChipEstado, ChipSla } from '../ChipEstado'
import { EtiquetasOrden } from '../EtiquetasOrden'
import { Cancelar, Cerrar, Facturar, FormularioOrden, Item, Programar, Recerrar, Visita } from '../Formularios'

export const metadata: Metadata = { title: 'Orden de servicio' }

const cifra = (v: string) => monto(v).toNumber().toLocaleString('es-AR', { maximumFractionDigits: 4 })
const horaDe = (d: Date) =>
  d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })

export default async function Orden({ params, searchParams }: PageProps<'/servicio/[id]'>) {
  const sesion = await paginaContratos('servicio.ver')
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const { guardada, error } = (await searchParams) as { guardada?: string; error?: string }
  const datos = await conEmpresa(sesion.empresa.id, async (tx) => {
    await marcarVencidas(tx)
    const o = await obtenerOrden(tx, id)
    if (!o) return null
    const [tecnicos, deps, puntos, tipos, equipos, gps, etiquetas] = await Promise.all([
      listarTecnicos(tx),
      tx.select().from(depositos).where(eq(depositos.activo, true)).orderBy(asc(depositos.codigo)),
      tx
        .select({ numero: puntosVenta.numero, nombre: puntosVenta.nombre })
        .from(puntosVenta)
        .where(and(eq(puntosVenta.activo, true), inArray(puntosVenta.tipo, ['electronico'])))
        .orderBy(puntosVenta.numero),
      tiposParaOrden(tx),
      equiposDelCliente(tx, o.terceroId),
      geocercaDeOrden(tx, o.id),
      listarEtiquetas(tx),
    ])
    return { o, tecnicos, deps, puntos, tipos, equipos, gps, etiquetas }
  })
  if (!datos) notFound()
  const { o, deps, puntos, equipos } = datos
  // El tipo de la orden aunque se haya dado de baja, con su versión de formulario.
  const tipos =
    o.tipoOrden && o.plantilla && !datos.tipos.some((t) => t.id === o.tipoOrdenId)
      ? [
          ...datos.tipos,
          {
            id: o.tipoOrden.id,
            nombre: o.tipoOrden.nombre,
            clase: o.tipoOrden.clase,
            duracion: o.tipoOrden.duracion,
            instrucciones: o.plantilla.instrucciones,
          },
        ]
      : datos.tipos
  const tecnicos = datos.tecnicos.map((t) => ({ valor: t.id, texto: t.nombre }))
  const nombresEquipos = Object.fromEntries(
    [...equipos, ...(o.equipo ? [o.equipo] : [])].map((e) => [e.id, `${e.serie}${e.modelo ? ` · ${e.modelo}` : ''}`]),
  )
  const hoy = hoyArgentina()
  const abierta = estaAbierta(o.estado)
  const puede = (p: string) => tienePermiso(sesion.permisos, p)
  const cargar = puede('servicio.cargar')
  const conCargo = o.cobertura === 'cargo' && !cerradaEnPersat(o)
  const totalNeto = sumar(o.items.map((i) => monto(i.cantidad).times(i.precioUnitario)))
  const horas = sumar(o.visitas.map((v) => v.horas))

  return (
    <>
      <EncabezadoPagina
        titulo={`Orden de servicio ${o.numero}`}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {o.cliente.razonSocial}
              {o.equipo && (
                <>
                  {' · '}
                  <Link href={`/equipos/${o.equipo.id}`} className="cifras text-acento hover:underline">
                    {o.equipo.serie}
                  </Link>
                  {o.equipo.modelo ? ` ${o.equipo.modelo}` : ''}
                </>
              )}
              {' · '}
              {o.tipoOrden?.nombre ?? TIPOS_ORDEN[o.tipo as keyof typeof TIPOS_ORDEN]}
              {o.plantilla && <span className="text-texto-3"> (formulario v{o.plantilla.version})</span>}
            </span>
            {o.prioridad === 'urgente' && abierta && <Chip tono="error">Urgente</Chip>}
            <ChipEstado estado={o.estado} cobertura={o.cobertura} facturada={!!o.comprobanteId} migrada={cerradaEnPersat(o)} />
            <ChipSla o={o} />
          </span>
        }
        acciones={
          <>
            {abierta && o.tecnicoId && (
              <BotonEnlace href={`/tecnico/${o.id}`}>
                <Smartphone aria-hidden className="size-4" /> Vista del técnico
              </BotonEnlace>
            )}
            <BotonEnlace href={`/imprimir/servicio/${o.id}`}>
              <Printer aria-hidden className="size-4" /> Constancia
            </BotonEnlace>
          </>
        }
      />
      <EtiquetasOrden
        key={o.etiquetas.map((e) => e.id).join()}
        id={o.id}
        actuales={o.etiquetas}
        disponibles={datos.etiquetas}
        editar={cargar}
      />
      {guardada && (
        <div className="mb-4">
          <Aviso tono="ok">Orden guardada.</Aviso>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}
      {o.estado === 'vencida' && (
        <div className="mb-4">
          <Aviso>
            Venció el {o.vence ? horaDe(o.vence) : ''} sin informe del técnico. Reprogramala o cerrala como no cumplida.
          </Aviso>
        </div>
      )}
      {o.estado === 'informe' && cargar && (
        <div className="mb-4">
          <Aviso tono="info">El técnico mandó el informe: revisalo abajo y cerrá la orden.</Aviso>
        </div>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Pedido del {o.fecha.split('-').reverse().join('/')}</h2>
          <p className="text-sm whitespace-pre-line">{o.falla}</p>
          <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-texto-3">Domicilio</dt>
              <dd>
                {o.domicilio ?? '—'}
                {o.equipo?.sector ? ` · ${o.equipo.sector}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-texto-3">Contacto</dt>
              <dd>{[o.contacto, o.telefono].filter(Boolean).join(' · ') || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-3">Quién paga</dt>
              <dd>
                {COBERTURAS[o.cobertura as keyof typeof COBERTURAS]}
                {o.cobertura === 'contrato' && o.contratoId && (
                  <>
                    {' · '}
                    <Link href={`/contratos/${o.contratoId}`} className="text-acento hover:underline">
                      ver contrato
                    </Link>
                  </>
                )}
                {o.cobertura === 'garantia' && o.equipo?.garantiaHasta && ` hasta el ${o.equipo.garantiaHasta}`}
              </dd>
            </div>
            {o.observaciones && (
              <div>
                <dt className="text-xs text-texto-3">Observaciones</dt>
                <dd>{o.observaciones}</dd>
              </div>
            )}
          </dl>
          {o.plantilla && o.plantilla.instrucciones.some((c) => c.tipo !== 'equipo') && (
            <div className="mt-4 border-t border-borde pt-3">
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-texto-2 uppercase">Instrucciones</h3>
              <VistaRespuestas
                campos={o.plantilla.instrucciones.filter((c) => c.tipo !== 'equipo')}
                valores={o.instrucciones}
                equipos={nombresEquipos}
              />
            </div>
          )}
          {cargar && o.estado !== 'cancelada' && !o.comprobanteId && (
            <details className="mt-4 border-t border-borde pt-3">
              <summary className="cursor-pointer text-sm text-acento">Corregir los datos de la orden</summary>
              <div className="mt-3">
                <FormularioOrden id={o.id} inicial={{ ...o, cliente: o.cliente.razonSocial }} tecnicos={tecnicos} tipos={tipos} />
              </div>
            </details>
          )}
        </Panel>

        <Panel className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Visita</h2>
          <p className="text-sm">
            {o.tecnico?.nombre ?? <span className="text-texto-3">Sin técnico</span>}
            {o.tecnico?.telefono && <span className="block text-xs text-texto-3">{o.tecnico.telefono}</span>}
            {o.acompanantes.length > 0 && (
              <span className="block text-xs text-texto-2">
                Acompaña{o.acompanantes.length > 1 ? 'n' : ''}: {o.acompanantes.map((t) => t.nombre).join(', ')}
              </span>
            )}
          </p>
          <p className="mt-1 text-sm text-texto-2">
            {o.programada
              ? `${o.programada.split('-').reverse().join('/')}${o.hora ? ` a las ${o.hora}` : ''} · ${o.duracion} min`
              : 'Sin día de visita'}
          </p>
          {(o.llegada || o.salida) && (
            <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-borde pt-3 text-sm">
              <div>
                <dt className="text-xs text-texto-3">Llegó</dt>
                <dd>
                  {o.llegada ? horaDe(o.llegada) : '—'}
                  {o.llegadaLat && o.llegadaLng && (
                    <a
                      href={`https://www.google.com/maps?q=${o.llegadaLat},${o.llegadaLng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 inline-flex items-center text-acento"
                      title="Dónde marcó la llegada"
                    >
                      <MapPin aria-hidden className="size-3.5" />
                    </a>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-texto-3">Informó</dt>
                <dd>{o.informada ? horaDe(o.informada) : '—'}</dd>
              </div>
            </dl>
          )}
          {datos.gps.length > 0 && (
            <div className="mt-3 border-t border-borde pt-3 text-sm">
              <p className="text-xs text-texto-3">Según el GPS (geocerca)</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {datos.gps.map((g, i) => (
                  <li key={i}>
                    {g.tipo === 'entrada' ? 'Entró' : 'Salió'} {horaDe(g.momento)}
                    {g.minutos !== null && <span className="text-texto-2"> · estuvo {g.minutos} min</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {abierta && cargar && (
            <div className="mt-3 border-t border-borde pt-3">
              {tecnicos.length ? (
                <Programar
                  key={`${o.tecnicoId}|${o.programada}|${o.hora}|${o.duracion}|${o.acompanantes.map((t) => t.id).join()}`}
                  id={o.id}
                  tecnicos={tecnicos}
                  hoy={hoy}
                  inicial={{
                    tecnicoId: o.tecnicoId,
                    programada: o.programada,
                    hora: o.hora,
                    duracion: o.duracion,
                    acompanantes: o.acompanantes.map((t) => t.id),
                  }}
                />
              ) : (
                <p className="text-xs text-texto-2">
                  No hay técnicos cargados: se agregan en{' '}
                  <Link href="/configuracion/tecnicos" className="text-acento hover:underline">
                    Configuración › Técnicos
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
        </Panel>
      </div>

      {(o.resultados || o.estado === 'informe' || o.solucion) && (
        <Panel className="mb-4 p-4">
          <h2 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
            Informe del técnico
            {o.cierreTecnico && (
              <Chip tono={o.cierreTecnico === 'ok' ? 'ok' : o.cierreTecnico === 'desvio' ? 'aviso' : 'error'}>
                Propuso: {CIERRES[o.cierreTecnico as keyof typeof CIERRES]}
              </Chip>
            )}
          </h2>
          {o.solucion && <p className="mb-3 text-sm whitespace-pre-line">{o.solucion}</p>}
          {o.plantilla && (
            <VistaRespuestas campos={o.plantilla.devolucion} valores={o.resultados} equipos={nombresEquipos} vacio="" />
          )}
        </Panel>
      )}

      {cargar && ((abierta && !!o.programada) || estaHecha(o.estado) || o.avisos.length > 0 || o.encuesta) && (
        <Panel className="mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold">Avisos al cliente</h2>
          <AvisosCliente
            id={o.id}
            visita={abierta && !!o.programada}
            cierre={estaHecha(o.estado)}
            correoConfigurado={correoConfigurado()}
          />
          {o.avisos.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 border-t border-borde pt-3 text-xs text-texto-2">
              {o.avisos.map((c) => (
                <li key={c.id} className="flex flex-wrap gap-x-2">
                  <span>{horaDe(c.creado)}</span>
                  <span className="font-medium text-texto">{c.asunto}</span>
                  <span>a {c.para}</span>
                  <Chip tono={c.estado === 'enviado' ? 'ok' : c.estado === 'error' ? 'error' : 'neutro'}>
                    {c.estado === 'enviado' ? 'Enviado' : c.estado === 'error' ? 'Error al enviar' : 'Pendiente de envío'}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
          {o.encuesta && (
            <p className="mt-3 border-t border-borde pt-3 text-sm">
              {o.encuesta.respondida ? (
                <>
                  Encuesta: <span className="font-medium text-aviso">{'★'.repeat(o.encuesta.puntaje ?? 0)}</span>
                  <span className="text-texto-3">{'★'.repeat(5 - (o.encuesta.puntaje ?? 0))}</span> · recomendaría{' '}
                  {o.encuesta.nps}/10
                  {o.encuesta.comentario && <span className="block text-texto-2">“{o.encuesta.comentario}”</span>}
                </>
              ) : (
                <span className="text-texto-2">Encuesta enviada, sin respuesta todavía.</span>
              )}
            </p>
          )}
        </Panel>
      )}

      <Panel className="mb-4 overflow-x-auto">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">
          Visitas
          {o.visitas.length > 0 && Number(horas) > 0 && (
            <span className="ml-2 font-normal text-texto-3">{cifra(horas.toString())} h en total</span>
          )}
        </h2>
        {o.visitas.length === 0 ? (
          <p className="p-4 text-sm text-texto-2">Todavía no hay visitas.</p>
        ) : (
          <table className="w-full min-w-[520px] text-sm">
            <tbody className="divide-y divide-borde">
              {o.visitas.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2 whitespace-nowrap">{v.fecha.split('-').reverse().join('/')}</td>
                  <td className="px-4 py-2">{v.tecnico ?? '—'}</td>
                  <td className="px-4 py-2">{v.detalle}</td>
                  <td className="cifras px-4 py-2 text-right whitespace-nowrap">
                    {Number(v.horas) ? `${cifra(v.horas)} h` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {seTrabaja(o.estado) && cargar && (
          <details className="border-t border-borde p-4">
            <summary className="cursor-pointer text-sm text-acento">Cargar una visita a mano</summary>
            <div className="mt-3">
              <Visita
                key={`${o.tecnicoId}|${o.visitas.length}`}
                id={o.id}
                tecnicos={tecnicos}
                tecnicoId={o.tecnicoId}
                hoy={hoy}
              />
            </div>
          </details>
        )}
      </Panel>

      <Panel className="mb-4 overflow-x-auto">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Insumos, repuestos y mano de obra</h2>
        {o.items.length === 0 ? (
          <p className="p-4 text-sm text-texto-2">Nada cargado.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">Descripción</th>
                <th className="px-4 py-2 font-medium">Depósito</th>
                <th className="px-4 py-2 text-right font-medium">Cantidad</th>
                <th className="px-4 py-2 text-right font-medium">Precio</th>
                <th className="px-4 py-2 text-right font-medium">Subtotal</th>
                {seTrabaja(o.estado) && cargar && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {o.items.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-2">
                    {i.codigo && <span className="cifras mr-1 text-texto-3">{i.codigo}</span>}
                    {i.descripcion}
                  </td>
                  <td className="px-4 py-2 text-texto-2">{i.deposito ?? ''}</td>
                  <td className="cifras px-4 py-2 text-right">{cifra(i.cantidad)}</td>
                  <td className="cifras px-4 py-2 text-right">
                    {Number(i.precioUnitario) ? (
                      formatearMonto(i.precioUnitario)
                    ) : (
                      <span className="text-texto-3">sin cargo</span>
                    )}
                  </td>
                  <td className="cifras px-4 py-2 text-right">
                    {Number(i.precioUnitario) ? formatearMonto(monto(i.cantidad).times(i.precioUnitario)) : ''}
                  </td>
                  {seTrabaja(o.estado) && cargar && (
                    <td className="px-4 py-2 text-right">
                      <form action={quitarItemAccion.bind(null, o.id, i.id)}>
                        <BotonConfirmar
                          pregunta={`¿Quitar “${i.descripcion}”?${i.deposito ? ' Vuelve al depósito.' : ''}`}
                          className="h-7 px-2 text-xs"
                        >
                          Quitar
                        </BotonConfirmar>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {Number(totalNeto) > 0 && (
              <tfoot className="border-t border-borde">
                <tr>
                  <td colSpan={4} className="px-4 py-2 text-right text-xs text-texto-2">
                    Total sin IVA
                    {conCargo
                      ? ''
                      : cerradaEnPersat(o)
                        ? ' (no se factura: se cerró en Persat)'
                        : ' (no se factura: la orden no es con cargo)'}
                  </td>
                  <td className="cifras px-4 py-2 text-right font-medium">{formatearMonto(totalNeto)}</td>
                  {seTrabaja(o.estado) && cargar && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        )}
        {seTrabaja(o.estado) && cargar && (
          <div className="border-t border-borde p-4">
            <Item
              id={o.id}
              conCargo={conCargo}
              alicuotas={alicuotas}
              depositos={deps.map((d) => ({ valor: d.id, texto: d.nombre }))}
            />
          </div>
        )}
      </Panel>

      {(abierta || o.estado === 'informe') && cargar && (
        <Panel className="mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold">
            {o.estado === 'informe' ? 'Revisar y cerrar' : 'Cerrar desde la oficina'}
          </h2>
          <Cerrar id={o.id} hoy={hoy} conEquipo={!!o.equipoId} sugerido={o.cierreTecnico} informada={o.estado === 'informe'} />
          {o.estado === 'informe' && (
            <form action={reabrirAccion.bind(null, o.id)} className="mt-3 border-t border-borde pt-3">
              <BotonConfirmar pregunta="¿Devolverle la orden al técnico? Vuelve a quedar asignada para que la complete.">
                Devolver al técnico
              </BotonConfirmar>
            </form>
          )}
        </Panel>
      )}

      {o.fechaResolucion && o.estado.startsWith('cerrada') && (
        <Panel className="mb-4 p-4">
          <h2 className="mb-2 text-sm font-semibold">Cerrada el {o.fechaResolucion.split('-').reverse().join('/')}</h2>
          {o.notaCierre && <p className="text-sm whitespace-pre-line">{o.notaCierre}</p>}
          {o.contador !== null && (
            <p className="mt-1 text-sm text-texto-2">
              Contador: <span className="cifras">{o.contador.toLocaleString('es-AR')}</span>
            </p>
          )}
          {cargar && (
            <div className="mt-3">
              <Recerrar id={o.id} actual={o.estado} nota={o.notaCierre} />
            </div>
          )}
          {o.factura ? (
            <p className="mt-3 text-sm">
              <Link href={`/facturas/${o.factura.id}`} className="text-acento hover:underline">
                {o.factura.estado === 'borrador'
                  ? 'Factura en borrador'
                  : `Factura ${o.factura.letra} ${String(o.factura.puntoVenta).padStart(5, '0')}-${String(o.factura.numero ?? 0).padStart(8, '0')}`}
              </Link>{' '}
              por <span className="cifras">{formatearMonto(o.factura.total)}</span>
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-3 border-t border-borde pt-3">
              {conCargo && estaHecha(o.estado) && puede('servicio.facturar') && (
                <Facturar
                  id={o.id}
                  puntos={puntos.map((p) => ({ valor: p.numero, texto: `${String(p.numero).padStart(5, '0')} · ${p.nombre}` }))}
                  hoy={hoy}
                />
              )}
              {cargar && (
                <form action={reabrirAccion.bind(null, o.id)}>
                  <BotonConfirmar pregunta="¿Reabrir la orden? Vuelve a quedar como estaba programada.">Reabrir</BotonConfirmar>
                </form>
              )}
            </div>
          )}
        </Panel>
      )}

      {o.estado === 'cancelada' && (
        <Panel className="mb-4 p-4 text-sm">
          <h2 className="mb-1 font-semibold">Cancelada</h2>
          <p className="text-texto-2">{o.motivoCancelacion}</p>
        </Panel>
      )}

      {abierta && cargar && (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm text-texto-2 hover:text-texto">Cancelar la orden</summary>
          <Panel className="mt-2 p-4">
            <Cancelar id={o.id} />
          </Panel>
        </details>
      )}
    </>
  )
}
