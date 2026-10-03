import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { listarEjercicios } from '@/modulos/contabilidad/cierre'
import { configuracionContableDe } from '@/modulos/contabilidad/plan'

import { CerrarEjercicio, CerrarHasta } from '../Formularios'

export const metadata: Metadata = { title: 'Ejercicios y cierre' }

const fecha = (iso: string) => iso.split('-').reverse().join('/')

/** Ejercicios contables, cierre anual y bloqueo de fechas ya revisadas. */
export default async function Cierre() {
  const sesion = await exigirPermiso('contabilidad.ver')
  const puede = tienePermiso(sesion.permisos, 'contabilidad.configurar')
  const hoy = hoyArgentina()
  const d = await conEmpresa(sesion, async (tx) => {
    const config = await configuracionContableDe(tx)
    return config ? { config, ejercicios: await listarEjercicios(tx) } : null
  })
  if (!d) redirect('/contabilidad')
  const primeroAbierto = d.ejercicios.find((e) => e.estado === 'abierto')
  return (
    <>
      <EncabezadoPagina
        titulo="Ejercicios y cierre"
        bajada="Al cerrar un ejercicio se asienta lo pendiente, se refunden ingresos y egresos en el resultado, el resultado pasa a Resultados no asignados el primer día del siguiente y las fechas quedan bloqueadas."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="overflow-x-auto">
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Ejercicios</h2>
          <ul className="divide-y divide-borde text-sm">
            {d.ejercicios.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>
                  {fecha(e.inicio)} al {fecha(e.fin)}{' '}
                  <Link
                    href={`/contabilidad/libros?vista=resultados&desde=${e.inicio}&hasta=${e.fin < hoy ? e.fin : hoy}`}
                    className="ml-1 text-xs text-acento hover:underline"
                  >
                    resultados
                  </Link>
                </span>
                {e.estado === 'cerrado' ? (
                  <Chip tono="neutro">Cerrado</Chip>
                ) : puede && e.id === primeroAbierto?.id && e.fin < hoy ? (
                  <CerrarEjercicio id={e.id} texto={`${fecha(e.inicio)} al ${fecha(e.fin)}`} />
                ) : (
                  <Chip tono="ok">Abierto</Chip>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t border-borde px-4 py-2 text-xs text-texto-3">
            El siguiente ejercicio se abre solo con el primer asiento posterior al cierre del anterior.
          </p>
        </Panel>
        <Panel className="p-4">
          <h2 className="mb-1 text-sm font-semibold">Bloquear fechas</h2>
          <p className="mb-3 text-sm text-texto-2">
            Cuando el contador revisa un mes, bloquealo: no se aceptan asientos (ni automáticos) con esa fecha o anterior. Lo que
            se cargue después en esas fechas aparece como pendiente para resolver a mano.
          </p>
          {puede ? (
            <CerrarHasta actual={d.config.cerradoHasta} />
          ) : (
            <p className="text-sm">
              {d.config.cerradoHasta ? `Bloqueada hasta el ${fecha(d.config.cerradoHasta)}.` : 'Sin bloqueo.'}
            </p>
          )}
        </Panel>
      </div>
    </>
  )
}
