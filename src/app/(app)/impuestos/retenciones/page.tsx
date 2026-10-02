import { Download, FileSpreadsheet } from 'lucide-react'
import type { Metadata } from 'next'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { listarPresentaciones } from '@/modulos/impuestos/presentaciones'
import { percepcionesSufridas, retencionesPracticadas, retencionesSufridas } from '@/modulos/impuestos/retenciones'

import { periodoPedido, pesos } from '../periodo'
import { Presentaciones } from '../Presentaciones'
import { SelectorPeriodo } from '../SelectorPeriodo'

export const metadata: Metadata = { title: 'Retenciones' }

const IMPUESTO: Record<string, string> = { ganancias: 'Ganancias', iibb: 'Ingresos Brutos', iva: 'IVA', suss: 'SUSS' }

/** Retenciones practicadas (con el archivo de SICORE) y retenciones y percepciones sufridas. */
export default async function Retenciones({ searchParams }: PageProps<'/impuestos/retenciones'>) {
  const sesion = await exigirPermiso('impuestos.libros')
  const periodo = periodoPedido(((await searchParams) as { periodo?: string }).periodo)
  const d = await conEmpresa(sesion.empresa.id, async (tx) => ({
    practicadas: await retencionesPracticadas(tx, periodo),
    sufridas: await retencionesSufridas(tx, periodo),
    percepciones: (await percepcionesSufridas(tx, periodo)).filter((p) => p.tipo !== 'percepcion_iibb'),
    sicore: await listarPresentaciones(tx, 'sicore', periodo),
  }))
  const ganancias = d.practicadas.filter((r) => r.impuesto === 'ganancias')
  const presentada = d.sicore.some((p) => p.estado === 'presentada')
  const th = 'px-4 py-2 text-left text-xs font-medium text-texto-2'
  return (
    <>
      <EncabezadoPagina
        titulo="Retenciones"
        bajada="Lo que retuviste en los pagos a proveedores (para SICORE) y lo que te retuvieron o percibieron."
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <SelectorPeriodo ruta="/impuestos/retenciones" periodo={periodo} />
            <a
              href={`/impuestos/retenciones/excel?periodo=${periodo}`}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2"
            >
              <FileSpreadsheet aria-hidden className="size-4" /> Excel
            </a>
          </div>
        }
      />
      <Panel className="mb-4 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-3">
          <h2 className="text-sm font-semibold">Retenciones practicadas</h2>
          {ganancias.length > 0 && !presentada && (
            <a
              href={`/impuestos/retenciones/sicore?periodo=${periodo}`}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-acento px-3 text-sm font-medium text-sobre-acento hover:bg-acento-hover"
            >
              <Download aria-hidden className="size-4" /> Archivo para SICORE (Ganancias)
            </a>
          )}
        </div>
        {d.practicadas.length === 0 ? (
          <p className="px-4 py-3 text-sm text-texto-2">No hubo retenciones en los pagos del mes.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-borde">
              <tr>
                <th className={th}>Fecha</th>
                <th className={th}>Impuesto</th>
                <th className={th}>Certificado</th>
                <th className={th}>Proveedor</th>
                <th className={`${th} text-right`}>Base</th>
                <th className={`${th} text-right`}>Retenido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {d.practicadas.map((r) => (
                <tr key={r.id}>
                  <td className="cifras px-4 py-2">{r.fecha.split('-').reverse().join('/')}</td>
                  <td className="px-4 py-2">
                    {IMPUESTO[r.impuesto]}
                    {r.regimen && <span className="text-xs text-texto-3"> · régimen {r.regimen}</span>}
                  </td>
                  <td className="cifras px-4 py-2">{r.certificado}</td>
                  <td className="px-4 py-2">{r.proveedor}</td>
                  <td className="cifras px-4 py-2 text-right">{pesos(Number(r.base))}</td>
                  <td className="cifras px-4 py-2 text-right">{pesos(Number(r.importe))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(d.sicore.length > 0 || ganancias.length > 0) && (
          <div className="border-t border-borde">
            <p className="px-4 pt-3 text-xs text-texto-2">
              SICORE: cada descarga queda guardada; al presentarla, marcala con el número de transacción y el mes queda cerrado
              para SICORE.
            </p>
            <Presentaciones lista={d.sicore} puede={tienePermiso(sesion.permisos, 'impuestos.libros')} />
          </div>
        )}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Retenciones sufridas (te las descontaron los clientes)</h2>
          {d.sufridas.length === 0 ? (
            <p className="text-sm text-texto-2">No hubo.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {d.sufridas.map((r, i) => (
                  <tr key={i} className="border-b border-borde last:border-0">
                    <td className="cifras py-1 whitespace-nowrap">{r.fecha.split('-').reverse().join('/')}</td>
                    <td className="py-1">
                      {IMPUESTO[r.impuesto] ?? r.impuesto} · {r.cliente}
                      {r.certificado && <span className="block text-xs text-texto-3">Certificado {r.certificado}</span>}
                    </td>
                    <td className="cifras py-1 text-right">{pesos(r.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Percepciones de IVA y Ganancias sufridas</h2>
          {d.percepciones.length === 0 ? (
            <p className="text-sm text-texto-2">No hubo.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {d.percepciones.map((p) => (
                  <tr key={p.tipo} className="border-b border-borde last:border-0">
                    <td className="py-1">{p.tipo === 'percepcion_iva' ? 'IVA' : 'Ganancias'}</td>
                    <td className="cifras py-1 text-right text-texto-2">{p.cantidad}</td>
                    <td className="cifras py-1 text-right">{pesos(p.importe)}</td>
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
