import { ChevronLeft, Wallet } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { VistaDocumento } from '@/components/comercial/VistaDocumento'
import { Aviso, BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { provincias } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearCuit } from '@/lib/cuit'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { TASAS_IVA } from '@/modulos/comercial/calculo'
import { formatearNumero } from '@/modulos/comercial/formato'
import { obtenerCompra, TIPOS_TRIBUTO } from '@/modulos/compras/compras'
import { abreviaturaCompra, datosTipoCompra } from '@/modulos/compras/tipos'

import { anularCompraAccion } from '../acciones'

export const metadata: Metadata = { title: 'Comprobante de compra' }

const SIMBOLO: Record<string, string> = { PES: '$', DOL: 'US$' }
const CLASE = { factura: 'Factura', nota_debito: 'Nota de débito', nota_credito: 'Nota de crédito' } as const

export default async function Compra({ params, searchParams }: PageProps<'/compras/[id]'>) {
  const { id } = await params
  const { guardado, error } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const sesion = await requerirEmpresa()
  const datos = await enLaEmpresa('compras.ver', async (tx) => {
    const c = await obtenerCompra(tx, id)
    if (!c) return null
    const provs = await tx.select().from(provincias)
    return { c, provincia: new Map(provs.map((p) => [p.codigo, p.nombre])) }
  })
  if (!datos) notFound()
  const { c } = datos
  const simbolo = SIMBOLO[c.moneda] ?? c.moneda
  const tipo = datosTipoCompra(c.tipo)
  const titulo = `${CLASE[c.clase as keyof typeof CLASE]}${tipo?.fce ? ' de crédito MiPyME' : ''} ${c.letra} ${formatearNumero(c.puntoVenta, c.numero)}`
  const vigentes = c.aplicaciones.filter((a) => a.pagoEstado === 'emitido' || a.ncEstado === 'registrado')
  const puedeCargar = tienePermiso(sesion.permisos, 'compras.cargar')

  return (
    <>
      <Link href="/compras" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Compras
      </Link>
      <EncabezadoPagina
        titulo={titulo}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            {c.estado === 'anulado' ? <Chip tono="error">Anulado</Chip> : <Chip tono="ok">Registrado</Chip>}
            <span>
              <Link href={`/terceros/${c.terceroId}`} className="hover:text-acento">
                {c.proveedor?.razonSocial}
              </Link>{' '}
              · {fechaCorta(c.fecha)} · IVA {c.periodoIva}
              {c.origen === 'mis_comprobantes' && ' · cargado desde Mis Comprobantes'}
              {c.origen === 'pymexis' && ' · migrado de PYMEXIS'}
            </span>
          </span>
        }
        acciones={
          c.estado === 'registrado' &&
          c.clase !== 'nota_credito' &&
          Number(c.saldo) > 0 &&
          tienePermiso(sesion.permisos, 'compras.pagar') && (
            <BotonEnlace href={`/pagos/nuevo?proveedor=${c.terceroId}`} variante="primario">
              <Wallet aria-hidden className="size-4" /> Pagar
            </BotonEnlace>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 empty:hidden">
        {guardado && <Aviso tono="ok">Comprobante registrado.</Aviso>}
        {typeof error === 'string' && <Aviso>{error}</Aviso>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <Panel>
            {c.items.length > 0 ? (
              <VistaDocumento moneda={c.moneda} items={c.items} />
            ) : (
              <p className="px-4 py-3 text-sm text-texto-2">Sin artículos (gasto o servicio).</p>
            )}
            <dl className="cifras ml-auto flex max-w-sm flex-col gap-1 border-t border-borde px-4 py-3 text-sm">
              <div className="flex justify-between">
                <dt className="font-sans text-texto-2">Neto gravado</dt>
                <dd>{formatearMonto(c.neto, simbolo)}</dd>
              </div>
              {c.detalleIva.map((i) => (
                <div key={i.id} className="flex justify-between text-texto-2">
                  <dt className="font-sans">
                    IVA {TASAS_IVA[i.alicuotaIva].replace('.', ',')} % s/ {formatearMonto(i.base, simbolo)}
                  </dt>
                  <dd>{formatearMonto(i.importe, simbolo)}</dd>
                </div>
              ))}
              {Number(c.noGravado) > 0 && (
                <div className="flex justify-between text-texto-2">
                  <dt className="font-sans">No gravado</dt>
                  <dd>{formatearMonto(c.noGravado, simbolo)}</dd>
                </div>
              )}
              {Number(c.exento) > 0 && (
                <div className="flex justify-between text-texto-2">
                  <dt className="font-sans">Exento</dt>
                  <dd>{formatearMonto(c.exento, simbolo)}</dd>
                </div>
              )}
              {c.detalleTributos.map((t) => (
                <div key={t.id} className="flex justify-between text-texto-2">
                  <dt className="font-sans">
                    {TIPOS_TRIBUTO[t.tipo as keyof typeof TIPOS_TRIBUTO] ?? t.tipo}
                    {t.provincia && ` ${datos.provincia.get(t.provincia) ?? t.provincia}`}
                  </dt>
                  <dd>{formatearMonto(t.importe, simbolo)}</dd>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-borde pt-2 text-base font-medium">
                <dt className="font-sans">Total</dt>
                <dd>{formatearMonto(c.total, simbolo)}</dd>
              </div>
            </dl>
            {c.observaciones && (
              <p className="border-t border-borde px-4 py-3 text-sm whitespace-pre-line text-texto-2">{c.observaciones}</p>
            )}
          </Panel>

          {c.aplicaciones.length > 0 && (
            <Panel>
              <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">
                {c.clase === 'nota_credito' ? 'Aplicada a' : 'Pagos y notas de crédito'}
              </h2>
              <ul className="divide-y divide-borde text-sm">
                {c.aplicaciones.map((a) => {
                  const vigente = a.pagoEstado === 'emitido' || a.ncEstado === 'registrado'
                  return (
                    <li
                      key={a.id}
                      className={`flex items-center justify-between gap-3 px-4 py-2 ${vigente ? '' : 'text-texto-3 line-through'}`}
                    >
                      {a.notaCreditoId === c.id ? (
                        <Link href={`/compras/${a.compraId}`} className="cifras hover:text-acento">
                          {abreviaturaCompra(a.fTipo)} {formatearNumero(a.fPuntoVenta, a.fNumero)}
                        </Link>
                      ) : a.pagoId ? (
                        <Link href={`/pagos/${a.pagoId}`} className="cifras hover:text-acento">
                          Orden de pago {String(a.pagoNumero).padStart(6, '0')}
                        </Link>
                      ) : (
                        <Link href={`/compras/${a.notaCreditoId}`} className="cifras hover:text-acento">
                          {abreviaturaCompra(a.ncTipo ?? 3)} {formatearNumero(a.ncPuntoVenta ?? 0, a.ncNumero ?? 0)}
                        </Link>
                      )}
                      <span className="text-texto-2">{fechaCorta(a.fecha)}</span>
                      <span className="cifras">{formatearMonto(a.importe, simbolo)}</span>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Panel className="flex flex-col gap-2 p-4 text-sm">
            <h2 className="font-semibold">Proveedor</h2>
            <p>{c.proveedor?.razonSocial}</p>
            {c.proveedor?.numeroDocumento && (
              <p className="cifras text-texto-2">CUIT {formatearCuit(c.proveedor.numeroDocumento)}</p>
            )}
            {c.cae && <p className="cifras text-texto-2">CAE {c.cae}</p>}
            {c.vencimiento && <p className="text-texto-2">Vence el {fechaCorta(c.vencimiento)}</p>}
            {c.moneda !== 'PES' && <p className="text-texto-2">Dólar {Number(c.cotizacion).toLocaleString('es-AR')}</p>}
          </Panel>
          {c.estado === 'registrado' && (
            <Panel className="flex flex-col gap-2 p-4 text-sm">
              <h2 className="font-semibold">{c.clase === 'nota_credito' ? 'Sin aplicar' : 'Saldo a pagar'}</h2>
              <p className="cifras text-lg font-medium">{formatearMonto(c.saldo, simbolo)}</p>
              <BotonEnlace href={`/terceros/${c.terceroId}/proveedor`} className="justify-center">
                Ver la cuenta del proveedor
              </BotonEnlace>
            </Panel>
          )}
          {c.estado === 'registrado' && puedeCargar && (
            <form action={anularCompraAccion.bind(null, c.id)}>
              <BotonConfirmar
                variante="fantasma"
                className="w-full"
                pregunta={`¿Anular ${titulo}? ${c.items.length ? 'La mercadería sale del stock. ' : ''}Después se puede volver a cargar.`}
                disabled={c.clase !== 'nota_credito' && vigentes.length > 0}
              >
                Anular el comprobante
              </BotonConfirmar>
              {c.clase !== 'nota_credito' && vigentes.length > 0 && (
                <p className="mt-1 text-xs text-texto-3">Tiene pagos o notas aplicados: anulá primero el pago.</p>
              )}
            </form>
          )}
        </aside>
      </div>
    </>
  )
}
