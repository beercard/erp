import { and, eq, isNull } from 'drizzle-orm'
import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { Aviso, BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { equipos, modelosEquipo } from '@/db/schema'
import { formatearMonto } from '@/lib/dinero'
import { tienePermiso } from '@/lib/permisos'
import { obtenerContrato } from '@/modulos/contratos/contratos'
import { nombreMes } from '@/modulos/contratos/calculo'

import { anularFacturacionAccion, quitarEquipoAccion } from '../acciones'
import { AsignarEquipo, FormularioContrato } from '../FormulariosContratos'
import { alicuotas, paginaContratos } from '../modulo'

export const metadata: Metadata = { title: 'Contrato' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }

export default async function Contrato({ params, searchParams }: PageProps<'/contratos/[id]'>) {
  const sesion = await paginaContratos('contratos.ver')
  const { id } = await params
  const { guardado, error } = (await searchParams) as { guardado?: string; error?: string }
  const datos = await conEmpresa(sesion.empresa.id, async (tx) => {
    const c = await obtenerContrato(tx, id)
    if (!c) return null
    const libres = await tx
      .select({ id: equipos.id, serie: equipos.serie, modelo: modelosEquipo.nombre })
      .from(equipos)
      .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
      .where(and(eq(equipos.terceroId, c.terceroId), eq(equipos.estado, 'instalado'), isNull(equipos.contratoId)))
    return { c, libres }
  })
  if (!datos) notFound()
  const { c, libres } = datos
  const editar = tienePermiso(sesion.permisos, 'contratos.editar')
  const facturar = tienePermiso(sesion.permisos, 'contratos.facturar')
  const s = SIMBOLO[c.moneda] ?? c.moneda
  const instalados = c.equipos.filter((e) => e.estado === 'instalado')

  return (
    <>
      <EncabezadoPagina
        titulo={`Contrato ${c.numero} · ${c.cliente.razonSocial}`}
        bajada={
          <>
            {c.tipo} · {instalados.length} {instalados.length === 1 ? 'equipo' : 'equipos'}
            {c.estado !== 'activo' && (
              <span className="ml-2">
                <Chip tono="aviso">{c.estado}</Chip>
              </span>
            )}
          </>
        }
        acciones={
          editar && (
            <BotonEnlace href={`/equipos/nuevo?contrato=${c.id}`}>
              <Plus aria-hidden className="size-4" /> Instalar equipo
            </BotonEnlace>
          )
        }
      />
      {guardado && (
        <div className="mb-4">
          <Aviso tono="ok">Contrato guardado.</Aviso>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}

      <Panel className="mb-4 overflow-x-auto">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Equipos</h2>
        {instalados.length === 0 ? (
          <p className="p-4 text-sm text-texto-2">El contrato no tiene equipos instalados.</p>
        ) : (
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">Serie</th>
                <th className="px-4 py-2 font-medium">Modelo</th>
                <th className="px-4 py-2 font-medium">Ubicación</th>
                <th className="px-4 py-2 text-right font-medium">Última lectura</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {instalados.map((e) => (
                <tr key={e.id} className="group hover:bg-superficie-2">
                  <td className="cifras px-4 py-2">
                    <Link href={`/equipos/${e.id}`} className="font-medium group-hover:text-acento">
                      {e.serie}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{e.modelo}</td>
                  <td className="px-4 py-2 text-xs text-texto-2">
                    {[e.sector, e.domicilio, e.localidad].filter(Boolean).join(' · ')}
                  </td>
                  <td className="cifras px-4 py-2 text-right">
                    {e.ultimaLectura?.toLocaleString('es-AR') ?? '—'}
                    <span className="block text-xs text-texto-3">{e.fechaUltimaLectura}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {editar && (
                      <form action={quitarEquipoAccion.bind(null, c.id, e.id)}>
                        <BotonConfirmar
                          pregunta="¿Sacar el equipo del contrato? Sigue instalado en el cliente."
                          className="h-7 px-2 text-xs"
                        >
                          Sacar
                        </BotonConfirmar>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {editar && (
          <div className="border-t border-borde p-4 empty:hidden">
            <AsignarEquipo
              contratoId={c.id}
              libres={libres.map((e) => ({ id: e.id, texto: `${e.serie}${e.modelo ? ` · ${e.modelo}` : ''}` }))}
            />
          </div>
        )}
      </Panel>

      <Panel className="mb-4 overflow-x-auto">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Facturado</h2>
        {c.facturaciones.length === 0 ? (
          <p className="p-4 text-sm text-texto-2">Todavía no se facturó.</p>
        ) : (
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">Mes</th>
                <th className="px-4 py-2 text-right font-medium">Copias</th>
                <th className="px-4 py-2 text-right font-medium">Excedentes</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Factura</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {c.facturaciones.map((f) => (
                <tr key={f.id} className={f.estado === 'anulada' ? 'text-texto-3 line-through' : ''}>
                  <td className="px-4 py-2">
                    {nombreMes(f.periodo)}
                    {f.origen === 'pymexis' && <span className="ml-2 text-xs text-texto-3 no-underline">PYMEXIS</span>}
                  </td>
                  <td className="cifras px-4 py-2 text-right">{f.copias.toLocaleString('es-AR')}</td>
                  <td className="cifras px-4 py-2 text-right">{f.copiasExcedentes.toLocaleString('es-AR')}</td>
                  <td className="cifras px-4 py-2 text-right">
                    {formatearMonto(f.total, SIMBOLO[f.moneda] ?? f.moneda)}
                    {f.moneda !== 'PES' && (
                      <span className="block text-xs text-texto-3">dólar {Number(f.cotizacion).toLocaleString('es-AR')}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {f.comprobanteId && (
                      <Link href={`/facturas/${f.comprobanteId}`} className="text-acento hover:underline">
                        Ver factura
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {facturar && f.estado === 'facturada' && f.origen === 'erp' && (
                      <form action={anularFacturacionAccion.bind(null, c.id, f.id)}>
                        <BotonConfirmar
                          pregunta="¿Anular esta facturación para rehacerla? Si la factura sigue en borrador se borra; si ya está autorizada, hacele una nota de crédito."
                          className="h-7 px-2 text-xs"
                        >
                          Anular
                        </BotonConfirmar>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Condiciones</h2>
        {editar ? (
          <FormularioContrato id={c.id} alicuotas={alicuotas} inicial={{ ...c, cliente: c.cliente.razonSocial }} />
        ) : (
          <p className="text-sm text-texto-2">
            Cargo fijo {formatearMonto(c.cargoFijo, s)} · {c.copiasLibres.toLocaleString('es-AR')} copias libres · excedente {s}{' '}
            {Number(c.precioExcedente).toLocaleString('es-AR', { maximumFractionDigits: 4 })}
          </p>
        )}
      </Panel>
    </>
  )
}
