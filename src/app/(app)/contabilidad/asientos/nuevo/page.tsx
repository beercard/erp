import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { configuracionContableDe, planDeCuentas } from '@/modulos/contabilidad/plan'

import { AsientoManual } from '../../Formularios'

export const metadata: Metadata = { title: 'Asiento manual' }

/** Amortizaciones, sueldos, ajustes, apertura con los saldos del último balance… */
export default async function NuevoAsiento() {
  const sesion = await exigirPermiso('contabilidad.asientos')
  const cuentas = await conEmpresa(sesion.empresa.id, async (tx) =>
    (await configuracionContableDe(tx)) ? (await planDeCuentas(tx)).filter((c) => c.activa) : null,
  )
  if (!cuentas) redirect('/contabilidad')
  return (
    <>
      <EncabezadoPagina
        titulo="Asiento manual"
        bajada="Para lo que no sale de una operación: apertura con los saldos del último balance, amortizaciones, sueldos, ajustes."
      />
      <Panel className="p-4">
        <AsientoManual
          cuentas={cuentas.map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, imputable: c.imputable, nivel: c.nivel }))}
          hoy={hoyArgentina()}
        />
      </Panel>
    </>
  )
}
