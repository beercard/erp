'use client'

import { ShoppingCart } from 'lucide-react'
import Link from 'next/link'
import { useActionState, useState } from 'react'

import { Aviso, Boton, Panel } from '@/components/ui'
import { formatearMonto } from '@/lib/dinero'
import type { Faltante } from '@/modulos/comercial/reposicion'

import { generarOrdenesAccion } from './acciones'

const control = 'h-8 w-24 rounded-md border border-borde bg-superficie px-2 text-right text-sm'

export function TablaReposicion({ filas, puede }: { filas: Faltante[]; puede: boolean }) {
  const [estado, accion, enviando] = useActionState(generarOrdenesAccion, undefined)
  const [marcados, setMarcados] = useState<Set<string>>(new Set(filas.filter((f) => f.proveedorId).map((f) => f.id)))
  const proveedores = new Set(filas.filter((f) => marcados.has(f.id) && f.proveedorId).map((f) => f.proveedorId)).size
  return (
    <form action={accion} className="flex flex-col gap-3">
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-left text-xs text-texto-2">
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2 font-medium">Artículo</th>
              <th className="px-3 py-2 text-right font-medium">Stock</th>
              <th className="px-3 py-2 text-right font-medium">Pedido</th>
              <th className="px-3 py-2 text-right font-medium">Mínimo</th>
              <th className="px-3 py-2 font-medium">Proveedor</th>
              <th className="px-3 py-2 text-right font-medium">Pedir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filas.map((f) => (
              <tr key={f.id}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    name="articulo"
                    value={f.id}
                    aria-label={`Pedir ${f.nombre}`}
                    disabled={!f.proveedorId || !puede}
                    checked={marcados.has(f.id)}
                    onChange={(e) =>
                      setMarcados((m) => {
                        const n = new Set(m)
                        if (e.target.checked) n.add(f.id)
                        else n.delete(f.id)
                        return n
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <Link href={`/articulos/${f.id}`} className="font-medium hover:text-acento">
                    {f.nombre}
                  </Link>
                  <span className="cifras block text-xs text-texto-3">{f.codigo}</span>
                </td>
                <td className={`cifras px-3 py-2 text-right ${Number(f.stock) <= 0 ? 'text-error' : ''}`}>{f.stock}</td>
                <td className="cifras px-3 py-2 text-right text-texto-2">{Number(f.enCamino) ? f.enCamino : '—'}</td>
                <td className="cifras px-3 py-2 text-right text-texto-2">{f.minimo}</td>
                <td className="px-3 py-2">
                  {f.proveedor ?? (
                    <Link href={`/articulos/${f.id}`} className="text-xs text-aviso hover:underline">
                      Sin proveedor: cargá el habitual
                    </Link>
                  )}
                  {Number(f.precio) > 0 && (
                    <span className="cifras block text-xs text-texto-3">{formatearMonto(f.precio, '$')} c/u</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    name={`cantidad_${f.id}`}
                    defaultValue={f.sugerido}
                    inputMode="decimal"
                    aria-label={`Cantidad a pedir de ${f.nombre}`}
                    className={`${control} cifras`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {puede && (
        <div className="flex justify-end">
          <Boton type="submit" variante="primario" disabled={enviando || !marcados.size}>
            <ShoppingCart aria-hidden />{' '}
            {enviando ? 'Armando…' : `Armar ${proveedores} ${proveedores === 1 ? 'orden' : 'órdenes'} de compra`}
          </Boton>
        </div>
      )}
    </form>
  )
}
