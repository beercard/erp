import { FileSpreadsheet } from 'lucide-react'
import type { Metadata } from 'next'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { informeGestion } from '@/modulos/informes/gestion'

import { pesos } from '../impuestos/periodo'

export const metadata: Metadata = { title: 'Informes de gestión' }

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const compacto = (n: number) => n.toLocaleString('es-AR', { notation: 'compact', maximumFractionDigits: 1 })
const mesCorto = (mes: string) =>
  new Date(`${mes}-15T12:00:00Z`).toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' }).replace('.', '')

/** Rango por defecto: el mes en curso. */
function rango(q: { desde?: string; hasta?: string }) {
  const hoy = hoyArgentina()
  const hasta = q.hasta && FECHA.test(q.hasta) ? q.hasta : hoy
  const desde = q.desde && FECHA.test(q.desde) && q.desde <= hasta ? q.desde : `${hasta.slice(0, 7)}-01`
  return { desde, hasta }
}

function Barras({ filas, total }: { filas: { nombre: string; neto: number; detalle?: string }[]; total: number }) {
  if (!filas.length) return <p className="px-4 py-3 text-sm text-texto-2">Sin movimientos en el rango.</p>
  const max = Math.max(...filas.map((f) => f.neto), 1)
  return (
    <ol className="divide-y divide-borde text-sm">
      {filas.map((f, i) => (
        <li key={`${f.nombre}${i}`} className="px-4 py-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">
              <span className="cifras mr-2 text-xs text-texto-3">{i + 1}</span>
              {f.nombre}
              {f.detalle && <span className="ml-1 text-xs text-texto-3">{f.detalle}</span>}
            </span>
            <span className="cifras shrink-0">
              {pesos(f.neto)}
              {total > 0 && <span className="ml-2 text-xs text-texto-3">{Math.round((f.neto / total) * 1000) / 10} %</span>}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-superficie-2">
            <div className="h-1.5 rounded-full bg-acento" style={{ width: `${Math.max(0, (f.neto / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

export default async function Informes({ searchParams }: PageProps<'/informes'>) {
  const sesion = await exigirPermiso('informes.ver')
  const r = rango((await searchParams) as { desde?: string; hasta?: string })
  const d = await conEmpresa(sesion.empresa.id, (tx) => informeGestion(tx, r))
  const maxMes = Math.max(...d.meses.map((m) => m.neto), 1)
  const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm'
  const tiles = [
    { titulo: 'Ventas netas', valor: pesos(d.resumen.neto), detalle: 'sin IVA, menos notas de crédito' },
    { titulo: 'Facturas', valor: d.resumen.facturas.toLocaleString('es-AR'), detalle: `${d.resumen.clientes} clientes` },
    { titulo: 'Promedio por factura', valor: pesos(d.resumen.promedio), detalle: 'neto' },
    { titulo: 'Compras netas', valor: pesos(d.totalCompras), detalle: 'sin IVA' },
  ]
  return (
    <>
      <EncabezadoPagina
        titulo="Informes de gestión"
        bajada="Ventas y compras en pesos y sin IVA. Las notas de crédito restan."
        acciones={
          <form className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-texto-2">
              Desde
              <input type="date" name="desde" defaultValue={r.desde} className={control} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-texto-2">
              Hasta
              <input type="date" name="hasta" defaultValue={r.hasta} className={control} />
            </label>
            <button className="h-9 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2">Ver</button>
            <a
              href={`/informes/excel?desde=${r.desde}&hasta=${r.hasta}`}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-borde px-3 text-sm hover:bg-superficie-2"
            >
              <FileSpreadsheet aria-hidden className="size-4" /> Excel
            </a>
          </form>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Panel key={t.titulo} className="p-4">
            <p className="text-xs text-texto-2">{t.titulo}</p>
            <p className="cifras mt-1 text-xl font-semibold">{t.valor}</p>
            <p className="text-xs text-texto-3">{t.detalle}</p>
          </Panel>
        ))}
      </div>

      <Panel className="mb-4 p-4">
        <h2 className="text-sm font-semibold">Ventas netas por mes</h2>
        <p className="mb-3 text-xs text-texto-2">Los 12 meses que terminan en {mesCorto(r.hasta.slice(0, 7))}.</p>
        {d.meses.every((m) => m.neto === 0) && (
          <p className="mb-2 text-sm text-texto-2">Sin ventas autorizadas en estos 12 meses.</p>
        )}
        <div className="flex h-44 items-end gap-1.5 border-b border-borde" role="img" aria-label="Ventas netas por mes">
          {d.meses.map((m) => (
            <div key={m.mes} className="group relative flex h-full flex-1 flex-col justify-end">
              <span className="pointer-events-none absolute -top-6 left-1/2 z-10 hidden -translate-x-1/2 rounded bg-texto px-1.5 py-0.5 text-[11px] whitespace-nowrap text-superficie group-hover:block">
                {pesos(m.neto)}
              </span>
              <div
                className="rounded-t-[4px] bg-acento transition-opacity group-hover:opacity-80"
                style={{ height: `${Math.max(0, (m.neto / maxMes) * 100)}%` }}
                title={`${m.mes}: ${pesos(m.neto)}`}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5">
          {d.meses.map((m) => (
            <span key={m.mes} className="flex-1 text-center text-[11px] text-texto-3">
              {mesCorto(m.mes)}
            </span>
          ))}
        </div>
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-texto-2">Ver como tabla</summary>
          <table className="mt-2 w-full max-w-sm">
            <tbody>
              {d.meses.map((m) => (
                <tr key={m.mes}>
                  <td className="py-0.5">{m.mes}</td>
                  <td className="cifras py-0.5 text-right">{pesos(m.neto)}</td>
                  <td className="cifras py-0.5 pl-2 text-right text-texto-3">{compacto(m.neto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Clientes que más compraron</h2>
          <Barras filas={d.clientes.slice(0, 15).map((c) => ({ nombre: c.nombre, neto: c.neto }))} total={d.resumen.neto} />
        </Panel>
        <Panel>
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Artículos más vendidos</h2>
          <Barras
            filas={d.articulos.slice(0, 15).map((a) => ({
              nombre: a.nombre,
              neto: a.neto,
              detalle: `${a.codigo ? `${a.codigo} · ` : ''}${a.cantidad.toLocaleString('es-AR')} u.`,
            }))}
            total={d.resumen.neto}
          />
        </Panel>
        <Panel>
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Por vendedor</h2>
          <Barras
            filas={d.vendedores.map((v) => ({ nombre: v.nombre, neto: v.neto, detalle: `${v.comprobantes} comp.` }))}
            total={d.resumen.neto}
          />
        </Panel>
        <Panel>
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Proveedores a los que más se compró</h2>
          <Barras filas={d.proveedores.slice(0, 15).map((p) => ({ nombre: p.nombre, neto: p.neto }))} total={d.totalCompras} />
        </Panel>
      </div>
    </>
  )
}
