import { Search } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { pesos } from '@/components/planes/TarjetasPlanes'
import { Boton, EncabezadoPagina, Panel, Vacio } from '@/components/ui'
import { formatearCuit } from '@/lib/cuit'
import { fechaCorta } from '@/lib/fechas'
import { FUNCIONES, PLANES, planPorId, type Funcion } from '@/lib/planes'
import { buscarEmpresas } from '@/modulos/plataforma/consola'

import { exigirAdmin } from '../admin'
import { ChipEstado, Pestanas } from '../componentes'

export const metadata: Metadata = { title: 'Empresas · Plataforma' }

const ESTADOS = [
  { valor: '', texto: 'Todas' },
  { valor: 'prueba', texto: 'En prueba' },
  { valor: 'activa', texto: 'Activas' },
  { valor: 'impaga', texto: 'Impagas' },
  { valor: 'solo_lectura', texto: 'Solo lectura' },
  { valor: 'suspendida', texto: 'Suspendidas' },
  { valor: 'cancelada', texto: 'Canceladas' },
  { valor: 'baja', texto: 'Dadas de baja' },
]

const ORDENES = [
  { valor: 'alta', texto: 'Más nuevas' },
  { valor: 'nombre', texto: 'Nombre' },
  { valor: 'mensual', texto: 'Mayor precio' },
  { valor: 'vence', texto: 'Próximas a vencer' },
  { valor: 'usuarios', texto: 'Más usuarios' },
]

const control = 'h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-2.5 text-sm focus:border-acento'

export default async function Empresas({ searchParams }: PageProps<'/plataforma/empresas'>) {
  await exigirAdmin()
  const p = (await searchParams) as Record<string, string | undefined>
  const filtro = { q: p.q ?? '', estado: p.estado ?? '', plan: p.plan ?? '', orden: p.orden ?? 'alta' }
  const { total, filas } = await buscarEmpresas(filtro)
  const enlace = (cambios: Partial<typeof filtro>) => {
    const q = new URLSearchParams(Object.entries({ ...filtro, ...cambios }).filter(([, v]) => v) as [string, string][])
    return `/plataforma/empresas${q.size ? `?${q}` : ''}`
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Empresas"
        bajada={`${total} ${total === 1 ? 'empresa usa' : 'empresas usan'} el servicio. Buscá, filtrá y entrá a la ficha de cada una.`}
      />

      <div className="flex flex-col gap-4">
        <form className="flex flex-wrap items-end gap-2" role="search">
          <label className="flex min-w-56 flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">Buscar</span>
            <input name="q" defaultValue={filtro.q} placeholder="Razón social o CUIT" className={control} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">Plan</span>
            <select name="plan" defaultValue={filtro.plan} className={control}>
              <option value="">Todos</option>
              {PLANES.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">Ordenar por</span>
            <select name="orden" defaultValue={filtro.orden} className={control}>
              {ORDENES.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </select>
          </label>
          {filtro.estado && <input type="hidden" name="estado" value={filtro.estado} />}
          <Boton type="submit">
            <Search aria-hidden /> Buscar
          </Boton>
        </form>

        <Pestanas
          opciones={ESTADOS.map((e) => ({
            href: enlace({ estado: e.valor }),
            texto: e.texto,
            activa: filtro.estado === e.valor,
          }))}
        />

        <Panel className="overflow-x-auto">
          {filas.length === 0 ? (
            <Vacio titulo="No hay empresas con esos filtros">
              <Link href="/plataforma/empresas" className="text-acento hover:underline">
                Ver todas
              </Link>
            </Vacio>
          ) : (
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-borde text-left text-xs text-texto-2">
                <tr>
                  <th className="px-4 py-2 font-medium">Empresa</th>
                  <th className="px-4 py-2 font-medium">Plan</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  <th className="px-4 py-2 text-right font-medium">Usuarios</th>
                  <th className="px-4 py-2 font-medium">Vence</th>
                  <th className="px-4 py-2 text-right font-medium">Mensual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {filas.map((f) => (
                  <tr key={f.empresaId} className={`group hover:bg-superficie-2 ${f.activa ? '' : 'text-texto-3'}`}>
                    <td className="px-4 py-2.5">
                      <Link href={`/plataforma/empresas/${f.empresaId}`} className="font-medium group-hover:text-acento">
                        {f.razonSocial}
                      </Link>
                      <span className="cifras block text-xs text-texto-3">
                        {formatearCuit(f.cuit)} · alta {fechaCorta(f.alta.toISOString())}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {planPorId(f.plan).nombre}
                      {f.ciclo === 'anual' && <span className="text-xs text-texto-3"> · anual</span>}
                      {f.aplicaciones.length > 0 && (
                        <span className="block text-xs text-texto-3">
                          + {f.aplicaciones.map((a) => FUNCIONES[a as Funcion]?.nombre).join(', ')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <ChipEstado estado={f.estado} />
                        {!f.activa && <span className="text-xs font-medium text-error">de baja</span>}
                        {f.activa && f.sit.soloLectura && <span className="text-xs text-error">solo lectura</span>}
                        {f.pedidos > 0 && <span className="text-xs text-aviso">pedido</span>}
                      </span>
                    </td>
                    <td className="cifras px-4 py-2.5 text-right">
                      {f.usuarios}
                      <span className="text-texto-3"> / {f.sit.limites.usuarios ?? '∞'}</span>
                    </td>
                    <td className="cifras px-4 py-2.5 text-xs">
                      {f.vence ? `${f.estado === 'prueba' ? 'prueba ' : ''}${fechaCorta(f.vence)}` : '—'}
                    </td>
                    <td className="cifras px-4 py-2.5 text-right">
                      {f.mensual ? pesos(f.mensual) : '—'}
                      {f.precioAcordado && <span className="block text-xs text-texto-3">acordado</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        {filas.length > 0 && (
          <p className="text-xs text-texto-3">
            {filas.length} de {total} empresas. Precios mensuales sin IVA.
          </p>
        )}
      </div>
    </>
  )
}
