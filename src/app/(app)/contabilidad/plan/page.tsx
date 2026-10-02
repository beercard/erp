import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { cuentasTesoreria, terceros } from '@/db/schema'
import { exigirPermiso } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { CLAVES, configuracionContableDe, NOMBRES_CLAVES, planDeCuentas } from '@/modulos/contabilidad/plan'

import { AsignarClave, EditarCuenta, NuevaCuenta } from '../Formularios'

export const metadata: Metadata = { title: 'Plan de cuentas' }

const TIPO: Record<string, string> = {
  activo: 'Activo',
  pasivo: 'Pasivo',
  patrimonio: 'Patrimonio',
  ingreso: 'Ingreso',
  egreso: 'Egreso',
}

/** Plan de cuentas y a qué cuenta va cada cosa en los asientos automáticos. */
export default async function Plan() {
  const sesion = await exigirPermiso('contabilidad.ver')
  const editar = tienePermiso(sesion.permisos, 'contabilidad.configurar')
  const d = await conEmpresa(sesion, async (tx) => {
    if (!(await configuracionContableDe(tx))) return null
    const [plan, proveedores, cajas] = await Promise.all([
      planDeCuentas(tx),
      tx.select({ id: terceros.id, nombre: terceros.razonSocial }).from(terceros),
      tx.select({ id: cuentasTesoreria.id, nombre: cuentasTesoreria.nombre }).from(cuentasTesoreria),
    ])
    return { plan, proveedores, cajas }
  })
  if (!d) redirect('/contabilidad')
  const opciones = d.plan.filter((c) => c.activa)
  const cuentaDe = (clave: string) => d.plan.find((c) => c.claves.includes(clave))
  // Cuentas asignadas a mano: proveedores, conceptos de tesorería y cajas.
  const otras = d.plan.flatMap((c) =>
    c.claves
      .filter((k) => !CLAVES.includes(k))
      .map((k) => {
        const [tipo, id] = k.split(/:(.*)/)
        const texto =
          tipo === 'proveedor'
            ? `Compras de ${d.proveedores.find((p) => p.id === id)?.nombre ?? 'un proveedor'}`
            : tipo === 'tesoreria'
              ? `Caja o banco: ${d.cajas.find((x) => x.id === id)?.nombre ?? '—'}`
              : tipo === 'concepto'
                ? `Movimientos de tesorería con concepto “${id}”`
                : k
        return { clave: k, texto, tipo }
      }),
  )

  return (
    <>
      <EncabezadoPagina
        titulo="Plan de cuentas"
        bajada="Las cuentas imputables reciben asientos; las demás agrupan. Las cuentas clave dicen a dónde va cada cosa en los asientos automáticos."
      />
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">Cuenta</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {d.plan.map((c) => (
                <tr key={c.id} className={c.activa ? '' : 'text-texto-3'}>
                  <td className="px-4 py-1.5" style={{ paddingLeft: `${1 + (c.nivel - 1) * 1.25}rem` }}>
                    {editar ? (
                      <details>
                        <summary className={`cursor-pointer list-none ${c.imputable ? '' : 'font-semibold'}`}>
                          <span className="cifras mr-2 text-texto-2">{c.codigo}</span>
                          {c.nombre}
                          {!c.activa && <span className="ml-2 text-xs">(inactiva)</span>}
                        </summary>
                        <div className="py-2">
                          <EditarCuenta c={c} />
                        </div>
                      </details>
                    ) : (
                      <span className={c.imputable ? '' : 'font-semibold'}>
                        <span className="cifras mr-2 text-texto-2">{c.codigo}</span>
                        {c.nombre}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-1.5 text-xs text-texto-2">{c.nivel === 1 ? TIPO[c.tipo] : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {editar && (
            <div className="border-t border-borde p-4">
              <h2 className="mb-2 text-sm font-semibold">Agregar una cuenta</h2>
              <NuevaCuenta />
              <p className="mt-2 text-xs text-texto-3">
                El código define dónde va: 5.17 queda dentro de Egresos; 1.2.01.05, dentro de Bienes de uso. Hacé clic en una
                cuenta para cambiarle el nombre o desactivarla.
              </p>
            </div>
          )}
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel className="overflow-x-auto">
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Cuentas clave</h2>
            <ul className="divide-y divide-borde text-sm">
              {CLAVES.map((k) => {
                const c = cuentaDe(k)
                return (
                  <li key={k} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                    <span>{NOMBRES_CLAVES[k]}</span>
                    {editar ? (
                      <AsignarClave clave={k} actual={c?.id ?? null} cuentas={opciones} />
                    ) : c ? (
                      <span className="text-texto-2">
                        <span className="cifras">{c.codigo}</span> {c.nombre}
                      </span>
                    ) : (
                      <Chip tono="error">Sin asignar</Chip>
                    )}
                  </li>
                )
              })}
            </ul>
          </Panel>
          {otras.length > 0 && (
            <Panel className="overflow-x-auto">
              <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Asignaciones particulares</h2>
              <ul className="divide-y divide-borde text-sm">
                {otras.map((o) => {
                  const c = cuentaDe(o.clave)!
                  return (
                    <li key={o.clave} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                      <span>{o.texto}</span>
                      {editar && o.tipo !== 'tesoreria' ? (
                        <AsignarClave clave={o.clave} actual={c.id} cuentas={opciones} />
                      ) : (
                        <span className="text-texto-2">
                          <span className="cifras">{c.codigo}</span> {c.nombre}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  )
}
