import { inArray } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import type { ReactNode } from 'react'

import { arcaConfiguracion, condicionesIva, condicionesPago } from '@/db/schema'
import type { Transaccion } from '@/db/conexion'
import { conEmpresa } from '@/db/empresa'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearCuit } from '@/lib/cuit'
import { aImporte, D, formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import { TASAS_IVA } from '@/modulos/comercial/calculo'
import { formatearNumero } from '@/modulos/comercial/formato'
import { datosEmpresa } from '@/modulos/empresa/datos'
import { obtenerMarca } from '@/modulos/empresa/marca'
import { obtenerComprobante } from '@/modulos/facturacion/comprobantes'
import { abreviatura, datosTipo, LEYENDA_CBU_INFORMADA, urlQr } from '@/modulos/facturacion/tipos'

import { BotonImprimir } from './BotonImprimir'

const TITULO = { factura: 'FACTURA', nota_credito: 'NOTA DE CRÉDITO', nota_debito: 'NOTA DE DÉBITO' } as const
const CONCEPTO: Record<number, string> = { 1: 'Productos', 2: 'Servicios', 3: 'Productos y servicios' }
const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }
const cantidad = (v: string) => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 4 })

/**
 * Representación impresa de un comprobante electrónico (RG 1415 y RG 4291):
 * letra y código, datos de emisor y receptor, CAE con su vencimiento y QR.
 * En los B los precios van con IVA y se informa el IVA contenido (Ley 27.743).
 */
export async function HojaFactura({ id, empresaId }: { id: string; empresaId?: string }) {
  // Con empresaId viene de un enlace público firmado (sin sesión).
  const eid = empresaId ?? (await requerirEmpresa()).empresa.id
  const empresa = await datosEmpresa(eid)
  const leer = <T,>(trabajo: (tx: Transaccion) => Promise<T>) =>
    empresaId ? conEmpresa(empresaId, trabajo) : enLaEmpresa('ventas.ver', trabajo)
  const datos = await leer(async (tx) => {
    const c = await obtenerComprobante(tx, id)
    if (!c) return null
    const codigos = [c.receptorCondicionIva, empresa?.condicionIva].filter((x): x is number => x != null)
    const ivas = await tx
      .select()
      .from(condicionesIva)
      .where(inArray(condicionesIva.codigo, codigos.length ? codigos : [0]))
    const [condicion] = c.condicionPagoId
      ? await tx
          .select()
          .from(condicionesPago)
          .where(inArray(condicionesPago.id, [c.condicionPagoId]))
      : []
    const [arca] = await tx.select({ cbu: arcaConfiguracion.cbuInformada }).from(arcaConfiguracion)
    const marca = await obtenerMarca(tx)
    return { c, ivas: new Map(ivas.map((i) => [i.codigo, i.nombre])), condicion, cbu: arca?.cbu ?? null, marca }
  })
  // Solo se imprimen los emitidos por el ERP: los migrados están en PYMEXIS y los internos no son fiscales.
  if (!datos || !empresa || datos.c.estado !== 'autorizado' || !datos.c.numero || datos.c.origen !== 'erp') notFound()
  const { c, ivas, condicion, cbu, marca } = datos
  // Tres diseños con los mismos datos (los que exige la RG 1415): cambia la presentación.
  const moderno = marca.diseno === 'moderno'
  const compacto = marca.diseno === 'compacto'
  const borde = compacto ? 'border-texto/40' : 'border-texto'
  const caja = compacto ? 'border-b border-texto/40' : `border-x border-b ${borde}`
  const conColor = moderno ? { borderColor: marca.color } : undefined
  const { letra, clase, fce } = datosTipo(c.tipo)
  const discrimina = letra === 'A'
  const simbolo = SIMBOLO[c.moneda] ?? c.moneda
  const qr = c.cae
    ? await QRCode.toString(
        urlQr({
          fecha: c.fecha,
          cuit: empresa.cuit,
          puntoVenta: c.puntoVenta,
          tipo: c.tipo,
          numero: c.numero!,
          total: c.total,
          moneda: c.moneda,
          cotizacion: c.cotizacion,
          docTipo: c.receptorDocTipo,
          docNumero: c.receptorDocNumero,
          cae: c.cae,
        }),
        { type: 'svg', margin: 0, errorCorrectionLevel: 'M' },
      )
    : null
  const precioMostrado = (i: (typeof c.items)[number]) =>
    discrimina || letra === 'C'
      ? i.precioUnitario
      : new D(i.precioUnitario).times(new D(100).plus(TASAS_IVA[i.alicuotaIva])).dividedBy(100).toFixed(2)
  const subtotalMostrado = (i: (typeof c.items)[number]) =>
    discrimina || letra === 'C' ? i.neto : aImporte(new D(i.neto).plus(i.iva))
  const ivaContenido = c.iva

  return (
    <div className="hoja min-h-full">
      <div className="no-imprimir sticky top-0 flex items-center justify-between gap-3 border-b border-borde bg-superficie-2 px-6 py-3">
        <span className="text-sm text-texto-2">
          {abreviatura(c.tipo)} {formatearNumero(c.puntoVenta, c.numero!)} · A4
        </span>
        <BotonImprimir />
      </div>
      <article
        data-diseno={marca.diseno}
        className={`mx-auto flex max-w-[190mm] flex-col gap-0 px-6 py-8 print:max-w-none print:p-0 ${compacto ? 'text-[10px]' : 'text-[11.5px]'}`}
      >
        <p className="mb-1 text-center text-[10px] tracking-widest text-texto-2">ORIGINAL</p>
        <header
          className={`grid grid-cols-[1fr_auto_1fr] ${compacto ? `border-y ${borde}` : `border ${borde}`} ${moderno ? 'overflow-hidden rounded-lg border-2' : ''}`}
          style={conColor}
        >
          <div
            className={`flex flex-col gap-0.5 ${compacto ? 'p-2' : 'p-3'}`}
            style={moderno ? { backgroundColor: `${marca.color}14` } : undefined}
          >
            {marca.logo && (
              // eslint-disable-next-line @next/next/no-img-element -- imagen en base64 de la base, para imprimir y PDF
              <img
                src={marca.logo}
                alt={`Logo de ${empresa.nombreFantasia || empresa.razonSocial}`}
                className={`mb-1 w-auto object-contain object-left ${moderno ? 'max-h-20 max-w-56' : compacto ? 'max-h-10 max-w-36' : 'max-h-14 max-w-44'}`}
              />
            )}
            <p className={`font-bold ${moderno ? 'text-lg' : 'text-base'}`} style={moderno ? { color: marca.color } : undefined}>
              {empresa.nombreFantasia || empresa.razonSocial}
            </p>
            <p>
              <b>Razón social:</b> {empresa.razonSocial}
            </p>
            <p>
              <b>Domicilio:</b> {[empresa.domicilioFiscal, empresa.localidad].filter(Boolean).join(', ') || '—'}
            </p>
            <p>
              <b>Condición frente al IVA:</b> {ivas.get(empresa.condicionIva)}
            </p>
          </div>
          <div className={`flex flex-col items-center border-x ${borde} px-3 pt-0`} style={conColor}>
            <span
              className={`grid place-items-center border-x border-b ${borde} font-bold ${compacto ? 'size-10 text-2xl' : 'size-14 text-4xl'}`}
              style={moderno ? { borderColor: marca.color, backgroundColor: marca.color, color: '#fff' } : undefined}
            >
              {letra}
            </span>
            <span className="mt-1 text-[10px] font-semibold">COD. {String(c.tipo).padStart(2, '0')}</span>
          </div>
          <div className={`flex flex-col gap-0.5 ${compacto ? 'p-2' : 'p-3'}`}>
            <p className="text-base font-bold" style={moderno ? { color: marca.color } : undefined}>
              {fce ? `${TITULO[clase]} DE CRÉDITO ELECTRÓNICA MiPyME` : TITULO[clase]}
            </p>
            {c.leyenda && (
              <p className="border border-texto px-1.5 py-0.5 text-[11px] font-bold">
                {c.leyenda}
                {c.leyenda === LEYENDA_CBU_INFORMADA && cbu ? ` · CBU ${cbu}` : ''}
              </p>
            )}
            <p className="cifras">
              <b className="font-sans">Punto de venta:</b> {String(c.puntoVenta).padStart(5, '0')}{' '}
              <b className="ml-2 font-sans">Comp. Nro:</b> {String(c.numero).padStart(8, '0')}
            </p>
            <p>
              <b>Fecha de emisión:</b> {fechaCorta(c.fecha)}
            </p>
            <p className="cifras">
              <b className="font-sans">CUIT:</b> {formatearCuit(empresa.cuit)}
            </p>
            <p>
              <b>Ingresos Brutos:</b> {empresa.iibbNumero || '—'}
            </p>
            <p>
              <b>Inicio de actividades:</b> {empresa.inicioActividades ? fechaCorta(empresa.inicioActividades) : '—'}
            </p>
          </div>
        </header>

        {(c.concepto !== 1 || c.vencimiento) && (
          <section className={`flex flex-wrap gap-x-6 px-3 py-1.5 ${caja}`}>
            {c.concepto !== 1 && c.servicioDesde && c.servicioHasta && (
              <span>
                <b>Período facturado:</b> del {fechaCorta(c.servicioDesde)} al {fechaCorta(c.servicioHasta)}
              </span>
            )}
            {c.vencimiento && (
              <span>
                <b>Vencimiento del pago:</b> {fechaCorta(c.vencimiento)}
              </span>
            )}
          </section>
        )}

        <section className={`grid grid-cols-2 gap-x-6 gap-y-0.5 px-3 ${compacto ? 'py-1' : 'py-2'} ${caja}`}>
          <Dato etiqueta={c.receptorDocTipo === 80 ? 'CUIT' : c.receptorDocTipo === 99 ? 'Documento' : 'Doc.'}>
            <span className="cifras">
              {c.receptorDocTipo === 80
                ? formatearCuit(c.receptorDocNumero ?? '')
                : c.receptorDocTipo === 99
                  ? 'Consumidor final'
                  : c.receptorDocNumero}
            </span>
          </Dato>
          <Dato etiqueta="Apellido y nombre / Razón social">{c.receptorNombre}</Dato>
          <Dato etiqueta="Condición frente al IVA">{ivas.get(c.receptorCondicionIva ?? 5)}</Dato>
          <Dato etiqueta="Domicilio">{c.receptorDomicilio ?? '—'}</Dato>
          <Dato etiqueta="Condición de venta">{condicion?.nombre ?? 'Contado'}</Dato>
          <Dato etiqueta="Concepto">{CONCEPTO[c.concepto]}</Dato>
          {c.asociados.map((a) => (
            <Dato key={a.id} etiqueta="Comprobante asociado">
              <span className="cifras">
                {abreviatura(a.tipo)} {formatearNumero(a.puntoVenta, a.numero ?? 0)} del {fechaCorta(a.fecha)}
              </span>
            </Dato>
          ))}
          {c.moneda !== 'PES' && (
            <Dato etiqueta="Moneda">
              Dólares estadounidenses · tipo de cambio{' '}
              <span className="cifras">{Number(c.cotizacion).toLocaleString('es-AR')}</span>
            </Dato>
          )}
        </section>

        <table className="mt-3 w-full">
          <thead>
            <tr
              className={`text-left ${compacto ? `border-b ${borde}` : `border-y ${borde} bg-superficie-2`}`}
              style={moderno ? { backgroundColor: marca.color, color: '#fff', borderColor: marca.color } : undefined}
            >
              <th className="px-2 py-1 font-semibold">Descripción</th>
              <th className="px-2 py-1 text-right font-semibold">Cantidad</th>
              <th className="px-2 py-1 text-right font-semibold">
                Precio unit.{discrimina ? '' : letra === 'B' ? ' (con IVA)' : ''}
              </th>
              <th className="px-2 py-1 text-right font-semibold">% Bonif.</th>
              {discrimina && <th className="px-2 py-1 text-right font-semibold">IVA</th>}
              <th className="px-2 py-1 text-right font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {c.items.map((i) => (
              <tr key={i.id} className="break-inside-avoid border-b border-borde align-top">
                <td className="px-2 py-1">{i.descripcion}</td>
                <td className="cifras px-2 py-1 text-right">{cantidad(i.cantidad)}</td>
                <td className="cifras px-2 py-1 text-right">{formatearMonto(precioMostrado(i), '')}</td>
                <td className="cifras px-2 py-1 text-right">{Number(i.descuento) ? cantidad(i.descuento) : '0'}</td>
                {discrimina && <td className="cifras px-2 py-1 text-right">{TASAS_IVA[i.alicuotaIva].replace('.', ',')} %</td>}
                <td className="cifras px-2 py-1 text-right">{formatearMonto(subtotalMostrado(i), '')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {c.observaciones && <p className="mt-3 whitespace-pre-line">{c.observaciones}</p>}

        <section className="mt-4 flex break-inside-avoid justify-end">
          <dl
            className={`cifras grid min-w-72 grid-cols-[1fr_auto] gap-x-6 gap-y-0.5 px-3 py-2 ${compacto ? `border-t ${borde}` : `border ${borde}`} ${moderno ? 'rounded-lg border-2' : ''}`}
            style={conColor}
          >
            {discrimina ? (
              <>
                <dt className="font-sans">Importe neto gravado: {simbolo}</dt>
                <dd className="text-right">{formatearMonto(c.neto, '')}</dd>
                {c.detalleIva.map((a) => (
                  <Fila
                    key={a.id}
                    etiqueta={`IVA ${TASAS_IVA[a.alicuotaIva].replace('.', ',')} %: ${simbolo}`}
                    valor={a.importe}
                  />
                ))}
              </>
            ) : (
              <Fila etiqueta={`Subtotal: ${simbolo}`} valor={aImporte(new D(c.total).minus(c.tributos))} />
            )}
            {c.detalleTributos.map((t) => (
              <Fila
                key={t.id}
                etiqueta={`${t.descripcion} (${Number(t.alicuota).toLocaleString('es-AR')} %): ${simbolo}`}
                valor={t.importe}
              />
            ))}
            <dt className="mt-1 border-t border-texto pt-1 font-sans text-sm font-bold">Importe total: {simbolo}</dt>
            <dd className="mt-1 border-t border-texto pt-1 text-right text-sm font-bold">{formatearMonto(c.total, '')}</dd>
          </dl>
        </section>
        {letra === 'B' && (
          <p className="mt-2 border border-texto px-3 py-1.5 text-[10.5px]">
            <b>Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)</b> · IVA contenido: {simbolo}{' '}
            {formatearMonto(ivaContenido, '')} · Otros impuestos nacionales indirectos: {simbolo} 0,00
          </p>
        )}

        <footer className="mt-6 flex break-inside-avoid items-center gap-5 border-t border-texto pt-3">
          {qr && (
            <div aria-label="Código QR de ARCA" className="size-24 shrink-0 bg-white" dangerouslySetInnerHTML={{ __html: qr }} />
          )}
          <div className="flex flex-1 flex-col gap-0.5">
            <p className="text-sm font-bold">Comprobante autorizado</p>
            <p className="text-[10px] text-texto-2">
              Esta agencia no se responsabiliza por los datos ingresados en el detalle de la operación.
            </p>
          </div>
          <dl className="cifras grid grid-cols-[auto_auto] gap-x-3 text-right">
            <dt className="font-sans font-semibold">CAE N°:</dt>
            <dd>{c.cae ?? '—'}</dd>
            <dt className="font-sans font-semibold">Vencimiento del CAE:</dt>
            <dd>{c.caeVence ? fechaCorta(c.caeVence) : '—'}</dd>
          </dl>
        </footer>
      </article>
    </div>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <p>
      <b>{etiqueta}:</b> {children}
    </p>
  )
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <>
      <dt className="font-sans">{etiqueta}</dt>
      <dd className="text-right">{formatearMonto(valor, '')}</dd>
    </>
  )
}
