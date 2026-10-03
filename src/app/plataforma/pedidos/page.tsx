import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { pesos } from '@/components/planes/TarjetasPlanes'
import { Boton, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { FUNCIONES, planPorId, precioDeLista, type Funcion } from '@/lib/planes'
import { listarConsultas } from '@/modulos/plataforma/consultas'
import { pedidosPendientes } from '@/modulos/plataforma/suscripciones'

import { atenderConsultaAccion, resolverPedidoAccion } from '../acciones'
import { exigirAdmin } from '../admin'
import { fechaHora, Pestanas, TituloPanel } from '../componentes'

export const metadata: Metadata = { title: 'Pedidos y consultas · Plataforma' }

export default async function Pedidos({ searchParams }: PageProps<'/plataforma/pedidos'>) {
  await exigirAdmin()
  const { consultas: verConsultas } = (await searchParams) as { consultas?: string }
  const [pedidos, consultas] = await Promise.all([pedidosPendientes(), listarConsultas(200)])
  const nuevas = consultas.filter((c) => c.estado === 'nueva')
  const visibles = verConsultas === 'todas' ? consultas : nuevas

  return (
    <>
      <EncabezadoPagina
        titulo="Pedidos y consultas"
        bajada="Cambios de plan que piden las empresas (se aplican al cobrar) y las consultas del formulario del sitio."
      />
      <div className="flex flex-col gap-5">
        <Panel className="overflow-x-auto">
          <TituloPanel extra={pedidos.length > 0 && <Chip tono="aviso">{pedidos.length} sin atender</Chip>}>
            Pedidos de cambio de plan
          </TituloPanel>
          {pedidos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-texto-2">No hay pedidos pendientes.</p>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <tbody className="divide-y divide-borde">
                {pedidos.map((p) => {
                  const d = p.detalle as { plan: string; ciclo: string; aplicaciones: string[]; usuariosAdicionales: number }
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-2.5">
                        <Link href={`/plataforma/empresas/${p.empresaId}`} className="font-medium hover:text-acento">
                          {p.empresa}
                        </Link>
                        <span className="block text-xs text-texto-3">
                          {p.usuario} · {p.email} · {fechaHora(p.creado)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        Plan {planPorId(d.plan).nombre} ({d.ciclo})
                        {d.aplicaciones.length > 0 &&
                          ` + ${d.aplicaciones.map((a) => FUNCIONES[a as Funcion]?.nombre).join(', ')}`}
                        {d.usuariosAdicionales > 0 && ` + ${d.usuariosAdicionales} usuarios`}
                        <span className="cifras block text-xs text-texto-3">{pesos(precioDeLista(d))} /mes de lista</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-2">
                          <form action={resolverPedidoAccion.bind(null, p.id, false)}>
                            <BotonConfirmar pregunta="¿Rechazar el pedido?" className="h-8 px-3 text-xs">
                              Rechazar
                            </BotonConfirmar>
                          </form>
                          <form action={resolverPedidoAccion.bind(null, p.id, true)}>
                            <Boton type="submit" variante="primario" className="h-8 px-3 text-xs">
                              Aplicar (cobrado)
                            </Boton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel className="overflow-x-auto">
          <TituloPanel
            extra={
              <Pestanas
                opciones={[
                  { href: '/plataforma/pedidos', texto: `Nuevas (${nuevas.length})`, activa: verConsultas !== 'todas' },
                  {
                    href: '/plataforma/pedidos?consultas=todas',
                    texto: `Todas (${consultas.length})`,
                    activa: verConsultas === 'todas',
                  },
                ]}
              />
            }
          >
            Consultas del sitio
          </TituloPanel>
          {visibles.length === 0 ? (
            <p className="px-4 py-6 text-sm text-texto-2">
              {verConsultas === 'todas' ? 'Todavía no llegó ninguna consulta.' : 'No hay consultas sin atender.'}
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <tbody className="divide-y divide-borde">
                {visibles.map((c) => (
                  <tr key={c.id} className={c.estado === 'nueva' ? '' : 'text-texto-3'}>
                    <td className="cifras px-4 py-2.5 align-top text-xs text-texto-2">
                      {fechaHora(c.creado)}
                      <span className="block">{c.id.slice(0, 8).toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <span className="font-medium">{c.nombre}</span>
                      {c.empresa && ` · ${c.empresa}`}
                      <a href={`mailto:${c.email}`} className="block text-xs text-acento">
                        {c.email}
                      </a>
                      {c.telefono && <span className="block text-xs text-texto-2">{c.telefono}</span>}
                    </td>
                    <td className="max-w-md px-4 py-2.5 align-top whitespace-pre-line">
                      {(c.rubro || c.origen) && (
                        <span className="mb-1 block text-xs text-texto-3">{[c.rubro, c.origen].filter(Boolean).join(' · ')}</span>
                      )}
                      {c.mensaje}
                    </td>
                    <td className="px-4 py-2.5 text-right align-top">
                      {c.estado === 'nueva' ? (
                        <form action={atenderConsultaAccion.bind(null, c.id)}>
                          <Boton type="submit" className="h-8 px-2 text-xs">
                            Marcar atendida
                          </Boton>
                        </form>
                      ) : (
                        <Chip>Atendida</Chip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  )
}
