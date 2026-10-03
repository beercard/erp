import { MessageCircle, Upload } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, Boton, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { formatearMonto } from '@/lib/dinero'
import { listarRecibidas } from '@/modulos/compras/recibidas'
import { iaConfigurada } from '@/modulos/ia/claude'

export const metadata: Metadata = { title: 'Facturas recibidas' }

const ESTADOS = {
  leyendo: { tono: 'info', texto: 'Leyendo' },
  lista: { tono: 'aviso', texto: 'Para revisar' },
  registrada: { tono: 'ok', texto: 'Registrada' },
  descartada: { tono: 'neutro', texto: 'Descartada' },
  error: { tono: 'error', texto: 'Completar a mano' },
} as const

const FILTROS = [
  ['pendientes', 'Para revisar'],
  ['registrada', 'Registradas'],
  ['todas', 'Todas'],
] as const

export default async function FacturasRecibidas({ searchParams }: PageProps<'/compras/recibidas'>) {
  await exigirPermiso('compras.ver')
  const { ver, error } = await searchParams
  const filtro = FILTROS.find(([v]) => v === ver)?.[0] ?? 'pendientes'
  const todas = await enLaEmpresa('compras.ver', (tx) => listarRecibidas(tx, filtro === 'pendientes' ? 'todas' : filtro))
  const filas = filtro === 'pendientes' ? todas.filter((r) => ['lista', 'error', 'leyendo'].includes(r.estado)) : todas
  return (
    <>
      <EncabezadoPagina
        titulo="Facturas recibidas"
        bajada="Facturas de proveedores que llegaron por WhatsApp o que subiste: se leen solas y las registrás después de revisarlas."
      />
      {typeof error === 'string' && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}
      {!iaConfigurada() && (
        <div className="mb-4">
          <Aviso tono="info">
            La lectura automática no está activada en este servidor: las facturas quedan guardadas para completarlas a mano.
          </Aviso>
        </div>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <nav aria-label="Filtrar" className="mb-3 flex gap-1.5">
            {FILTROS.map(([v, t]) => (
              <Link
                key={v}
                href={`/compras/recibidas?ver=${v}`}
                aria-current={filtro === v ? 'page' : undefined}
                className="inline-flex h-8 items-center rounded-full border border-borde px-3 text-[13px] font-medium text-texto-2 aria-[current=page]:border-acento aria-[current=page]:bg-acento-suave aria-[current=page]:text-acento"
              >
                {t}
              </Link>
            ))}
          </nav>
          <Panel className="divide-y divide-borde">
            {!filas.length && (
              <p className="px-4 py-10 text-center text-sm text-texto-2">
                No hay facturas {filtro === 'pendientes' ? 'para revisar' : 'acá'}.
              </p>
            )}
            {filas.map((r) => {
              const d = (r.datos ?? {}) as {
                razonSocialEmisor?: string
                letra?: string
                puntoVenta?: number
                numero?: number
                total?: number
                avisos?: string[]
              }
              const e = ESTADOS[r.estado as keyof typeof ESTADOS]
              return (
                <Link
                  key={r.id}
                  href={r.compraId ? `/compras/${r.compraId}` : `/compras/recibidas/${r.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-superficie-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{d.razonSocialEmisor ?? 'Sin leer'}</span>
                    <span className="block text-xs text-texto-2">
                      {d.letra
                        ? `${d.letra} ${String(d.puntoVenta ?? '').padStart(5, '0')}-${String(d.numero ?? '').padStart(8, '0')} · `
                        : ''}
                      {r.creado.toLocaleString('es-AR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'America/Argentina/Buenos_Aires',
                      })}
                      {r.usuario && ` · ${r.usuario}`}
                    </span>
                  </span>
                  {d.avisos?.length ? <Chip tono="aviso">{d.avisos.length} para revisar</Chip> : null}
                  {d.total != null && <span className="cifras font-semibold">{formatearMonto(String(d.total), '$')}</span>}
                  <Chip tono={e.tono}>{e.texto}</Chip>
                </Link>
              )
            })}
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel className="flex flex-col gap-3 p-4">
            <h2 className="font-semibold">Subir una factura</h2>
            <form method="post" action="/compras/recibidas/subir" encType="multipart/form-data" className="flex flex-col gap-2">
              <input
                name="archivo"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp,application/pdf"
                aria-label="Foto o PDF de la factura"
                className="text-sm"
              />
              <Boton type="submit" variante="primario">
                <Upload aria-hidden /> Subir y leer
              </Boton>
            </form>
          </Panel>
          <Panel className="flex flex-col gap-2 p-4 text-sm text-texto-2">
            <p className="flex items-center gap-2 font-semibold text-texto">
              <MessageCircle aria-hidden className="size-4 text-ok" /> Por WhatsApp
            </p>
            <p>
              Las personas autorizadas en{' '}
              <Link href="/whatsapp/configuracion" className="text-acento hover:underline">
                WhatsApp → Configuración
              </Link>{' '}
              mandan la foto o el PDF al número de la empresa y les contesta con lo que leyó y el enlace para revisarla.
            </p>
          </Panel>
        </div>
      </div>
    </>
  )
}
