import { CircleCheck, CreditCard, Lock, Wallet } from 'lucide-react'
import type { Metadata } from 'next'

import { Aviso, Chip, Panel } from '@/components/ui'
import { verificarPago, verPago } from '@/modulos/cobros/cobros'

export const metadata: Metadata = { title: 'Pagar', robots: { index: false, follow: false } }

const pesos = (v: string | number) =>
  Number(v).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })

/**
 * Link de pago del ERP, sin usuario: el cliente ve qué paga y elige con qué.
 * Al volver de la pasarela (?vuelta=1) se confirma el estado en el momento.
 */
export default async function Pagar({ params, searchParams }: PageProps<'/pago/[clave]'>) {
  const { clave } = await params
  const { vuelta, error } = await searchParams
  let p = await verPago(clave).catch(() => null)
  if (p && vuelta && p.estado === 'pendiente' && p.proveedor) {
    await verificarPago(p.empresaId, p.id).catch((e) => console.error('[cobros] vuelta', e instanceof Error ? e.message : e))
    p = await verPago(clave).catch(() => null)
  }
  if (!p)
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 px-4 py-12">
        <Panel className="p-6 text-sm text-texto-2">Este link de pago no existe.</Panel>
      </main>
    )
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 px-4 py-12">
      <header className="text-center">
        <p className="text-sm text-texto-2">{p.empresa}</p>
        <h1 className="mt-1 text-xl font-semibold">{p.concepto}</h1>
        <p className="cifras mt-3 text-4xl font-bold tracking-tight">{pesos(p.importe)}</p>
        <p className="mt-1 text-sm text-texto-2">{p.cliente}</p>
      </header>

      {p.estado === 'aprobado' ? (
        <Panel className="flex flex-col items-center gap-2 p-6 text-center">
          <CircleCheck aria-hidden className="size-10 text-ok" />
          <p className="font-semibold">¡Listo! El pago está acreditado.</p>
          <p className="text-sm text-texto-2">{p.empresa} ya lo tiene registrado. Podés cerrar esta página.</p>
        </Panel>
      ) : p.estado === 'pendiente' ? (
        <>
          {typeof error === 'string' && <Aviso>{error}</Aviso>}
          {vuelta && p.proveedor && (
            <Aviso tono="info">
              Todavía no vemos el pago acreditado. Si lo hiciste, puede tardar unos minutos: esta página se actualiza cuando lo
              confirmen.
            </Aviso>
          )}
          {p.opciones.length ? (
            <Panel className="flex flex-col gap-2 p-4">
              <p className="mb-1 text-sm font-medium">¿Cómo querés pagar?</p>
              {p.opciones.map((o) => (
                <form key={o.proveedor} method="post" action={`/pago/${clave}/ir`}>
                  <input type="hidden" name="proveedor" value={o.proveedor} />
                  <button
                    type="submit"
                    className="tarjeta flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium transition hover:border-acento hover:text-acento"
                  >
                    {o.proveedor === 'mercadopago' ? (
                      <Wallet aria-hidden className="size-5 shrink-0" />
                    ) : (
                      <CreditCard aria-hidden className="size-5 shrink-0" />
                    )}
                    {o.nombre}
                  </button>
                </form>
              ))}
            </Panel>
          ) : (
            <Panel className="p-4 text-sm text-texto-2">
              Por ahora no hay medios de pago disponibles. Consultá a {p.empresa}.
            </Panel>
          )}
          <p className="flex items-center justify-center gap-1.5 text-xs text-texto-3">
            <Lock aria-hidden className="size-3.5" /> Pagás en el sitio seguro de cada medio. Nadie acá ve los datos de tu
            tarjeta.
          </p>
        </>
      ) : (
        <Panel className="flex flex-col items-center gap-2 p-6 text-center">
          <Chip tono="neutro">{p.estado === 'vencido' ? 'Vencido' : p.estado === 'cancelado' ? 'Anulado' : 'No disponible'}</Chip>
          <p className="text-sm text-texto-2">Este link ya no está disponible. Pedile uno nuevo a {p.empresa}.</p>
        </Panel>
      )}
    </main>
  )
}
