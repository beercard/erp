import { CircleCheck, Download, FileSpreadsheet, Lock, TriangleAlert } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { controlesIva } from '@/modulos/impuestos/controles'
import { enviosDelPeriodo } from '@/modulos/impuestos/paquete'
import { configuracion } from '@/modulos/impuestos/vencimientos'
import { posicionIva } from '@/modulos/impuestos/posicionIva'
import { listarPresentaciones, periodoCerrado } from '@/modulos/impuestos/presentaciones'

import { nombrePeriodo, periodoPedido, pesos } from '../periodo'
import { PaqueteContador } from '../Contador'
import { CruceArca } from '../CruceArca'
import { Presentaciones } from '../Presentaciones'
import { SaldosIniciales } from '../SaldosIniciales'
import { SelectorPeriodo } from '../SelectorPeriodo'

export const metadata: Metadata = { title: 'IVA' }

const ALICUOTAS = ['27', '21', '10,5', '5', '2,5', '0']

/** IVA del mes: posición (débito, crédito, pagos a cuenta), libros de ventas y compras y el Libro IVA Digital. */
export default async function Iva({ searchParams }: PageProps<'/impuestos/iva'>) {
  const sesion = await exigirPermiso('impuestos.libros')
  const periodo = periodoPedido(((await searchParams) as { periodo?: string }).periodo)
  const { p, lista, cerrado, controles, envios, cfg } = await conEmpresa(sesion.empresa.id, async (tx) => ({
    p: await posicionIva(tx, periodo),
    lista: await listarPresentaciones(tx, 'iva_digital', periodo),
    cerrado: await periodoCerrado(tx, 'iva_digital', periodo),
    controles: await controlesIva(tx, periodo),
    envios: await enviosDelPeriodo(tx, periodo),
    cfg: await configuracion(tx),
  }))
  const errores = controles.filter((c) => c.gravedad === 'error').length
  const avisos = controles.length - errores
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
          {p.anterior.tecnico > 0 && filaPos('Saldo técnico a favor del mes anterior', -p.anterior.tecnico)}
          {filaPos(p.saldoTecnico >= 0 ? 'Impuesto determinado' : 'Saldo técnico a favor', Math.abs(p.saldoTecnico), true)}
          {filaPos('Percepciones de IVA sufridas', -p.percepciones)}
          {filaPos('Retenciones de IVA sufridas', -p.retenciones)}
          {p.anterior.libre > 0 && filaPos('Libre disponibilidad del mes anterior', -p.anterior.libre)}
          {filaPos('A pagar', p.aPagar, true)}
          {(p.saldoTecnicoAFavor > 0 || p.libreDisponibilidad > 0) && (
            <div className="mt-2 rounded-md bg-superficie-2 p-2 text-xs">
              <p className="font-medium">Pasa al mes siguiente</p>
              {p.saldoTecnicoAFavor > 0 && <p>Saldo técnico a favor: {pesos(p.saldoTecnicoAFavor)}</p>}
              {p.libreDisponibilidad > 0 && <p>Saldo de libre disponibilidad: {pesos(p.libreDisponibilidad)}</p>}
            </div>
          )}
          <p className="mt-2 text-xs text-texto-3">
            {p.anterior.origen === 'presentacion'
              ? 'Los saldos del mes anterior salen de su presentación.'
              : p.anterior.origen === 'manual'
                ? 'Los saldos del mes anterior se cargaron a mano.'
                : 'El mes anterior no está presentado desde el sistema: si tenía saldos a favor, cargalos.'}
          </p>
          {p.anterior.origen !== 'presentacion' && !cerrado && (
            <SaldosIniciales periodo={periodo} tecnico={p.anterior.tecnico} libre={p.anterior.libre} />
          )}
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

      <Panel className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {controles.length === 0 ? (
              <CircleCheck aria-hidden className="size-4 text-ok" />
            ) : (
              <TriangleAlert aria-hidden className={`size-4 ${errores ? 'text-error' : 'text-aviso'}`} />
            )}
            Controles antes de presentar
          </h2>
          <span className="text-xs text-texto-2">
            {controles.length === 0
              ? 'Todo en orden.'
              : `${errores ? `${errores} ${errores === 1 ? 'error' : 'errores'}` : ''}${errores && avisos ? ' y ' : ''}${avisos ? `${avisos} ${avisos === 1 ? 'aviso' : 'avisos'}` : ''}`}
          </span>
        </div>
        {controles.length > 0 && (
          <ul className="max-h-80 divide-y divide-borde overflow-auto text-sm">
            {controles.map((c, i) => (
              <li key={i} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2">
                <Chip tono={c.gravedad === 'error' ? 'error' : 'aviso'}>{c.gravedad === 'error' ? 'Error' : 'Aviso'}</Chip>
                <span className="min-w-0 flex-1">
                  <Link href={c.enlace} className="font-medium hover:underline">
                    {c.comprobante}
                  </Link>
                  <span className="text-xs text-texto-3"> · {c.libro}</span>
                  <span className="block text-texto-2">{c.problema}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="mb-4">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Cruce de compras con Mis Comprobantes de ARCA</h2>
        <CruceArca periodo={periodo} puedeRegistrar={tienePermiso(sesion.permisos, 'compras.cargar')} cerrado={!!cerrado} />
      </Panel>
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
                {errores > 0 && <span className="text-xs font-normal opacity-90">· {errores} con error</span>}
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
      <Panel className="mt-4">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Paquete para el contador</h2>
        <PaqueteContador periodo={periodo} email={cfg.emailContador} envios={envios} />
      </Panel>
    </>
  )
}
