import { Settings } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { asc, eq } from 'drizzle-orm'

import { Aviso, BotonEnlace, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { terceros } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta, hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { hayPasarelas, listarPagos, urlPago } from '@/modulos/cobros/cobros'
import { PROVEEDORES, type Proveedor } from '@/modulos/cobros/pasarelas'
import { formatearNumero } from '@/modulos/comercial/formato'
import { pendientes, saldosPorCliente } from '@/modulos/facturacion/cuentas'
import { abreviatura } from '@/modulos/facturacion/tipos'

import { cancelarPagoAccion } from './acciones'
import { Compartir, NuevoLink } from './Piezas'

export const metadata: Metadata = { title: 'Links de pago' }

const ESTADOS = {
  pendiente: { tono: 'info', texto: 'Pendiente' },
  aprobado: { tono: 'ok', texto: 'Pagado' },
  rechazado: { tono: 'error', texto: 'Rechazado' },
  cancelado: { tono: 'neutro', texto: 'Anulado' },
  vencido: { tono: 'neutro', texto: 'Vencido' },
} as const

const FILTROS = ['pendiente', 'aprobado', 'todos'] as const

export default async function LinksDePago({ searchParams }: PageProps<'/cobros-online'>) {
  const sesion = await requerirEmpresa()
  const { estado, nuevo } = await searchParams
  const filtro = FILTROS.find((f) => f === estado) ?? 'pendiente'
  const cobrar = tienePermiso(sesion.permisos, 'ventas.cobrar')
  const [pagos, conPasarelas, clientes, todos] = await enLaEmpresa(
    'ventas.ver',
    async (tx) =>
      [
        await listarPagos(tx, { estado: filtro }),
        await hayPasarelas(tx),
        cobrar ? await saldosPorCliente(tx) : [],
        cobrar
          ? await tx
              .select({ id: terceros.id, razonSocial: terceros.razonSocial })
              .from(terceros)
              .where(eq(terceros.esCliente, true))
              .orderBy(asc(terceros.razonSocial))
              .limit(500)
          : [],
      ] as const,
  )
  const deuda = cobrar ? await enLaEmpresa('ventas.ver', (tx) => pendientes(tx, {})) : []
  const hoy = hoyArgentina()
  const deudores = clientes.filter((c) => Number(c.saldo) > 0)
  const conDeuda = [
    ...deudores,
    ...todos.filter((t) => !deudores.some((d) => d.id === t.id)).map((t) => ({ ...t, saldo: '0' })),
  ].map((c) => ({
    id: c.id,
    razonSocial: c.razonSocial,
    saldo: c.saldo,
    pendientes: deuda
      .filter((d) => d.terceroId === c.id)
      .map((d) => ({
        id: d.id,
        nombre: `${abreviatura(d.tipo)} ${formatearNumero(d.puntoVenta, d.numero ?? 0)} · ${fechaCorta(d.fecha)}`,
        saldo: d.saldo,
        vencida: Boolean(d.vencimiento && d.vencimiento < hoy),
      })),
  }))
  return (
    <>
      <EncabezadoPagina
        titulo="Links de pago"
        bajada="Mandale a tu cliente un link: elige con qué pagar y, cuando se acredita, el recibo se hace solo."
        acciones={
          tienePermiso(sesion.permisos, 'ventas.pasarelas') && (
            <BotonEnlace href="/cobros-online/configuracion">
              <Settings aria-hidden /> Medios de pago
            </BotonEnlace>
          )
        }
      />
      {!conPasarelas && (
        <div className="mb-4">
          <Aviso tono="info">
            Para cobrar online, conectá al menos un medio (Mercado Pago, Payway, GoCuotas o Clover) en{' '}
            <Link href="/cobros-online/configuracion" className="font-medium underline">
              Medios de pago
            </Link>
            .
          </Aviso>
        </div>
      )}
      {typeof nuevo === 'string' && (
        <div className="mb-4">
          <Aviso tono="ok">Listo: el link está creado. Copialo o mandalo desde la lista.</Aviso>
        </div>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <nav aria-label="Filtrar" className="mb-3 flex gap-1.5">
            {FILTROS.map((f) => (
              <Link
                key={f}
                href={`/cobros-online?estado=${f}`}
                aria-current={filtro === f ? 'page' : undefined}
                className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium ${
                  filtro === f ? 'border-acento bg-acento-suave text-acento' : 'border-borde text-texto-2 hover:bg-superficie-2'
                }`}
              >
                {f === 'pendiente' ? 'Pendientes' : f === 'aprobado' ? 'Pagados' : 'Todos'}
              </Link>
            ))}
          </nav>
          <Panel className="divide-y divide-borde">
            {!pagos.length && (
              <p className="px-4 py-10 text-center text-sm text-texto-2">
                No hay links {filtro === 'todos' ? 'todavía' : 'con este estado'}.
              </p>
            )}
            {pagos.map((p) => {
              const e = ESTADOS[p.estado as keyof typeof ESTADOS]
              return (
                <div key={p.id} className={`flex flex-col gap-2 px-4 py-3 ${p.id === nuevo ? 'bg-acento-suave/50' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{p.cliente}</p>
                      <p className="text-xs text-texto-2">
                        {p.concepto} · creado {fechaCorta(p.creado.toISOString().slice(0, 10))}
                        {p.proveedor && ` · ${PROVEEDORES[p.proveedor as Proveedor]?.nombre ?? p.proveedor}`}
                        {p.origen !== 'erp' && ` · desde ${p.origen === 'portal' ? 'el portal' : 'WhatsApp'}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="cifras font-semibold">{formatearMonto(p.importe, '$')}</span>
                      <Chip tono={e.tono}>{e.texto}</Chip>
                    </div>
                  </div>
                  {p.estado === 'pendiente' && cobrar && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Compartir
                        id={p.id}
                        url={urlPago(p.clave)}
                        texto={`Hola, te paso el link para pagar ${p.concepto} (${formatearMonto(p.importe, '$')}):`}
                        telefono={p.telefono}
                      />
                      <form action={cancelarPagoAccion.bind(null, p.id)}>
                        <button type="submit" className="text-xs text-texto-3 hover:text-error">
                          Anular link
                        </button>
                      </form>
                    </div>
                  )}
                  {p.estado === 'aprobado' &&
                    (p.reciboId ? (
                      <Link href={`/cobranzas/${p.reciboId}`} className="text-xs text-acento hover:underline">
                        Recibo N.º {p.reciboNumero}
                      </Link>
                    ) : (
                      <p className="text-xs text-aviso">
                        Pagado, pero el recibo no se pudo hacer solo{p.detalle?.error ? `: ${String(p.detalle.error)}` : ''}.
                        Cargalo en Cobranzas.
                      </p>
                    ))}
                </div>
              )
            })}
          </Panel>
        </div>
        {cobrar && conPasarelas && (
          <Panel className="p-4">
            <h2 className="mb-3 font-semibold">Nuevo link de pago</h2>
            <NuevoLink clientes={conDeuda} />
          </Panel>
        )}
      </div>
    </>
  )
}
