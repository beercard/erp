import { asc } from 'drizzle-orm'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { Aviso, EncabezadoPagina, Panel } from '@/components/ui'
import { escalaGanancias, regimenesGanancias, retencionesConfiguracion } from '@/db/schema'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'

import { cargarRg830Accion } from '../../compras/acciones'
import { ActivarGanancias, FormularioRegimen } from './FormulariosRetenciones'

export const metadata: Metadata = { title: 'Retenciones' }

export default async function Retenciones({ searchParams }: PageProps<'/configuracion/retenciones'>) {
  await exigirPermiso('empresa.datos')
  const { cargado, error } = await searchParams
  const datos = await enLaEmpresa('empresa.datos', async (tx) => ({
    config: (await tx.select().from(retencionesConfiguracion))[0],
    regimenes: await tx.select().from(regimenesGanancias).orderBy(asc(regimenesGanancias.codigo)),
    escala: await tx.select().from(escalaGanancias).orderBy(asc(escalaGanancias.desde)),
  }))
  return (
    <>
      <Link href="/configuracion" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Configuración
      </Link>
      <EncabezadoPagina
        titulo="Retenciones a proveedores"
        bajada="Retención de Ganancias (RG 830) al emitir órdenes de pago. A cada proveedor se le asigna su régimen en la ficha."
      />
      <div className="flex flex-col gap-4">
        {cargado && <Aviso tono="ok">Se cargaron los valores del Anexo VIII de la RG 830.</Aviso>}
        {typeof error === 'string' && <Aviso>{error}</Aviso>}
        <Panel className="p-4">
          <ActivarGanancias activa={datos.config?.gananciasActiva ?? false} hayRegimenes={datos.regimenes.length > 0} />
          {!datos.regimenes.length && <p className="mt-2 text-xs text-texto-3">Primero cargá los regímenes.</p>}
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Regímenes de Ganancias</h2>
              <p className="text-xs text-texto-2">
                Código de SICORE, alícuotas y mínimos mensuales por proveedor. Los importes los fija ARCA: revisalos con el
                contador.
              </p>
            </div>
            <form action={cargarRg830Accion}>
              <BotonConfirmar pregunta="¿Cargar los valores oficiales de la RG 830 (Anexo VIII)? Pisan los de los regímenes con el mismo código.">
                Cargar valores oficiales (RG 830)
              </BotonConfirmar>
            </form>
          </div>
          <div className="flex flex-col divide-y divide-borde">
            {datos.regimenes.map((r) => (
              <FormularioRegimen key={r.codigo} regimen={r} />
            ))}
            <div className="bg-superficie-2/50">
              <p className="px-4 pt-3 text-xs font-medium text-texto-2">Agregar otro régimen</p>
              <FormularioRegimen />
            </div>
          </div>
        </Panel>

        {datos.escala.length > 0 && (
          <Panel className="overflow-x-auto">
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">
              Escala (regímenes que la usan, a inscriptos)
            </h2>
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-xs text-texto-2">
                  <th className="px-4 py-2 font-medium">Más de</th>
                  <th className="px-4 py-2 font-medium">Hasta</th>
                  <th className="px-4 py-2 text-right font-medium">Fijo</th>
                  <th className="px-4 py-2 text-right font-medium">Más el</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {datos.escala.map((t) => (
                  <tr key={t.id}>
                    <td className="cifras px-4 py-2">{formatearMonto(t.desde, '$')}</td>
                    <td className="cifras px-4 py-2">{t.hasta ? formatearMonto(t.hasta, '$') : 'en adelante'}</td>
                    <td className="cifras px-4 py-2 text-right">{formatearMonto(t.fijo, '$')}</td>
                    <td className="cifras px-4 py-2 text-right">{Number(t.porcentaje).toLocaleString('es-AR')} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
    </>
  )
}
