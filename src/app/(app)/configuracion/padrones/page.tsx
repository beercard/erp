import { ChevronLeft } from 'lucide-react'
import { EnlaceAyuda } from '@/components/ayuda/EnlaceAyuda'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { provincias, retencionesConfiguracion } from '@/db/schema'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { configuracionArba } from '@/modulos/impuestos/arba'
import { FORMATOS_PADRON, resumenPadrones } from '@/modulos/impuestos/padronesIibb'

import { AccesoArba, ImportarPadron, RetencionIibb } from './Formularios'

export const metadata: Metadata = { title: 'Padrones de IIBB y ARBA' }

const dma = (f: string) => f.split('-').reverse().join('/')

export default async function Padrones() {
  await exigirPermiso('empresa.datos')
  const d = await enLaEmpresa('empresa.datos', async (tx) => ({
    provincias: await tx
      .select({ codigo: provincias.codigo, nombre: provincias.nombre })
      .from(provincias)
      .orderBy(provincias.nombre),
    config: (await tx.select().from(retencionesConfiguracion))[0],
    arba: await configuracionArba(tx),
    padrones: await resumenPadrones(tx),
  }))
  const nombre = new Map(d.provincias.map((p) => [p.codigo, p.nombre]))
  return (
    <>
      <Link href="/configuracion" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Configuración
      </Link>
      <EncabezadoPagina
        acciones={<EnlaceAyuda guia="arba" />}
        titulo="Padrones de IIBB y ARBA"
        bajada="Las alícuotas de percepción y retención de Ingresos Brutos de cada cliente y proveedor, según el padrón de cada provincia. Se usan solas al facturar y al pagar."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="mb-3 font-semibold">Importar un padrón</h2>
          <ImportarPadron
            provincias={d.provincias}
            formatos={Object.fromEntries(Object.entries(FORMATOS_PADRON).map(([k, v]) => [k, v.nombre]))}
          />
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-3 font-semibold">Padrones cargados</h2>
          {d.padrones.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-texto-2">
                  <th className="py-1">Provincia</th>
                  <th>Vigencia</th>
                  <th>Origen</th>
                  <th className="text-right">CUIT</th>
                </tr>
              </thead>
              <tbody>
                {d.padrones.map((p) => (
                  <tr key={`${p.provincia}${p.desde}${p.origen}`} className="border-t border-borde">
                    <td className="py-1.5">{nombre.get(p.provincia) ?? p.provincia}</td>
                    <td className="cifras">
                      {dma(p.desde)} al {dma(p.hasta)}
                    </td>
                    <td>{p.origen === 'servicio' ? 'Consulta a ARBA' : 'Archivo'}</td>
                    <td className="cifras text-right">{p.cuits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-texto-3">Todavía no hay padrones cargados.</p>
          )}
          <p className="mt-3 text-xs text-texto-3">
            Al facturar manda la alícuota de la ficha del cliente; si no tiene, la del padrón de la provincia de la percepción; si
            no figura, la general de la percepción.
          </p>
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-3 font-semibold">Retención de IIBB al pagar</h2>
          <RetencionIibb
            provincias={d.provincias}
            c={{
              activa: d.config?.iibbActiva ?? false,
              provincia: d.config?.iibbProvincia ?? null,
              minimo: d.config?.iibbMinimo ?? '0',
              alicuotaGeneral: d.config?.iibbAlicuotaGeneral ?? null,
            }}
          />
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-3 font-semibold">Acceso a ARBA</h2>
          <AccesoArba c={d.arba} />
        </Panel>
      </div>
    </>
  )
}
