import { BookOpen, FilePlus2, ListTree, Lock } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { pendientesDeContabilizar } from '@/modulos/contabilidad/automaticos'
import { controlesContables, gastosAImputarPorProveedor } from '@/modulos/contabilidad/cierre'
import { configuracionContableDe, planDeCuentas } from '@/modulos/contabilidad/plan'

import { pesos } from '../impuestos/periodo'
import { Contabilizar, PuestaEnMarcha, Reclasificar } from './Formularios'

export const metadata: Metadata = { title: 'Contabilidad' }

/** Contabilidad: puesta en marcha, asientos automáticos pendientes, controles y gastos a imputar. */
export default async function Contabilidad() {
  const sesion = await exigirPermiso('contabilidad.ver')
  const puede = (p: string) => tienePermiso(sesion.permisos, p)
  const hoy = hoyArgentina()
  const d = await conEmpresa(sesion, async (tx) => {
    const config = await configuracionContableDe(tx)
    if (!config) return null
    return {
      config,
      pendientes: await pendientesDeContabilizar(tx, hoy),
      controles: await controlesContables(tx, hoy),
      aImputar: await gastosAImputarPorProveedor(tx),
      cuentas: (await planDeCuentas(tx)).filter((c) => c.activa && (c.tipo === 'egreso' || c.tipo === 'activo')),
    }
  })

  if (!d)
    return (
      <>
        <EncabezadoPagina
          titulo="Contabilidad"
          bajada="Asientos automáticos desde ventas, compras, cobranzas, pagos, cheques y tesorería; libros, balances y cierre."
        />
        <Panel className="max-w-3xl p-4">
          <h2 className="mb-1 text-sm font-semibold">Poner en marcha</h2>
          <p className="mb-3 text-sm text-texto-2">
            Se crea un plan de cuentas modelo para pyme (lo podés cambiar), una cuenta por cada caja y banco, y se asientan solas
            todas las operaciones desde la fecha que elijas. Lo anterior se carga con un asiento de apertura con los saldos del
            último balance.
          </p>
          {puede('contabilidad.configurar') ? (
            <PuestaEnMarcha inicioSugerido={`${hoy.slice(0, 4)}-01-01`} />
          ) : (
            <Aviso tono="info">La pone en marcha quien tenga el permiso de configurar la contabilidad.</Aviso>
          )}
        </Panel>
      </>
    )

  const errores = d.controles.filter((c) => c.gravedad === 'error')
  return (
    <>
      <EncabezadoPagina
        titulo="Contabilidad"
        bajada={
          <>
            Desde el {d.config.inicio.split('-').reverse().join('/')}
            {d.config.cerradoHasta && <> · cerrada hasta el {d.config.cerradoHasta.split('-').reverse().join('/')}</>}. Las
            operaciones se asientan solas cada hora; acá ves lo que falta y lo que no cuadra.
          </>
        }
        acciones={
          <>
            <BotonEnlace href="/contabilidad/libros">
              <BookOpen aria-hidden className="size-4" /> Libros y balances
            </BotonEnlace>
            <BotonEnlace href="/contabilidad/asientos">
              <ListTree aria-hidden className="size-4" /> Asientos
            </BotonEnlace>
            {puede('contabilidad.asientos') && (
              <BotonEnlace href="/contabilidad/asientos/nuevo" variante="primario">
                <FilePlus2 aria-hidden className="size-4" /> Asiento manual
              </BotonEnlace>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <h2 className="mb-1 text-sm font-semibold">Asientos automáticos</h2>
          <p className="mb-3 text-sm text-texto-2">
            {d.pendientes?.total
              ? `Esperan asiento: ${d.pendientes.ventas} ventas, ${d.pendientes.compras} compras, ${d.pendientes.cobranzas} cobranzas y ${d.pendientes.pagos} pagos (más tesorería y cheques).`
              : 'Ventas, compras, cobranzas y pagos al día.'}
          </p>
          {puede('contabilidad.asientos') && <Contabilizar />}
        </Panel>
        <Panel className="p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            Controles{' '}
            {errores.length ? (
              <Chip tono="error">{errores.length} para corregir</Chip>
            ) : d.controles.length ? (
              <Chip tono="aviso">{d.controles.length} avisos</Chip>
            ) : (
              <Chip tono="ok">Todo cuadra</Chip>
            )}
          </h2>
          {d.controles.length ? (
            <ul className="divide-y divide-borde text-sm">
              {d.controles.map((c, i) => (
                <li key={i} className="py-2">
                  <span className="flex items-center gap-2 font-medium">
                    <Chip tono={c.gravedad === 'error' ? 'error' : 'aviso'}>{c.gravedad === 'error' ? 'Error' : 'Aviso'}</Chip>
                    {c.tema}
                  </span>
                  <span className="mt-0.5 block text-texto-2">{c.detalle}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-texto-2">
              Cajas y bancos, cheques en cartera, cheques diferidos y liquidaciones de IVA coinciden con la contabilidad.
            </p>
          )}
        </Panel>
      </div>

      <Panel className="mt-4 overflow-x-auto">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Gastos a imputar por proveedor</h2>
        {d.aImputar.length ? (
          <table className="w-full min-w-[720px] text-sm">
            <tbody className="divide-y divide-borde">
              {d.aImputar.map((g) => (
                <tr key={g.terceroId}>
                  <td className="px-4 py-2">
                    {g.proveedor}
                    <span className="block text-xs text-texto-3">{g.cantidad} comprobantes</span>
                  </td>
                  <td className="cifras px-4 py-2 text-right">{pesos(g.importe)}</td>
                  <td className="px-4 py-2">
                    {puede('contabilidad.asientos') && (
                      <Reclasificar terceroId={g.terceroId} cuentas={d.cuentas.map((c) => ({ ...c }))} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-3 text-sm text-texto-2">
            Nada pendiente. Las compras de un proveedor sin cuenta asignada van a “Gastos a imputar”; al elegirle una cuenta acá,
            se reclasifica lo cargado y las próximas compras ya van ahí.
          </p>
        )}
      </Panel>

      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href="/contabilidad/plan" className="text-acento hover:underline">
          Plan de cuentas y cuentas clave
        </Link>
        <Link href="/contabilidad/cierre" className="flex items-center gap-1 text-acento hover:underline">
          <Lock aria-hidden className="size-3.5" /> Ejercicios y cierre
        </Link>
      </p>
    </>
  )
}
