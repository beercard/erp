import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { condicionesIva, retenciones } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearCuit } from '@/lib/cuit'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import { formatearNumero } from '@/modulos/comercial/formato'
import { MEDIOS_PAGO } from '@/modulos/compras/medios'
import { obtenerOrden } from '@/modulos/compras/ordenes'
import { obtenerPago } from '@/modulos/compras/pagos'
import { abreviaturaCompra } from '@/modulos/compras/tipos'
import { datosEmpresa } from '@/modulos/empresa/datos'

import { BotonImprimir } from './BotonImprimir'

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }

function Marco({ titulo, barra, children }: { titulo: string; barra: string; children: ReactNode }) {
  return (
    <div className="hoja min-h-full">
      <div className="no-imprimir sticky top-0 flex items-center justify-between gap-3 border-b border-borde bg-superficie-2 px-6 py-3">
        <span className="text-sm text-texto-2">{barra}</span>
        <BotonImprimir />
      </div>
      <article
        className="mx-auto flex max-w-[190mm] flex-col gap-4 px-6 py-8 text-[12px] print:max-w-none print:p-0"
        aria-label={titulo}
      >
        {children}
      </article>
    </div>
  )
}

function Encabezado({
  empresa,
  titulo,
  derecha,
}: {
  empresa: NonNullable<Awaited<ReturnType<typeof datosEmpresa>>>
  titulo: string
  derecha: ReactNode
}) {
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] gap-4 border-b-2 border-texto pb-4">
      <div>
        <p className="text-lg font-bold">{empresa.nombreFantasia || empresa.razonSocial}</p>
        {empresa.nombreFantasia && <p>{empresa.razonSocial}</p>}
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
        <p className="text-base font-bold">{titulo}</p>
        {derecha}
      </div>
    </header>
  )
}

/** Orden de pago: qué cancela, con qué se pagó y lo retenido. */
export async function HojaPago({ id }: { id: string }) {
  const sesion = await requerirEmpresa()
  const empresa = await datosEmpresa(sesion.empresa.id)
  const p = await enLaEmpresa('compras.ver', (tx) => obtenerPago(tx, id))
  if (!p || !empresa) notFound()
  const simbolo = SIMBOLO[p.moneda] ?? p.moneda
  const numero = String(p.numero).padStart(6, '0')
  return (
    <Marco titulo={`Orden de pago ${numero}`} barra={`Orden de pago ${numero} · A4`}>
      <Encabezado empresa={empresa} titulo={`Orden de pago N° ${numero}`} derecha={<p>Fecha: {fechaCorta(p.fecha)}</p>} />
      <p className="text-sm">
        Páguese a <b>{p.proveedor?.razonSocial}</b>
        {p.proveedor?.numeroDocumento && (
          <span className="cifras"> (CUIT {formatearCuit(p.proveedor.numeroDocumento)})</span>
        )} por <b className="cifras">{formatearMonto(p.total, simbolo)}</b>
        {p.moneda !== 'PES' && <span className="cifras"> (dólar {Number(p.cotizacion).toLocaleString('es-AR')})</span>}, según el
        detalle:
      </p>
      <table className="w-full">
        <thead>
          <tr className="border-y border-texto text-left">
            <th className="px-2 py-1">Comprobante</th>
            <th className="px-2 py-1">Fecha</th>
            <th className="px-2 py-1 text-right">Cancela</th>
          </tr>
        </thead>
        <tbody>
          {p.imputaciones.map((i) => (
            <tr key={i.id} className="border-b border-borde">
              <td className="cifras px-2 py-1">
                {abreviaturaCompra(i.tipo)} {formatearNumero(i.puntoVenta, i.numero)}
              </td>
              <td className="px-2 py-1">{fechaCorta(i.fecha)}</td>
              <td className="cifras px-2 py-1 text-right">{formatearMonto(i.importe, SIMBOLO[i.moneda] ?? i.moneda)}</td>
            </tr>
          ))}
          {Number(p.aCuenta) > 0 && (
            <tr className="border-b border-borde">
              <td className="px-2 py-1" colSpan={2}>
                A cuenta
              </td>
              <td className="cifras px-2 py-1 text-right">{formatearMonto(p.aCuenta, simbolo)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <table className="w-full">
        <thead>
          <tr className="border-y border-texto text-left">
            <th className="px-2 py-1">Valor</th>
            <th className="px-2 py-1">Detalle</th>
            <th className="px-2 py-1 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {p.valores.map((v) => (
            <tr key={v.id} className="border-b border-borde">
              <td className="px-2 py-1">{MEDIOS_PAGO[v.medio as keyof typeof MEDIOS_PAGO] ?? v.medio}</td>
              <td className="px-2 py-1">
                {[v.banco, v.numeroValor && `N° ${v.numeroValor}`, v.fechaPago && `pago ${fechaCorta(v.fechaPago)}`, v.detalle]
                  .filter(Boolean)
                  .join(' · ')}
              </td>
              <td className="cifras px-2 py-1 text-right">{formatearMonto(v.importe, simbolo)}</td>
            </tr>
          ))}
          {p.retenciones.map((r) => (
            <tr key={r.id} className="border-b border-borde">
              <td className="px-2 py-1">{r.impuesto === 'iibb' ? 'Retención de IIBB' : 'Retención de Ganancias'}</td>
              <td className="cifras px-2 py-1">
                {r.impuesto === 'iibb' ? 'Provincia' : 'Régimen'} {r.regimen} · certificado {String(r.numero).padStart(6, '0')}
              </td>
              <td className="cifras px-2 py-1 text-right">{formatearMonto(r.importe, '$')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {p.observaciones && <p className="whitespace-pre-line">{p.observaciones}</p>}
      {p.estado === 'anulado' && <p className="text-center text-xl font-bold tracking-widest text-error">ANULADA</p>}
      <footer className="mt-14 grid grid-cols-3 gap-10 text-center text-texto-2">
        {['Autorizó', 'Recibí conforme', 'Aclaración y DNI'].map((t) => (
          <p key={t} className="border-t border-texto pt-1">
            {t}
          </p>
        ))}
      </footer>
    </Marco>
  )
}

/** Certificado de retención de Ganancias (RG 2233, Anexo V: datos que exige SICORE) o de Ingresos Brutos. */
export async function HojaRetencion({ id }: { id: string }) {
  const sesion = await requerirEmpresa()
  const empresa = await datosEmpresa(sesion.empresa.id)
  const datos = await enLaEmpresa('compras.ver', async (tx) => {
    const [r] = await tx.select().from(retenciones).where(eq(retenciones.id, id))
    if (!r) return null
    const p = await obtenerPago(tx, r.pagoId)
    const [iva] = p?.proveedor
      ? await tx.select().from(condicionesIva).where(eq(condicionesIva.codigo, p.proveedor.condicionIva))
      : []
    return p && { r, p, iva }
  })
  if (!datos || !empresa) notFound()
  const { r, p } = datos
  const numero = String(r.numero).padStart(6, '0')
  const iibb = r.impuesto === 'iibb'
  const pagado = p.imputaciones.reduce((s, i) => s + Number(i.importeOrigen), 0) + Number(p.aCuenta)
  return (
    <Marco titulo={`Certificado de retención ${numero}`} barra={`Certificado de retención ${numero} · A4`}>
      <Encabezado
        empresa={empresa}
        titulo={`Certificado de retención N° ${numero}`}
        derecha={
          <>
            <p>Fecha: {fechaCorta(p.fecha)}</p>
            <p>{iibb ? `Ingresos Brutos (${r.regimen})` : 'Impuesto a las Ganancias (217)'}</p>
          </>
        }
      />
      <section className="grid grid-cols-2 gap-6">
        <div>
          <p className="mb-1 font-semibold">Agente de retención</p>
          <p>{empresa.razonSocial}</p>
          <p className="cifras">CUIT {formatearCuit(empresa.cuit)}</p>
          <p>{[empresa.domicilioFiscal, empresa.localidad].filter(Boolean).join(', ')}</p>
        </div>
        <div>
          <p className="mb-1 font-semibold">Sujeto retenido</p>
          <p>{p.proveedor?.razonSocial}</p>
          {p.proveedor?.numeroDocumento && <p className="cifras">CUIT {formatearCuit(p.proveedor.numeroDocumento)}</p>}
          <p>{[p.proveedor?.domicilio, p.proveedor?.localidad].filter(Boolean).join(', ')}</p>
          <p>{datos.iva?.nombre}</p>
        </div>
      </section>
      <table className="w-full">
        <tbody>
          {[
            iibb
              ? ['Jurisdicción', `${r.regimen} (Ingresos Brutos)`]
              : ['Régimen', `${r.regimen}${p.regimen ? ` · ${p.regimen.concepto}` : ''} (RG 830)`],
            [
              'Comprobante que origina la retención',
              `Orden de pago N° ${String(p.numero).padStart(6, '0')} del ${fechaCorta(p.fecha)}`,
            ],
            [
              'Comprobantes cancelados',
              p.imputaciones.map((i) => `${abreviaturaCompra(i.tipo)} ${formatearNumero(i.puntoVenta, i.numero)}`).join(', ') ||
                'Pago a cuenta',
            ],
            ['Monto del pago', formatearMonto(pagado.toFixed(2), SIMBOLO[p.moneda] ?? p.moneda)],
            [
              iibb ? 'Base sujeta a retención' : 'Base sujeta a retención (acumulado del mes, menos el mínimo no sujeto)',
              formatearMonto(r.base, '$'),
            ],
            ['Alícuota', r.alicuota ? `${Number(r.alicuota).toLocaleString('es-AR')} %` : 'Según escala'],
          ].map(([k, v]) => (
            <tr key={k} className="border-b border-borde">
              <td className="w-1/2 py-1.5 pr-3 text-texto-2">{k}</td>
              <td className="cifras py-1.5">{v}</td>
            </tr>
          ))}
          <tr className="border-y-2 border-texto">
            <td className="py-2 pr-3 font-semibold">Importe retenido</td>
            <td className="cifras py-2 text-base font-bold">{formatearMonto(r.importe, '$')}</td>
          </tr>
        </tbody>
      </table>
      {p.estado === 'anulado' && <p className="text-center text-xl font-bold tracking-widest text-error">ANULADO</p>}
      <footer className="mt-16 grid grid-cols-2 gap-16 text-center text-texto-2">
        <p className="border-t border-texto pt-1">Firma del agente de retención</p>
        <p className="border-t border-texto pt-1">Aclaración y cargo</p>
      </footer>
    </Marco>
  )
}

/** Orden de compra para mandarle al proveedor. */
export async function HojaOrdenCompra({ id }: { id: string }) {
  const sesion = await requerirEmpresa()
  const empresa = await datosEmpresa(sesion.empresa.id)
  const o = await enLaEmpresa('compras.ver', (tx) => obtenerOrden(tx, id))
  if (!o || !empresa) notFound()
  const simbolo = SIMBOLO[o.moneda] ?? o.moneda
  const numero = String(o.numero).padStart(6, '0')
  return (
    <Marco titulo={`Orden de compra ${numero}`} barra={`Orden de compra ${numero} · A4`}>
      <Encabezado
        empresa={empresa}
        titulo={`Orden de compra N° ${numero}`}
        derecha={
          <>
            <p>Fecha: {fechaCorta(o.fecha)}</p>
            {o.fechaEntrega && <p>Entrega: {fechaCorta(o.fechaEntrega)}</p>}
          </>
        }
      />
      <p className="text-sm">
        Proveedor: <b>{o.proveedor?.razonSocial}</b>
        {o.proveedor?.numeroDocumento && <span className="cifras"> (CUIT {formatearCuit(o.proveedor.numeroDocumento)})</span>}
      </p>
      <table className="w-full">
        <thead>
          <tr className="border-y border-texto text-left">
            <th className="px-2 py-1">Cantidad</th>
            <th className="px-2 py-1">Descripción</th>
            <th className="px-2 py-1 text-right">Precio</th>
            <th className="px-2 py-1 text-right">Desc.</th>
            <th className="px-2 py-1 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.id} className="border-b border-borde">
              <td className="cifras px-2 py-1">{Number(i.cantidad).toLocaleString('es-AR')}</td>
              <td className="px-2 py-1">{i.descripcion}</td>
              <td className="cifras px-2 py-1 text-right">{formatearMonto(i.precioUnitario, simbolo)}</td>
              <td className="cifras px-2 py-1 text-right">{Number(i.descuento) ? `${Number(i.descuento)} %` : ''}</td>
              <td className="cifras px-2 py-1 text-right">{formatearMonto(i.neto, simbolo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="cifras ml-auto flex w-64 flex-col gap-1">
        <div className="flex justify-between">
          <dt className="font-sans">Neto</dt>
          <dd>{formatearMonto(o.neto, simbolo)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="font-sans">IVA</dt>
          <dd>{formatearMonto(o.iva, simbolo)}</dd>
        </div>
        <div className="flex justify-between border-t border-texto pt-1 font-bold">
          <dt className="font-sans">Total</dt>
          <dd>{formatearMonto(o.total, simbolo)}</dd>
        </div>
      </dl>
      {o.observaciones && <p className="whitespace-pre-line">{o.observaciones}</p>}
    </Marco>
  )
}
