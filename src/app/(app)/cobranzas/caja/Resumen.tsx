import { Panel } from '@/components/ui'
import { formatearMonto } from '@/lib/dinero'
import { PROVEEDORES, type Proveedor } from '@/modulos/cobros/pasarelas'
import type { ResumenTurno } from '@/modulos/tesoreria/cierres'

const $ = (v: string | number) => formatearMonto(String(v), '$')

/** Una tarjeta de cifra (como el panel de un POS). */
function Cifra({ titulo, valor, nota, tono }: { titulo: string; valor: string; nota?: string; tono?: 'ok' | 'error' }) {
  return (
    <Panel className="p-4">
      <p className="text-xs text-texto-2">{titulo}</p>
      <p
        className={`cifras mt-1 text-2xl font-bold tracking-tight ${tono === 'ok' ? 'text-ok' : tono === 'error' ? 'text-error' : ''}`}
      >
        {valor}
      </p>
      {nota && <p className="mt-0.5 text-xs text-texto-3">{nota}</p>}
    </Panel>
  )
}

/** Barras horizontales de una sola serie: el valor va escrito al lado (no depende del color). */
function Barras({ filas }: { filas: { nombre: string; total: string; nota?: string }[] }) {
  const maximo = Math.max(...filas.map((f) => Number(f.total)), 1)
  return (
    <ul className="flex flex-col gap-3">
      {filas.map((f) => (
        <li
          key={f.nombre}
          className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm"
          title={`${f.nombre}: ${$(f.total)}${f.nota ? ` · ${f.nota}` : ''}`}
        >
          <span className="truncate text-texto-2">{f.nombre}</span>
          <span className="h-2.5 rounded-full bg-superficie-2">
            <span
              className="block h-full rounded-full bg-acento"
              style={{ width: `${Math.max(2, (Number(f.total) / maximo) * 100)}%` }}
            />
          </span>
          <span className="cifras text-right font-medium">
            {$(f.total)}
            {f.nota && <span className="block text-[11px] font-normal text-texto-3">{f.nota}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function ResumenCaja({ r, contado, diferencia }: { r: ResumenTurno; contado?: string; diferencia?: string }) {
  const dif = diferencia != null ? Number(diferencia) : null
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra
          titulo="Cobrado"
          valor={$(r.cobrado)}
          nota={`${r.recibos} ${r.recibos === 1 ? 'recibo' : 'recibos'} · promedio ${$(r.promedio)}`}
        />
        <Cifra
          titulo="Efectivo esperado en caja"
          valor={$(r.esperado)}
          nota={`Inicial ${$(r.saldoInicial)} + ${$(r.ingresos)} − ${$(r.egresos)}`}
        />
        {contado != null ? (
          <Cifra
            titulo="Contado"
            valor={$(contado)}
            nota={dif === 0 ? 'Cuadra' : `${dif! > 0 ? 'Sobrante' : 'Faltante'} de ${$(Math.abs(dif!))}`}
            tono={dif === 0 ? 'ok' : 'error'}
          />
        ) : (
          <Cifra titulo="Ventas facturadas" valor={$(r.ventas.total)} nota={`${r.ventas.comprobantes} comprobantes`} />
        )}
        <Cifra
          titulo="Recibos anulados"
          valor={String(r.anulados.cantidad)}
          nota={r.anulados.cantidad ? $(r.anulados.total) : 'Ninguno'}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="p-5">
          <h3 className="mb-4 font-semibold">Cobrado por medio de pago</h3>
          {r.porMedio.length ? (
            <Barras
              filas={r.porMedio.map((m) => ({
                nombre: m.nombre,
                total: m.total,
                nota: `${m.recibos} ${m.recibos === 1 ? 'recibo' : 'recibos'}`,
              }))}
            />
          ) : (
            <p className="text-sm text-texto-3">Todavía no hay cobranzas en este turno.</p>
          )}
        </Panel>
        <Panel className="p-5">
          <h3 className="mb-4 font-semibold">Cobrado por cajero</h3>
          {r.porCajero.length ? (
            <Barras
              filas={r.porCajero.map((c) => ({
                nombre: c.usuario,
                total: c.total,
                nota: `${c.recibos} ${c.recibos === 1 ? 'recibo' : 'recibos'}`,
              }))}
            />
          ) : (
            <p className="text-sm text-texto-3">Sin cobranzas.</p>
          )}
          {r.online.length > 0 && (
            <div className="mt-5 border-t border-borde pt-4">
              <h4 className="mb-2 text-sm font-semibold">Cobros online acreditados</h4>
              <ul className="flex flex-col gap-1 text-sm">
                {r.online.map((o) => (
                  <li key={o.proveedor} className="flex justify-between">
                    <span className="text-texto-2">
                      {PROVEEDORES[o.proveedor as Proveedor]?.nombre ?? o.proveedor} · {o.cantidad}
                    </span>
                    <span className="cifras">{$(o.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>
      <Panel className="overflow-x-auto">
        <h3 className="border-b border-borde px-5 py-3 font-semibold">Retiros, gastos y otros movimientos de la caja</h3>
        {r.otrosMovimientos.length ? (
          <table className="w-full min-w-[480px] text-sm">
            <tbody className="divide-y divide-borde">
              {r.otrosMovimientos.map((m, i) => (
                <tr key={i}>
                  <td className="px-5 py-2 text-texto-2">
                    {new Date(m.creado).toLocaleTimeString('es-AR', {
                      timeZone: 'America/Argentina/Buenos_Aires',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-5 py-2">{m.descripcion || m.tipo}</td>
                  <td className={`cifras px-5 py-2 text-right ${Number(m.importe) < 0 ? 'text-error' : ''}`}>{$(m.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-4 text-sm text-texto-3">No hubo retiros ni gastos.</p>
        )}
      </Panel>
    </div>
  )
}
