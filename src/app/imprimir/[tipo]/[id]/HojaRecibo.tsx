import { notFound } from 'next/navigation'

import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearCuit } from '@/lib/cuit'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import { formatearNumero } from '@/modulos/comercial/formato'
import { datosEmpresa } from '@/modulos/empresa/datos'
import { obtenerRecibo } from '@/modulos/facturacion/cuentas'
import { MEDIOS } from '@/modulos/facturacion/medios'
import { abreviatura } from '@/modulos/facturacion/tipos'

import { BotonImprimir } from './BotonImprimir'

/** Recibo de cobranza: comprobante interno ("X"), sin valor fiscal. */
export async function HojaRecibo({ id }: { id: string }) {
  const sesion = await requerirEmpresa()
  const empresa = await datosEmpresa(sesion.empresa.id)
  const r = await enLaEmpresa('ventas.ver', (tx) => obtenerRecibo(tx, id))
  if (!r || !empresa) notFound()
  const numero = formatearNumero(r.puntoVenta, r.numero)
  return (
    <div className="hoja min-h-full">
      <div className="no-imprimir sticky top-0 flex items-center justify-between gap-3 border-b border-borde bg-superficie-2 px-6 py-3">
        <span className="text-sm text-texto-2">Recibo {numero} · A4</span>
        <BotonImprimir />
      </div>
      <article className="mx-auto flex max-w-[190mm] flex-col gap-4 px-6 py-8 text-[12px] print:max-w-none print:p-0">
        <header className="grid grid-cols-[1fr_auto_1fr] gap-4 border-b-2 border-texto pb-4">
          <div>
            <p className="text-lg font-bold">{empresa.nombreFantasia || empresa.razonSocial}</p>
            <p>{[empresa.domicilioFiscal, empresa.localidad].filter(Boolean).join(', ')}</p>
            <p className="cifras">CUIT {formatearCuit(empresa.cuit)}</p>
          </div>
          <div className="flex flex-col items-center">
            <span className="grid size-12 place-items-center border-2 border-texto text-2xl font-bold">X</span>
            <span className="mt-1 text-center text-[9px] leading-tight">
              Documento no válido
              <br />
              como factura
            </span>
          </div>
          <div className="text-right">
            <p className="text-base font-bold">Recibo N° {numero}</p>
            <p>Fecha: {fechaCorta(r.fecha)}</p>
          </div>
        </header>

        <p className="text-sm">
          Recibimos de <b>{r.cliente?.razonSocial}</b>
          {r.cliente?.numeroDocumento && <span className="cifras"> ({formatearCuit(r.cliente.numeroDocumento)})</span>} la suma de{' '}
          <b className="cifras">{formatearMonto(r.total, '$')}</b> según el detalle:
        </p>

        <table className="w-full">
          <thead>
            <tr className="border-y border-texto text-left">
              <th className="px-2 py-1">Valor</th>
              <th className="px-2 py-1">Detalle</th>
              <th className="px-2 py-1 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {r.valores.map((v) => (
              <tr key={v.id} className="border-b border-borde">
                <td className="px-2 py-1">{MEDIOS[v.medio as keyof typeof MEDIOS] ?? v.medio}</td>
                <td className="px-2 py-1">
                  {[v.banco, v.numeroValor && `N° ${v.numeroValor}`, v.fechaPago && `pago ${fechaCorta(v.fechaPago)}`, v.detalle]
                    .filter(Boolean)
                    .join(' · ')}
                </td>
                <td className="cifras px-2 py-1 text-right">{formatearMonto(v.importe, '$')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {(r.imputaciones.length > 0 || Number(r.aCuenta) > 0) && (
          <div>
            <p className="mb-1 font-semibold">Aplicado a</p>
            <ul className="flex flex-col gap-0.5">
              {r.imputaciones.map((i) => (
                <li key={i.id} className="cifras flex justify-between">
                  <span>
                    {abreviatura(i.tipo)} {formatearNumero(i.puntoVenta, i.numero ?? 0)} del {fechaCorta(i.fecha)}
                  </span>
                  <span>{formatearMonto(i.importe, '$')}</span>
                </li>
              ))}
              {Number(r.aCuenta) > 0 && (
                <li className="cifras flex justify-between">
                  <span className="font-sans">A cuenta</span>
                  <span>{formatearMonto(r.aCuenta, '$')}</span>
                </li>
              )}
            </ul>
          </div>
        )}
        {r.observaciones && <p className="whitespace-pre-line">{r.observaciones}</p>}
        {r.estado === 'anulado' && <p className="text-center text-xl font-bold tracking-widest text-error">ANULADO</p>}
        <p className="mt-2 text-[10.5px] text-texto-2">Los cheques y ECHEQ se reciben salvo buen cobro.</p>
        <footer className="mt-14 grid grid-cols-2 gap-16 text-center text-texto-2">
          <p className="border-t border-texto pt-1">Firma</p>
          <p className="border-t border-texto pt-1">Aclaración</p>
        </footer>
      </article>
    </div>
  )
}
