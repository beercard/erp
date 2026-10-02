import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { Aviso, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { depositos, puntosVenta } from '@/db/schema'
import { formatearMonto, monto, sumar } from '@/lib/dinero'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { listarTecnicos, obtenerOrden } from '@/modulos/servicio/servicio'
import { COBERTURAS, estaAbierta, TIPOS_ORDEN } from '@/modulos/servicio/tipos'

import { alicuotas, paginaContratos } from '../../contratos/modulo'
import { quitarItemAccion, reabrirAccion } from '../acciones'
import { ChipEstado } from '../ChipEstado'
import { Asignar, Cancelar, Facturar, FormularioOrden, Item, Resolver, Visita } from '../Formularios'

export const metadata: Metadata = { title: 'Orden de servicio' }

const cifra = (v: string) => monto(v).toNumber().toLocaleString('es-AR', { maximumFractionDigits: 4 })

export default async function Orden({ params, searchParams }: PageProps<'/servicio/[id]'>) {
  const sesion = await paginaContratos('servicio.ver')
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const { guardada, error } = (await searchParams) as { guardada?: string; error?: string }
  const datos = await conEmpresa(sesion.empresa.id, async (tx) => {
    const o = await obtenerOrden(tx, id)
    if (!o) return null
    const [tecnicos, deps, puntos] = await Promise.all([
      listarTecnicos(tx),
      tx.select().from(depositos).where(eq(depositos.activo, true)).orderBy(asc(depositos.codigo)),
      tx
        .select({ numero: puntosVenta.numero, nombre: puntosVenta.nombre })
        .from(puntosVenta)
        .where(and(eq(puntosVenta.activo, true), inArray(puntosVenta.tipo, ['electronico'])))
        .orderBy(puntosVenta.numero),
    ])
    return { o, tecnicos, deps, puntos }
  })
  if (!datos) notFound()
  const { o, deps, puntos } = datos
  const tecnicos = datos.tecnicos.map((t) => ({ valor: t.id, texto: t.nombre }))
  const hoy = hoyArgentina()
  const abierta = estaAbierta(o.estado)
  const puede = (p: string) => tienePermiso(sesion.permisos, p)
  const cargar = puede('servicio.cargar')
  const trabajar = puede('servicio.trabajar')
  const conCargo = o.cobertura === 'cargo'
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
              {TIPOS_ORDEN[o.tipo as keyof typeof TIPOS_ORDEN]}
            </span>
            {o.prioridad === 'urgente' && abierta && <Chip tono="error">Urgente</Chip>}
            <ChipEstado estado={o.estado} cobertura={o.cobertura} facturada={!!o.comprobanteId} />
          </span>
        }
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

      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Pedido del {o.fecha}</h2>
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
          {cargar && o.estado !== 'cancelada' && !o.comprobanteId && (
            <details className="mt-4 border-t border-borde pt-3">
              <summary className="cursor-pointer text-sm text-acento">Corregir los datos de la orden</summary>
              <div className="mt-3">
                <FormularioOrden id={o.id} inicial={{ ...o, cliente: o.cliente.razonSocial }} tecnicos={tecnicos} />
              </div>
            </details>
          )}
        </Panel>

        <Panel className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Técnico</h2>
          <p className="text-sm">
            {o.tecnico?.nombre ?? <span className="text-texto-3">Sin asignar</span>}
            {o.tecnico?.telefono && <span className="block text-xs text-texto-3">{o.tecnico.telefono}</span>}
          </p>
          {o.programada && abierta && (
            <p className={`mt-1 text-sm ${o.programada < hoy ? 'text-error' : 'text-texto-2'}`}>
              Visita programada: {o.programada === hoy ? 'hoy' : o.programada}
            </p>
          )}
          {abierta && cargar && (
            <div className="mt-3 border-t border-borde pt-3">
              {tecnicos.length ? (
                <Asignar
                  key={`${o.tecnicoId}|${o.programada}`}
                  id={o.id}
                  tecnicos={tecnicos}
                  tecnicoId={o.tecnicoId}
                  programada={o.programada}
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
                  <td className="px-4 py-2 whitespace-nowrap">{v.fecha}</td>
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
        {abierta && trabajar && (
          <div className="border-t border-borde p-4">
            <Visita key={`${o.tecnicoId}|${o.visitas.length}`} id={o.id} tecnicos={tecnicos} tecnicoId={o.tecnicoId} hoy={hoy} />
          </div>
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
                {abierta && trabajar && <th className="px-4 py-2" />}
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
                  {abierta && trabajar && (
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
                    Total sin IVA{conCargo ? '' : ' (no se factura: la orden no es con cargo)'}
                  </td>
                  <td className="cifras px-4 py-2 text-right font-medium">{formatearMonto(totalNeto)}</td>
                  {abierta && trabajar && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        )}
        {abierta && trabajar && (
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

      {o.estado === 'resuelta' && (
        <Panel className="mb-4 p-4">
          <h2 className="mb-2 text-sm font-semibold">Resuelta el {o.fechaResolucion}</h2>
          <p className="text-sm whitespace-pre-line">{o.solucion}</p>
          {o.contador !== null && (
            <p className="mt-1 text-sm text-texto-2">
              Contador: <span className="cifras">{o.contador.toLocaleString('es-AR')}</span>
            </p>
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
              {conCargo && puede('servicio.facturar') && (
                <Facturar
                  id={o.id}
                  puntos={puntos.map((p) => ({ valor: p.numero, texto: `${String(p.numero).padStart(5, '0')} · ${p.nombre}` }))}
                  hoy={hoy}
                />
              )}
              {trabajar && (
                <form action={reabrirAccion.bind(null, o.id)}>
                  <BotonConfirmar pregunta="¿Reabrir la orden? Vuelve a quedar pendiente de resolver.">Reabrir</BotonConfirmar>
                </form>
              )}
            </div>
          )}
        </Panel>
      )}

      {abierta && trabajar && (
        <Panel className="mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold">Resolver</h2>
          <Resolver id={o.id} hoy={hoy} conEquipo={!!o.equipoId} />
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
