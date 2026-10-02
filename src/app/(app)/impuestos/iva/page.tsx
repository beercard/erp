import { Download, FileSpreadsheet, Lock } from 'lucide-react'
import type { Metadata } from 'next'

import { Aviso, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { posicionIva } from '@/modulos/impuestos/posicionIva'
import { listarPresentaciones, periodoCerrado } from '@/modulos/impuestos/presentaciones'

import { nombrePeriodo, periodoPedido, pesos } from '../periodo'
import { Presentaciones } from '../Presentaciones'
import { SelectorPeriodo } from '../SelectorPeriodo'

export const metadata: Metadata = { title: 'IVA' }

const ALICUOTAS = ['27', '21', '10,5', '5', '2,5', '0']

/** IVA del mes: posición (débito, crédito, pagos a cuenta), libros de ventas y compras y el Libro IVA Digital. */
export default async function Iva({ searchParams }: PageProps<'/impuestos/iva'>) {
  const sesion = await exigirPermiso('impuestos.libros')
  const periodo = periodoPedido(((await searchParams) as { periodo?: string }).periodo)
  const { p, lista, cerrado } = await conEmpresa(sesion.empresa.id, async (tx) => ({
    p: await posicionIva(tx, periodo),
    lista: await listarPresentaciones(tx, 'iva_digital', periodo),
    cerrado: await periodoCerrado(tx, 'iva_digital', periodo),
  }))
  const advertencias = [...p.ventas.advertencias, ...p.compras.advertencias]
  const filaPos = (texto: string, valor: number, fuerte = false) => (
    <div className={`flex justify-between gap-4 py-1.5 ${fuerte ? 'border-t border-borde font-semibold' : ''}`}>
      <span className={fuerte ? '' : 'text-texto-2'}>{texto}</span>
      <span className="cifras">{pesos(valor)}</span>
    </div>
  )
  return (
    <>
      <EncabezadoPagina
        titulo="IVA"
        bajada="Posición del mes, libros de ventas y compras y el Libro IVA Digital para importar en el Portal IVA de ARCA."
        acciones={<SelectorPeriodo ruta="/impuestos/iva" periodo={periodo} />}
      />
      {cerrado && (
        <div className="mb-4">
          <Aviso tono="info">
            <span className="flex items-center gap-2">
              <Lock aria-hidden className="size-4" /> El Libro IVA de {nombrePeriodo(periodo)} está presentado
              {cerrado.transaccion ? ` (transacción ${cerrado.transaccion})` : ''}: no se cargan ni anulan comprobantes de ese
              mes.
            </span>
          </Aviso>
        </div>
      )}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Panel className="p-4 text-sm">
          <h2 className="mb-2 font-semibold">Posición de IVA</h2>
          {filaPos('Débito fiscal (ventas)', p.debito)}
          {filaPos('Crédito fiscal (compras)', -p.credito)}
          {filaPos(p.saldoTecnico >= 0 ? 'Saldo técnico a pagar' : 'Saldo técnico a favor', p.saldoTecnico, true)}
          {filaPos('Percepciones de IVA sufridas', -p.percepciones)}
          {filaPos('Retenciones de IVA sufridas', -p.retenciones)}
          {filaPos(p.aPagar >= 0 ? 'A pagar' : 'Saldo a favor', p.aPagar, true)}
          <p className="mt-2 text-xs text-texto-3">
            Sin saldos a favor de meses anteriores: los suma el contador en la declaración.
          </p>
        </Panel>
        {(['ventas', 'compras'] as const).map((k) => {
          const l = p[k]
          return (
            <Panel key={k} className="p-4 text-sm">
              <h2 className="mb-2 font-semibold">
                {k === 'ventas' ? 'Ventas' : 'Compras'}{' '}
                <span className="font-normal text-texto-2">({l.resumen.cantidad} comprobantes)</span>
              </h2>
              <table className="w-full">
                <thead className="text-left text-xs text-texto-3">
                  <tr>
                    <th className="py-1 font-medium">Alícuota</th>
                    <th className="py-1 text-right font-medium">Neto</th>
                    <th className="py-1 text-right font-medium">IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {ALICUOTAS.filter((a) => l.resumen.porAlicuota[a]).map((a) => (
                    <tr key={a}>
                      <td className="py-1">{a} %</td>
                      <td className="cifras py-1 text-right">{pesos(l.resumen.porAlicuota[a].base)}</td>
                      <td className="cifras py-1 text-right">{pesos(l.resumen.porAlicuota[a].iva)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-borde text-texto-2">
                    <td className="py-1">Exento / no gravado</td>
                    <td className="cifras py-1 text-right">{pesos(l.resumen.exento + l.resumen.noGravado)}</td>
                    <td />
                  </tr>
                  <tr className="text-texto-2">
                    <td className="py-1">Percepciones y otros</td>
                    <td className="cifras py-1 text-right">{pesos(l.resumen.percepciones)}</td>
                    <td />
                  </tr>
                  <tr className="border-t border-borde font-semibold">
                    <td className="py-1">Total</td>
                    <td className="cifras py-1 text-right">{pesos(l.resumen.total)}</td>
                    <td className="cifras py-1 text-right">{pesos(l.resumen.iva)}</td>
                  </tr>
                </tbody>
              </table>
            </Panel>
          )
        })}
      </div>

      {advertencias.length > 0 && (
        <div className="mb-4">
          <Aviso tono="aviso">
            <span className="font-medium">Revisá antes de presentar:</span>
            <ul className="mt-1 list-disc pl-5">
              {advertencias.slice(0, 20).map((a, i) => (
                <li key={i}>
                  {a.comprobante}: {a.problema}
                </li>
              ))}
            </ul>
          </Aviso>
        </div>
      )}

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-3">
          <h2 className="text-sm font-semibold">Libro IVA Digital</h2>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/impuestos/iva/excel?periodo=${periodo}`}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2"
            >
              <FileSpreadsheet aria-hidden className="size-4" /> Subdiarios en Excel
            </a>
            {!cerrado && (
              <a
                href={`/impuestos/iva/descargar?periodo=${periodo}`}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-acento px-3 text-sm font-medium text-sobre-acento hover:bg-acento-hover"
              >
                <Download aria-hidden className="size-4" /> Archivos para el Portal IVA (.zip)
              </a>
            )}
          </div>
        </div>
        <p className="border-b border-borde px-4 py-2 text-xs text-texto-2">
          El .zip trae los cuatro archivos (ventas y compras: comprobantes y alícuotas) para importar en Portal IVA › Libro IVA
          Digital. Cada descarga queda guardada acá; cuando la presentes, marcala con el número de transacción y el mes queda
          cerrado.
        </p>
        <Presentaciones lista={lista} puede={tienePermiso(sesion.permisos, 'impuestos.libros')} />
      </Panel>
    </>
  )
}
