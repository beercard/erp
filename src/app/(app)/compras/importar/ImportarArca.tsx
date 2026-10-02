'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { leerArcaAccion, registrarFaltantesAccion, type EstadoArca } from '@/app/(app)/compras/acciones'
import { Aviso, Boton, Chip, Panel } from '@/components/ui'
import { formatearCuit } from '@/lib/cuit'
import { formatearMonto } from '@/lib/dinero'
import { fechaCorta } from '@/lib/fechas'
import { formatearNumero } from '@/modulos/comercial/formato'
import { abreviaturaCompra } from '@/modulos/compras/tipos'

const ESTADO = {
  registrado: { texto: 'Cargado', tono: 'ok' },
  falta: { texto: 'Falta cargar', tono: 'aviso' },
  proveedor_nuevo: { texto: 'Falta (proveedor nuevo)', tono: 'aviso' },
  no_registrable: { texto: 'Cargar a mano', tono: 'error' },
} as const

export function ImportarArca({ puedeCargar }: { puedeCargar: boolean }) {
  const [lectura, leer, leyendo] = useActionState(leerArcaAccion, undefined)
  const [registro, registrar, registrando] = useActionState(registrarFaltantesAccion, undefined)
  // Lo último que pasó: si se registró, manda el resultado del registro.
  const estado: EstadoArca = registro?.conciliacion ? registro : lectura
  const conc = estado?.conciliacion
  const faltan = conc?.filas.filter((f) => f.estado === 'falta' || f.estado === 'proveedor_nuevo') ?? []
  const simbolo = (m: string) => (m === 'DOL' ? 'US$' : '$')

  return (
    <div className="flex flex-col gap-4">
      <Panel className="p-4">
        <form action={leer} className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-72 flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">
              Archivo de Mis Comprobantes → Recibidos (Excel, CSV o el ZIP tal como baja)
            </span>
            <input
              type="file"
              name="archivo"
              accept=".xlsx,.csv,.zip,.txt"
              required
              className="text-sm file:mr-3 file:rounded-md file:border file:border-borde file:bg-superficie-2 file:px-3 file:py-1.5 file:text-sm"
            />
          </label>
          <Boton type="submit" variante="primario" disabled={leyendo}>
            {leyendo ? 'Leyendo…' : 'Comparar con lo cargado'}
          </Boton>
        </form>
      </Panel>

      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {registro?.registrados !== undefined && registro.conciliacion && (
        <Aviso tono="ok">Se registraron {registro.registrados} comprobantes.</Aviso>
      )}
      {estado?.avisos && estado.avisos.length > 0 && (
        <Aviso tono="aviso">
          <ul className="list-disc pl-4">
            {estado.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Aviso>
      )}

      {conc && (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-borde bg-borde lg:grid-cols-4">
            {[
              { texto: 'En el archivo', valor: conc.filas.length },
              { texto: 'Ya cargados', valor: conc.filas.filter((f) => f.estado === 'registrado').length },
              { texto: 'Faltan', valor: faltan.length },
              { texto: 'Cargados que ARCA no informa', valor: conc.soloEnErp.length },
            ].map((c) => (
              <div key={c.texto} className="bg-superficie px-4 py-3">
                <span className="cifras block text-xl font-medium">{c.valor}</span>
                <span className="text-xs text-texto-2">{c.texto}</span>
              </div>
            ))}
          </div>

          {faltan.length > 0 && puedeCargar && (
            <Panel className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <p className="text-texto-2">
                Los que faltan se registran sin artículos (como gasto), con el IVA por alícuota que informa ARCA. Las compras de
                mercadería conviene cargarlas a mano para que entren al stock.
              </p>
              <form action={registrar}>
                <input type="hidden" name="filas" value={JSON.stringify(estado?.filas ?? [])} />
                <Boton type="submit" variante="primario" disabled={registrando}>
                  {registrando ? 'Registrando…' : `Registrar los ${faltan.length} que faltan`}
                </Boton>
              </form>
            </Panel>
          )}

          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
                  <th className="px-4 py-2 font-medium">Comprobante</th>
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium">Emisor</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {conc.filas.map((f) => (
                  <tr key={`${f.fila}-${f.numero}`}>
                    <td className="cifras px-4 py-2 whitespace-nowrap">
                      {f.compraId ? (
                        <Link href={`/compras/${f.compraId}`} className="hover:text-acento">
                          {abreviaturaCompra(f.tipo)} {formatearNumero(f.puntoVenta, f.numero)}
                        </Link>
                      ) : (
                        `${abreviaturaCompra(f.tipo)} ${formatearNumero(f.puntoVenta, f.numero)}`
                      )}
                    </td>
                    <td className="px-4 py-2 text-texto-2">{fechaCorta(f.fecha)}</td>
                    <td className="px-4 py-2">
                      {f.nombre} <span className="cifras text-xs text-texto-3">{formatearCuit(f.cuit)}</span>
                    </td>
                    <td className="cifras px-4 py-2 text-right">{formatearMonto(f.total, simbolo(f.moneda))}</td>
                    <td className="px-4 py-2">
                      <Chip tono={ESTADO[f.estado].tono}>{ESTADO[f.estado].texto}</Chip>
                      {f.avisos.length > 0 && <span className="ml-2 text-xs text-texto-3">{f.avisos.join(' ')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {conc.soloEnErp.length > 0 && (
            <Panel>
              <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">
                Cargados en el sistema en esas fechas que ARCA no informa
              </h2>
              <p className="px-4 pt-3 text-xs text-texto-3">
                Pueden ser comprobantes manuales (con CAI), tickets o un error de carga (tipo o número equivocado).
              </p>
              <ul className="divide-y divide-borde text-sm">
                {conc.soloEnErp.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <Link href={`/compras/${r.id}`} className="cifras hover:text-acento">
                      {abreviaturaCompra(r.tipo)} {formatearNumero(r.puntoVenta, r.numero)}
                    </Link>
                    <span>{r.proveedor}</span>
                    <span className="text-texto-2">{fechaCorta(r.fecha)}</span>
                    <span className="cifras">{formatearMonto(r.total, '$')}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  )
}
