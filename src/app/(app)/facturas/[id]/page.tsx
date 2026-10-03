import { ChevronLeft, FileMinus, FilePlus, Pencil, Printer, Send, Trash2, Link2, MessageCircle, Wallet } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'

import { ChipEstado, VistaDocumento } from '@/components/comercial/VistaDocumento'
import { Aviso, Boton, BotonEnlace, EncabezadoPagina, Panel } from '@/components/ui'

import { linkDeFacturaAccion } from '../../cobros-online/acciones'
import { mandarFacturaAccion } from '../../whatsapp/acciones'
import { arcaConfiguracion, whatsappCuentas } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearCuit } from '@/lib/cuit'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { formatearNumero } from '@/modulos/comercial/numeracion'
import { obtenerComprobante } from '@/modulos/facturacion/comprobantes'
import { pendientes } from '@/modulos/facturacion/cuentas'
import { abreviatura, nombreComprobante, urlQr } from '@/modulos/facturacion/tipos'

import { eliminarBorradorAccion, emitirAccion, verificarAccion } from '../../facturacion/acciones'

export const metadata: Metadata = { title: 'Comprobante' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }
type Mensaje = { codigo: string; mensaje: string } | string

export default async function Comprobante({ params, searchParams }: PageProps<'/facturas/[id]'>) {
  const { id } = await params
  const { guardado, emitido, error, avisos, whatsapp } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const sesion = await requerirEmpresa()
  const datos = await enLaEmpresa('ventas.ver', async (tx) => {
    const c = await obtenerComprobante(tx, id)
    if (!c) return null
    const [config] = await tx.select({ ambiente: arcaConfiguracion.ambiente }).from(arcaConfiguracion)
    const [deuda] = c.estado === 'autorizado' && c.clase !== 'nota_credito' ? await pendientes(tx, { ids: [id] }) : []
    const [wa] = await tx.select({ activa: whatsappCuentas.activa }).from(whatsappCuentas)
    return { c, ambiente: config?.ambiente ?? null, deuda, conWhatsapp: Boolean(wa?.activa) }
  })
  if (!datos) notFound()
  const { c, ambiente, deuda } = datos
  const conWhatsapp = datos.conWhatsapp && tienePermiso(sesion.permisos, 'whatsapp.atender')
  const simbolo = SIMBOLO[c.moneda] ?? c.moneda
  const puedeFacturar = tienePermiso(sesion.permisos, 'ventas.facturar')
  const numero = c.numero ? formatearNumero(c.puntoVenta, c.numero) : null
  const respuesta = (c.respuestaArca ?? {}) as { errores?: Mensaje[]; observaciones?: Mensaje[] }
  const texto = (m: Mensaje) => (typeof m === 'string' ? m : `${m.mensaje} (${m.codigo})`)
  const qr =
    c.estado === 'autorizado' && c.cae && c.numero
      ? await QRCode.toString(
          urlQr({
            fecha: c.fecha,
            cuit: sesion.empresa.cuit,
            puntoVenta: c.puntoVenta,
            tipo: c.tipo,
            numero: c.numero,
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

  return (
    <>
      <Link href="/facturas" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Facturas
      </Link>
      <EncabezadoPagina
        titulo={`${nombreComprobante(c.tipo)} ${numero ?? '(borrador)'}`}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            <ChipEstado estado={c.estado} />
            <span>
              <Link href={`/terceros/${c.terceroId}`} className="hover:text-acento">
                {c.receptorNombre ?? c.cliente?.razonSocial}
              </Link>{' '}
              · {fechaCorta(c.fecha)}
              {c.origen === 'pymexis' && ' · migrado de PYMEXIS'}
            </span>
          </span>
        }
        acciones={
          <>
            {c.estado === 'autorizado' && c.origen === 'erp' && (
              <BotonEnlace href={`/imprimir/factura/${c.id}`} target="_blank">
                <Printer aria-hidden className="size-4" /> Imprimir
              </BotonEnlace>
            )}
            {c.estado === 'autorizado' && c.origen === 'erp' && conWhatsapp && (
              <form action={mandarFacturaAccion.bind(null, c.id)}>
                <Boton type="submit">
                  <MessageCircle aria-hidden className="size-4" /> WhatsApp
                </Boton>
              </form>
            )}
            {puedeFacturar && c.estado === 'borrador' && (
              <BotonEnlace href={`/facturas/${c.id}/editar`}>
                <Pencil aria-hidden className="size-4" /> Modificar
              </BotonEnlace>
            )}
            {puedeFacturar && c.estado === 'borrador' && (
              <form action={emitirAccion.bind(null, c.id)}>
                <Boton type="submit" variante="primario" disabled={!ambiente}>
                  <Send aria-hidden className="size-4" /> Autorizar en ARCA{ambiente === 'homologacion' ? ' (prueba)' : ''}
                </Boton>
              </form>
            )}
            {puedeFacturar && c.estado === 'pendiente_verificacion' && (
              <form action={verificarAccion.bind(null, c.id)}>
                <Boton type="submit" variante="primario">
                  Verificar en ARCA
                </Boton>
              </form>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-2 empty:hidden">
        {guardado && <Aviso tono="ok">Borrador grabado. Revisalo y autorizalo en ARCA.</Aviso>}
        {emitido && (
          <Aviso tono="ok">
            ARCA autorizó el comprobante {numero} con CAE {c.cae}.
          </Aviso>
        )}
        {typeof avisos === 'string' && <Aviso tono="aviso">Observaciones de ARCA: {avisos}</Aviso>}
        {typeof error === 'string' && <Aviso>{error}</Aviso>}
        {whatsapp && <Aviso tono="ok">Enviada por WhatsApp. La conversación queda en WhatsApp.</Aviso>}
        {!ambiente && c.estado === 'borrador' && (
          <Aviso tono="aviso">
            Para autorizar comprobantes falta cargar el certificado de ARCA en{' '}
            <Link href="/configuracion/arca" className="underline">
              Configuración → ARCA
            </Link>
            .
          </Aviso>
        )}
        {c.estado === 'pendiente_verificacion' && (
          <Aviso tono="aviso">
            Se pidió el CAE con el número {numero} pero no llegó la respuesta. Verificá en ARCA antes de hacer cualquier otra
            cosa: si lo autorizó, toma ese CAE; si no, vuelve a borrador.
          </Aviso>
        )}
        {c.estado === 'borrador' && respuesta.errores?.length ? (
          <Aviso>
            Último intento rechazado: {[...respuesta.errores, ...(respuesta.observaciones ?? [])].map(texto).join(' · ')}
          </Aviso>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <Panel>
            <VistaDocumento moneda={c.moneda} items={c.items} />
            {c.detalleTributos.length > 0 && (
              <dl className="cifras ml-auto flex max-w-xs flex-col gap-1 border-t border-borde px-3 py-3 text-sm">
                {c.detalleTributos.map((t) => (
                  <div key={t.id} className="flex justify-between text-texto-2">
                    <dt className="font-sans">
                      {t.descripcion} ({Number(t.alicuota).toLocaleString('es-AR')} %)
                    </dt>
                    <dd>{formatearMonto(t.importe, simbolo)}</dd>
                  </div>
                ))}
                <div className="mt-1 flex justify-between border-t border-borde pt-2 text-base font-medium text-texto">
                  <dt className="font-sans">Total con percepciones</dt>
                  <dd>{formatearMonto(c.total, simbolo)}</dd>
                </div>
              </dl>
            )}
            {c.observaciones && (
              <p className="border-t border-borde px-3 py-3 text-sm whitespace-pre-line text-texto-2">{c.observaciones}</p>
            )}
          </Panel>
        </div>

        <aside className="flex flex-col gap-4">
          <Panel className="flex flex-col gap-2 p-4 text-sm">
            <h2 className="font-semibold">Receptor</h2>
            <p>{c.receptorNombre}</p>
            <p className="cifras text-texto-2">
              {c.receptorDocTipo === 80
                ? `CUIT ${formatearCuit(c.receptorDocNumero ?? '')}`
                : c.receptorDocTipo === 99
                  ? 'Consumidor final'
                  : `Doc. ${c.receptorDocNumero}`}
            </p>
            {c.receptorDomicilio && <p className="text-texto-2">{c.receptorDomicilio}</p>}
            {c.concepto !== 1 && c.servicioDesde && c.servicioHasta && (
              <p className="text-texto-2">
                Servicio del {fechaCorta(c.servicioDesde)} al {fechaCorta(c.servicioHasta)}
              </p>
            )}
            {c.vencimiento && <p className="text-texto-2">Vence el {fechaCorta(c.vencimiento)}</p>}
            {c.moneda !== 'PES' && <p className="text-texto-2">Dólar {Number(c.cotizacion).toLocaleString('es-AR')}</p>}
          </Panel>

          {c.estado === 'autorizado' && (
            <Panel className="flex flex-col gap-3 p-4 text-sm">
              <h2 className="font-semibold">ARCA</h2>
              {c.cae ? (
                <dl className="cifras grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="font-sans text-texto-2">CAE</dt>
                  <dd>{c.cae}</dd>
                  <dt className="font-sans text-texto-2">Vence</dt>
                  <dd>{c.caeVence ? fechaCorta(c.caeVence) : '—'}</dd>
                </dl>
              ) : (
                <p className="text-texto-2">Comprobante migrado sin CAE en el sistema nuevo.</p>
              )}
              {qr && (
                <div
                  aria-label="Código QR de ARCA"
                  className="size-28 self-start bg-white p-1"
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
              )}
            </Panel>
          )}

          {deuda && (
            <Panel className="flex flex-col gap-2 p-4 text-sm">
              <h2 className="font-semibold">Cuenta corriente</h2>
              <p>
                Saldo pendiente: <span className="cifras font-medium">{formatearMonto(deuda.saldo, '$')}</span>
              </p>
              {Number(deuda.saldo) > 0 && tienePermiso(sesion.permisos, 'ventas.cobrar') && (
                <>
                  <BotonEnlace href={`/cobranzas/nueva?cliente=${c.terceroId}`} className="justify-center">
                    <Wallet aria-hidden className="size-4" /> Cobrar
                  </BotonEnlace>
                  <form action={linkDeFacturaAccion.bind(null, c.terceroId, c.id)}>
                    <Boton type="submit" variante="fantasma" className="w-full justify-center">
                      <Link2 aria-hidden className="size-4" /> Link de pago
                    </Boton>
                  </form>
                </>
              )}
            </Panel>
          )}

          {(c.asociados.length > 0 || c.notas.length > 0) && (
            <Panel className="flex flex-col gap-2 p-4 text-sm">
              <h2 className="font-semibold">Relacionados</h2>
              {c.asociados.map((a) => (
                <Link key={a.id} href={`/facturas/${a.id}`} className="cifras text-acento hover:underline">
                  Corrige {abreviatura(a.tipo)} {formatearNumero(a.puntoVenta, a.numero ?? 0)}
                </Link>
              ))}
              {c.notas.map((n) => (
                <Link key={n.id} href={`/facturas/${n.id}`} className="cifras text-acento hover:underline">
                  {abreviatura(n.tipo)} {n.numero ? formatearNumero(n.puntoVenta, n.numero) : '(borrador)'}
                </Link>
              ))}
            </Panel>
          )}

          {puedeFacturar && c.estado === 'autorizado' && c.clase !== 'nota_credito' && (
            <div className="flex flex-col gap-2">
              <BotonEnlace href={`/facturas/nueva?clase=nota_credito&asociado=${c.id}`} className="justify-center">
                <FileMinus aria-hidden className="size-4" /> Nota de crédito
              </BotonEnlace>
              <BotonEnlace
                href={`/facturas/nueva?clase=nota_debito&asociado=${c.id}`}
                variante="fantasma"
                className="justify-center"
              >
                <FilePlus aria-hidden className="size-4" /> Nota de débito
              </BotonEnlace>
            </div>
          )}
          {puedeFacturar && c.estado === 'borrador' && (
            <form action={eliminarBorradorAccion.bind(null, c.id)}>
              <Boton type="submit" variante="fantasma" className="w-full">
                <Trash2 aria-hidden className="size-4" /> Eliminar el borrador
              </Boton>
            </form>
          )}
        </aside>
      </div>
    </>
  )
}
