import { Download } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Aviso, BotonEnlace, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { estadoResultados, libroDiario, mayor, situacionPatrimonial, sumasYSaldos } from '@/modulos/contabilidad/libros'
import { configuracionContableDe, planDeCuentas } from '@/modulos/contabilidad/plan'

import { pesos } from '../../impuestos/periodo'
import { rangoPedido } from '../origenes'

export const metadata: Metadata = { title: 'Libros contables' }

const VISTAS = {
  diario: 'Libro diario',
  mayor: 'Mayor',
  balance: 'Sumas y saldos',
  resultados: 'Estado de resultados',
  situacion: 'Situación patrimonial',
} as const
type Vista = keyof typeof VISTAS

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm'
const fecha = (iso: string) => iso.split('-').reverse().join('/')
const celda = (n: number) => (n ? pesos(n) : '')

export default async function Libros({ searchParams }: PageProps<'/contabilidad/libros'>) {
  const sesion = await exigirPermiso('contabilidad.ver')
  const p = (await searchParams) as { vista?: string; desde?: string; hasta?: string; cuenta?: string }
  const vista: Vista = p.vista && p.vista in VISTAS ? (p.vista as Vista) : 'balance'
  const hoy = hoyArgentina()
  const d = await conEmpresa(sesion.empresa.id, async (tx) => {
    const config = await configuracionContableDe(tx)
    if (!config) return null
    // Por defecto, del inicio del año (o de la contabilidad) a hoy.
    const { desde, hasta } = rangoPedido(
      {
        desde: p.desde ?? (config.inicio > `${hoy.slice(0, 4)}-01-01` ? config.inicio : `${hoy.slice(0, 4)}-01-01`),
        hasta: p.hasta,
      },
      hoy,
    )
    const plan = await planDeCuentas(tx)
    const cuenta = plan.find((c) => c.id === p.cuenta && c.imputable) ?? null
    return {
      desde,
      hasta,
      plan,
      cuenta,
      diario: vista === 'diario' ? await libroDiario(tx, desde, hasta) : null,
      mayor: vista === 'mayor' && cuenta ? await mayor(tx, cuenta.id, desde, hasta) : null,
      balance: vista === 'balance' ? await sumasYSaldos(tx, desde, hasta) : null,
      resultados: vista === 'resultados' ? await estadoResultados(tx, desde, hasta) : null,
      situacion: vista === 'situacion' ? await situacionPatrimonial(tx, hasta) : null,
    }
  })
  if (!d) redirect('/contabilidad')
  const enlace = (v: Vista, extra = '') => `/contabilidad/libros?vista=${v}&desde=${d.desde}&hasta=${d.hasta}${extra}`

  return (
    <>
      <EncabezadoPagina
        titulo="Libros y balances"
        bajada="Todo sale de los asientos registrados. La planilla trae el diario, sumas y saldos, resultados y situación patrimonial del rango."
        acciones={
          <BotonEnlace href={`/contabilidad/libros/excel?desde=${d.desde}&hasta=${d.hasta}`} prefetch={false}>
            <Download aria-hidden className="size-4" /> Excel
          </BotonEnlace>
        }
      />
      <nav className="mb-3 flex flex-wrap gap-1 text-sm" aria-label="Libros">
        {(Object.keys(VISTAS) as Vista[]).map((v) => (
          <Link
            key={v}
            href={enlace(v, v === 'mayor' && d.cuenta ? `&cuenta=${d.cuenta.id}` : '')}
            aria-current={v === vista ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 ${v === vista ? 'bg-acento-suave font-medium text-acento' : 'text-texto-2 hover:bg-superficie-2'}`}
          >
            {VISTAS[v]}
          </Link>
        ))}
      </nav>
      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="vista" value={vista} />
        {vista !== 'situacion' && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-texto-2">Desde</span>
            <input type="date" name="desde" defaultValue={d.desde} className={control} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-texto-2">{vista === 'situacion' ? 'Al' : 'Hasta'}</span>
          <input type="date" name="hasta" defaultValue={d.hasta} className={control} />
        </label>
        {vista === 'mayor' && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-texto-2">Cuenta</span>
            <select name="cuenta" defaultValue={d.cuenta?.id ?? ''} required className={`${control} max-w-80`}>
              <option value="" disabled>
                Elegí la cuenta…
              </option>
              {d.plan
                .filter((c) => c.imputable)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} {c.nombre}
                  </option>
                ))}
            </select>
          </label>
        )}
        <button className="h-9 rounded-md border border-borde px-3 hover:bg-superficie-2">Ver</button>
      </form>

      {d.diario && (
        <Panel className="overflow-x-auto">
          {d.diario.length ? (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-borde text-left text-xs text-texto-2">
                <tr>
                  <th className="px-4 py-2 font-medium">Cuenta</th>
                  <th className="px-4 py-2 text-right font-medium">Debe</th>
                  <th className="px-4 py-2 text-right font-medium">Haber</th>
                </tr>
              </thead>
              {d.diario.map((a) => (
                <tbody key={a.id} className="border-b border-borde">
                  <tr className="bg-superficie-2">
                    <td colSpan={3} className="px-4 py-1.5 text-xs">
                      <span className="font-semibold">
                        {a.orden}. {fecha(a.fecha)}
                      </span>{' '}
                      <Link href={`/contabilidad/asientos/${a.id}`} className="hover:underline">
                        {a.concepto}
                      </Link>{' '}
                      <span className="text-texto-3">(asiento {a.numero})</span>
                    </td>
                  </tr>
                  {a.lineas.map((l, i) => (
                    <tr key={i}>
                      <td className={`px-4 py-1 ${l.haber ? 'pl-12' : ''}`}>
                        <span className="cifras mr-2 text-texto-2">{l.codigo}</span>
                        {l.cuenta}
                        {(l.detalle || l.tercero) && <span className="text-xs text-texto-3"> · {l.tercero ?? l.detalle}</span>}
                      </td>
                      <td className="cifras px-4 py-1 text-right">{celda(l.debe)}</td>
                      <td className="cifras px-4 py-1 text-right">{celda(l.haber)}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          ) : (
            <p className="px-4 py-3 text-sm text-texto-2">No hay asientos en ese rango.</p>
          )}
        </Panel>
      )}

      {vista === 'mayor' && !d.cuenta && <Aviso tono="info">Elegí una cuenta para ver su mayor.</Aviso>}
      {d.mayor && d.cuenta && (
        <Panel className="overflow-x-auto">
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">
            <span className="cifras mr-2 text-texto-2">{d.cuenta.codigo}</span>
            {d.cuenta.nombre}
          </h2>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Concepto</th>
                <th className="px-4 py-2 text-right font-medium">Debe</th>
                <th className="px-4 py-2 text-right font-medium">Haber</th>
                <th className="px-4 py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              <tr className="text-texto-2">
                <td className="px-4 py-1.5" colSpan={4}>
                  Saldo al {fecha(d.desde)}
                </td>
                <td className="cifras px-4 py-1.5 text-right">{pesos(d.mayor.saldoAnterior)}</td>
              </tr>
              {d.mayor.movimientos.map((m, i) => (
                <tr key={i}>
                  <td className="px-4 py-1.5 whitespace-nowrap">{fecha(m.fecha)}</td>
                  <td className="px-4 py-1.5">
                    <Link href={`/contabilidad/asientos/${m.asientoId}`} className="hover:underline">
                      {m.concepto}
                    </Link>
                    {(m.detalle || m.tercero) && <span className="text-xs text-texto-3"> · {m.tercero ?? m.detalle}</span>}
                  </td>
                  <td className="cifras px-4 py-1.5 text-right">{celda(m.debe)}</td>
                  <td className="cifras px-4 py-1.5 text-right">{celda(m.haber)}</td>
                  <td className="cifras px-4 py-1.5 text-right">{pesos(m.saldo)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-borde font-semibold">
              <tr>
                <td className="px-4 py-2" colSpan={2}>
                  Saldo al {fecha(d.hasta)}
                </td>
                <td className="cifras px-4 py-2 text-right">{pesos(d.mayor.debe)}</td>
                <td className="cifras px-4 py-2 text-right">{pesos(d.mayor.haber)}</td>
                <td className="cifras px-4 py-2 text-right">{pesos(d.mayor.saldo)}</td>
              </tr>
            </tfoot>
          </table>
        </Panel>
      )}

      {d.balance && (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-borde text-left text-xs text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">Cuenta</th>
                <th className="px-4 py-2 text-right font-medium">Saldo anterior</th>
                <th className="px-4 py-2 text-right font-medium">Debe</th>
                <th className="px-4 py-2 text-right font-medium">Haber</th>
                <th className="px-4 py-2 text-right font-medium">Deudor</th>
                <th className="px-4 py-2 text-right font-medium">Acreedor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {d.balance.map((f) => (
                <tr key={f.id} className={f.imputable ? '' : 'font-semibold'}>
                  <td className="py-1.5 pr-4" style={{ paddingLeft: `${1 + (f.nivel - 1) * 1.25}rem` }}>
                    {f.imputable ? (
                      <Link href={enlace('mayor', `&cuenta=${f.id}`)} className="hover:underline">
                        <span className="cifras mr-2 text-texto-2">{f.codigo}</span>
                        {f.nombre}
                      </Link>
                    ) : (
                      <>
                        <span className="cifras mr-2 text-texto-2">{f.codigo}</span>
                        {f.nombre}
                      </>
                    )}
                  </td>
                  <td className="cifras px-4 py-1.5 text-right">{celda(f.anterior)}</td>
                  <td className="cifras px-4 py-1.5 text-right">{celda(f.debe)}</td>
                  <td className="cifras px-4 py-1.5 text-right">{celda(f.haber)}</td>
                  <td className="cifras px-4 py-1.5 text-right">{f.saldo > 0 ? pesos(f.saldo) : ''}</td>
                  <td className="cifras px-4 py-1.5 text-right">{f.saldo < 0 ? pesos(-f.saldo) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!d.balance.length && <p className="px-4 py-3 text-sm text-texto-2">No hay movimientos hasta esa fecha.</p>}
        </Panel>
      )}

      {d.resultados && (
        <Panel className="max-w-3xl p-4">
          <p className="mb-3 text-sm text-texto-2">
            Del {fecha(d.resultados.desde)} al {fecha(d.resultados.hasta)}
          </p>
          <Estado
            bloques={[
              { titulo: 'Ingresos', total: d.resultados.totalIngresos, renglones: d.resultados.ingresos },
              { titulo: 'Egresos', total: d.resultados.totalEgresos, renglones: d.resultados.egresos },
            ]}
            final={{ titulo: d.resultados.resultado >= 0 ? 'Ganancia' : 'Pérdida', total: Math.abs(d.resultados.resultado) }}
          />
        </Panel>
      )}

      {d.situacion && (
        <Panel className="max-w-3xl p-4">
          <p className="mb-3 text-sm text-texto-2">Al {fecha(d.situacion.hasta)}</p>
          <Estado
            bloques={[
              { titulo: 'Activo', total: d.situacion.totalActivo, renglones: d.situacion.activo },
              { titulo: 'Pasivo', total: d.situacion.totalPasivo, renglones: d.situacion.pasivo },
              {
                titulo: 'Patrimonio neto',
                total: d.situacion.totalPatrimonio,
                renglones: [
                  ...d.situacion.patrimonio,
                  ...(d.situacion.resultadoNoCerrado
                    ? [
                        {
                          codigo: '',
                          nombre: 'Resultado del ejercicio en curso',
                          nivel: 2,
                          importe: d.situacion.resultadoNoCerrado,
                          imputable: true,
                        },
                      ]
                    : []),
                ],
              },
            ]}
            final={{ titulo: 'Pasivo + patrimonio neto', total: d.situacion.totalPasivo + d.situacion.totalPatrimonio }}
          />
          {Math.abs(d.situacion.diferencia) >= 0.01 && (
            <div className="mt-3">
              <Aviso>
                El activo no iguala al pasivo más el patrimonio por {pesos(d.situacion.diferencia)}: revisá los controles.
              </Aviso>
            </div>
          )}
        </Panel>
      )}
    </>
  )
}

type Renglon = { codigo: string; nombre: string; nivel: number; importe: number; imputable: boolean }

function Estado({
  bloques,
  final,
}: {
  bloques: { titulo: string; total: number; renglones: Renglon[] }[]
  final: { titulo: string; total: number }
}) {
  return (
    <table className="w-full text-sm">
      {bloques.map((b) => (
        <tbody key={b.titulo} className="border-b border-borde">
          <tr className="font-semibold">
            <td className="py-2 uppercase">{b.titulo}</td>
            <td className="cifras py-2 text-right">{pesos(b.total)}</td>
          </tr>
          {b.renglones
            .filter((r) => r.importe)
            .map((r) => (
              <tr key={`${r.codigo}${r.nombre}`} className={r.imputable ? 'text-texto-2' : 'font-medium'}>
                <td className="py-1" style={{ paddingLeft: `${(r.nivel - 1) * 1.25}rem` }}>
                  {r.nombre}
                </td>
                <td className="cifras py-1 text-right">{pesos(r.importe)}</td>
              </tr>
            ))}
        </tbody>
      ))}
      <tfoot>
        <tr className="font-semibold">
          <td className="py-2 uppercase">{final.titulo}</td>
          <td className="cifras py-2 text-right">{pesos(final.total)}</td>
        </tr>
      </tfoot>
    </table>
  )
}
