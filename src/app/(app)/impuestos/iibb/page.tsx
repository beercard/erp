import { FileSpreadsheet } from 'lucide-react'
import type { Metadata } from 'next'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import {
  baseIibb,
  percepcionesPracticadas,
  percepcionesSufridas,
  retencionesPracticadas,
  retencionesSufridas,
} from '@/modulos/impuestos/retenciones'

import { periodoPedido, pesos } from '../periodo'
import { SelectorPeriodo } from '../SelectorPeriodo'

export const metadata: Metadata = { title: 'Ingresos Brutos' }

/** Ingresos Brutos del mes: base por jurisdicción, percepciones y retenciones (practicadas y sufridas). */
export default async function Iibb({ searchParams }: PageProps<'/impuestos/iibb'>) {
  const sesion = await exigirPermiso('impuestos.libros')
  const periodo = periodoPedido(((await searchParams) as { periodo?: string }).periodo)
  const d = await conEmpresa(sesion, async (tx) => ({
    base: await baseIibb(tx, periodo),
    percepciones: await percepcionesPracticadas(tx, periodo),
    sufridas: (await percepcionesSufridas(tx, periodo)).filter((p) => p.tipo === 'percepcion_iibb'),
    retenidas: (await retencionesSufridas(tx, periodo)).filter((r) => r.impuesto === 'iibb'),
    practicadas: (await retencionesPracticadas(tx, periodo)).filter((r) => r.impuesto === 'iibb'),
  }))
  const porJurisdiccion = new Map<string, { base: number; importe: number; cantidad: number }>()
  for (const p of d.percepciones) {
    const k = p.jurisdiccion ?? 'Sin jurisdicción'
    const x = porJurisdiccion.get(k) ?? { base: 0, importe: 0, cantidad: 0 }
    porJurisdiccion.set(k, { base: x.base + p.base, importe: x.importe + p.importe, cantidad: x.cantidad + 1 })
  }
  const totalRetenidas = d.retenidas.reduce((s, r) => s + r.importe, 0)
  const totalSufridas = d.sufridas.reduce((s, r) => s + r.importe, 0)
  const tabla = 'w-full text-sm'
  const th = 'py-1 text-left text-xs font-medium text-texto-3'
  return (
    <>
      <EncabezadoPagina
        titulo="Ingresos Brutos"
        bajada="Base del mes por jurisdicción, percepciones cobradas como agente y lo que te percibieron y retuvieron (pagos a cuenta)."
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <SelectorPeriodo ruta="/impuestos/iibb" periodo={periodo} />
            <a
              href={`/impuestos/iibb/excel?periodo=${periodo}`}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2"
            >
              <FileSpreadsheet aria-hidden className="size-4" /> Excel
            </a>
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <h2 className="mb-1 text-sm font-semibold">Ventas netas por provincia del cliente</h2>
          <p className="mb-2 text-xs text-texto-2">
            Sin IVA ni percepciones. Ayuda para distribuir la base en el Convenio Multilateral.
          </p>
          <table className={tabla}>
            <tbody>
              {d.base.lista.map((f) => (
                <tr key={f.provincia ?? '-'} className="border-b border-borde last:border-0">
                  <td className="py-1">{f.jurisdiccion ?? 'Sin provincia cargada'}</td>
                  <td className="cifras py-1 text-right text-texto-2">{f.porcentaje.toLocaleString('es-AR')} %</td>
                  <td className="cifras py-1 text-right">{pesos(f.neto)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1">Total</td>
                <td />
                <td className="cifras py-1 text-right">{pesos(d.base.total)}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
        <Panel className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Percepciones cobradas (como agente)</h2>
          {porJurisdiccion.size === 0 ? (
            <p className="text-sm text-texto-2">No hubo percepciones en el mes.</p>
          ) : (
            <table className={tabla}>
              <thead>
                <tr>
                  <th className={th}>Jurisdicción</th>
                  <th className={`${th} text-right`}>Comprobantes</th>
                  <th className={`${th} text-right`}>Base</th>
                  <th className={`${th} text-right`}>Percibido</th>
                </tr>
              </thead>
              <tbody>
                {[...porJurisdiccion].map(([k, v]) => (
                  <tr key={k} className="border-t border-borde">
                    <td className="py-1">{k}</td>
                    <td className="cifras py-1 text-right">{v.cantidad}</td>
                    <td className="cifras py-1 text-right">{pesos(v.base)}</td>
                    <td className="cifras py-1 text-right">{pesos(v.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {d.practicadas.length > 0 && (
            <p className="mt-3 text-sm">
              Retenciones de IIBB practicadas a proveedores:{' '}
              <span className="cifras font-medium">{pesos(d.practicadas.reduce((s, r) => s + Number(r.importe), 0))}</span> (
              {d.practicadas.length})
            </p>
          )}
        </Panel>
        <Panel className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Percepciones sufridas en compras</h2>
          {d.sufridas.length === 0 ? (
            <p className="text-sm text-texto-2">No hubo.</p>
          ) : (
            <table className={tabla}>
              <tbody>
                {d.sufridas.map((s) => (
                  <tr key={s.provincia ?? '-'} className="border-b border-borde last:border-0">
                    <td className="py-1">{s.jurisdiccion ?? 'Sin jurisdicción'}</td>
                    <td className="cifras py-1 text-right text-texto-2">{s.cantidad}</td>
                    <td className="cifras py-1 text-right">{pesos(s.importe)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-1">Total</td>
                  <td />
                  <td className="cifras py-1 text-right">{pesos(totalSufridas)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Panel>
        <Panel className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Retenciones sufridas en cobranzas</h2>
          {d.retenidas.length === 0 ? (
            <p className="text-sm text-texto-2">No hubo.</p>
          ) : (
            <table className={tabla}>
              <tbody>
                {d.retenidas.map((r, i) => (
                  <tr key={i} className="border-b border-borde last:border-0">
                    <td className="cifras py-1 whitespace-nowrap">{r.fecha.split('-').reverse().join('/')}</td>
                    <td className="py-1">
                      {r.cliente}
                      {r.certificado && <span className="block text-xs text-texto-3">Certificado {r.certificado}</span>}
                    </td>
                    <td className="cifras py-1 text-right">{pesos(r.importe)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-1">Total</td>
                  <td />
                  <td className="cifras py-1 text-right">{pesos(totalRetenidas)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  )
}
