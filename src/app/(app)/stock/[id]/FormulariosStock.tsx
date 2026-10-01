'use client'

import { useActionState } from 'react'

import { ajustarStockAccion, transferirStockAccion } from '@/app/(app)/comercial/acciones'
import { Aviso, Boton, Panel } from '@/components/ui'

type Opcion = { valor: string; texto: string }

const control = 'h-9 w-full rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'

function Deposito({
  nombre,
  etiqueta,
  depositos,
  inicial,
}: {
  nombre: string
  etiqueta: string
  depositos: Opcion[]
  inicial?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-texto-2">{etiqueta}</span>
      <select name={nombre} className={control} defaultValue={inicial ?? depositos[0]?.valor ?? ''}>
        {depositos.map((d) => (
          <option key={d.valor} value={d.valor}>
            {d.texto}
          </option>
        ))}
      </select>
    </label>
  )
}

export function FormulariosStock({ articuloId, depositos }: { articuloId: string; depositos: Opcion[] }) {
  const [ajuste, ajustar, ajustando] = useActionState(ajustarStockAccion.bind(null, articuloId), undefined)
  const [transf, transferir, transfiriendo] = useActionState(transferirStockAccion.bind(null, articuloId), undefined)
  return (
    <aside className="flex flex-col gap-4">
      <Panel className="p-4">
        <h2 className="mb-1 text-sm font-semibold">Ajuste de inventario</h2>
        <p className="mb-3 text-xs text-texto-2">Positivo suma, negativo resta. Queda registrado quién y por qué.</p>
        <form action={ajustar} className="flex flex-col gap-3">
          <Deposito nombre="depositoId" etiqueta="Depósito" depositos={depositos} />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">Cantidad</span>
            <input name="cantidad" inputMode="decimal" placeholder="-2 o 5" className={`cifras ${control}`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">Motivo</span>
            <input name="motivo" placeholder="Recuento, rotura, devolución…" className={control} />
          </label>
          {ajuste?.error && <Aviso>{ajuste.error}</Aviso>}
          {ajuste?.ok && <Aviso tono="ok">{ajuste.ok}</Aviso>}
          <Boton type="submit" disabled={ajustando}>
            {ajustando ? 'Grabando…' : 'Registrar ajuste'}
          </Boton>
        </form>
      </Panel>
      {depositos.length > 1 && (
        <Panel className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Transferir entre depósitos</h2>
          <form action={transferir} className="flex flex-col gap-3">
            <Deposito nombre="desde" etiqueta="Desde" depositos={depositos} />
            <Deposito nombre="hacia" etiqueta="Hacia" depositos={depositos} inicial={depositos[1]?.valor} />
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-texto-2">Cantidad</span>
              <input name="cantidad" inputMode="decimal" className={`cifras ${control}`} />
            </label>
            {transf?.error && <Aviso>{transf.error}</Aviso>}
            {transf?.ok && <Aviso tono="ok">{transf.ok}</Aviso>}
            <Boton type="submit" disabled={transfiriendo}>
              {transfiriendo ? 'Grabando…' : 'Transferir'}
            </Boton>
          </form>
        </Panel>
      )}
    </aside>
  )
}
