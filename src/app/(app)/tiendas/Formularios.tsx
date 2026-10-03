'use client'

import { RefreshCw } from 'lucide-react'
import { useActionState, useState, useTransition } from 'react'

import { Aviso, Boton } from '@/components/ui'

import {
  conectarClaveAccion,
  conectarShopifyAccion,
  conectarWooAccion,
  configurarAccion,
  sincronizarAccion,
  vincularAccion,
  type Estado,
} from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'

export function ConectarWoo() {
  const [estado, accion, enviando] = useActionState(conectarWooAccion, undefined)
  return (
    <form action={accion} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-texto-2">Dirección de la tienda</span>
        <input name="tienda" required placeholder="https://mitienda.com.ar" inputMode="url" className={control} />
      </label>
      <Boton type="submit" variante="primario" disabled={enviando}>
        Conectar WooCommerce
      </Boton>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
    </form>
  )
}

export function ConectarShopify() {
  const [estado, accion, enviando] = useActionState(conectarShopifyAccion, undefined)
  return (
    <form action={accion} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-texto-2">Tienda en Shopify</span>
        <input name="tienda" required placeholder="mitienda.myshopify.com" className={control} />
      </label>
      <Boton type="submit" variante="primario" disabled={enviando}>
        Conectar Shopify
      </Boton>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
    </form>
  )
}

/** Magento y PrestaShop: dirección de la tienda y la clave que se crea en su panel. */
export function ConectarConClave({ tipo }: { tipo: 'magento' | 'prestashop' }) {
  const [estado, accion, enviando] = useActionState(conectarClaveAccion.bind(null, tipo), undefined)
  return (
    <form action={accion} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-texto-2">Dirección de la tienda</span>
        <input name="tienda" required placeholder="https://mitienda.com.ar" inputMode="url" className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-texto-2">
          {tipo === 'magento' ? 'Access Token de la integración' : 'Clave del servicio web'}
        </span>
        <input name="clave" required type="password" autoComplete="off" className={control} />
      </label>
      <Boton type="submit" variante="primario" disabled={enviando}>
        {enviando ? 'Probando la conexión…' : `Conectar ${tipo === 'magento' ? 'Magento' : 'PrestaShop'}`}
      </Boton>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
    </form>
  )
}

export function Sincronizar({ id }: { id: string }) {
  const [enCurso, iniciar] = useTransition()
  const [estado, setEstado] = useState<Estado>()
  return (
    <div className="flex flex-col items-end gap-2">
      <Boton
        type="button"
        variante="primario"
        disabled={enCurso}
        onClick={() => iniciar(async () => setEstado(await sincronizarAccion(id)))}
      >
        <RefreshCw aria-hidden className={`size-4 ${enCurso ? 'animate-spin' : ''}`} />
        {enCurso ? 'Sincronizando…' : 'Sincronizar ahora'}
      </Boton>
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      {estado?.error && <Aviso>{estado.error}</Aviso>}
    </div>
  )
}

type Opcion = { id: string; nombre: string }

export function Configuracion({
  id,
  canal,
  listas,
  depositos,
  cuentas,
  puntosVenta,
}: {
  id: string
  canal: {
    nombre: string
    listaPreciosId: string | null
    depositoId: string | null
    enviarStock: boolean
    enviarPrecios: boolean
    traerPedidos: boolean
    facturarSolo: boolean
    cuentaCobroId: string | null
    puntoVenta: number | null
  }
  listas: Opcion[]
  depositos: Opcion[]
  cuentas: Opcion[]
  puntosVenta: { numero: number; nombre: string }[]
}) {
  const [estado, accion, enviando] = useActionState(configurarAccion.bind(null, id), undefined)
  return (
    <form action={accion} className="flex flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-texto-2">Nombre</span>
        <input name="nombre" defaultValue={canal.nombre} required className={control} />
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="traerPedidos" defaultChecked={canal.traerPedidos} className="mt-0.5" />
        <span>
          <span className="font-medium">Traer los pedidos pagados</span>
          <span className="block text-xs text-texto-2">Entran como pedidos del ERP, listos para remitir y facturar.</span>
        </span>
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="facturarSolo" defaultChecked={canal.facturarSolo} className="mt-0.5" />
        <span>
          <span className="font-medium">Facturar solo los pedidos pagados</span>
          <span className="block text-xs text-texto-2">
            Se remiten, se autorizan en ARCA y se cobran en la cuenta de abajo. Lo que no se pueda hacer queda anotado en el
            pedido.
          </span>
        </span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Entra el cobro en</span>
          <select name="cuentaCobroId" defaultValue={canal.cuentaCobroId ?? ''} className={control}>
            <option value="">La predeterminada</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Punto de venta</span>
          <select name="puntoVenta" defaultValue={canal.puntoVenta ?? ''} className={control}>
            <option value="">El primero electrónico</option>
            {puntosVenta.map((p) => (
              <option key={p.numero} value={p.numero}>
                {String(p.numero).padStart(4, '0')} · {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="enviarStock" defaultChecked={canal.enviarStock} className="mt-0.5" />
        <span>
          <span className="font-medium">Mandar el stock</span>
          <span className="block text-xs text-texto-2">Cada vez que cambia, la tienda muestra lo que hay.</span>
        </span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-texto-2">Stock de</span>
        <select name="depositoId" defaultValue={canal.depositoId ?? ''} className={control}>
          <option value="">Todos los depósitos</option>
          {depositos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="enviarPrecios" defaultChecked={canal.enviarPrecios} className="mt-0.5" />
        <span>
          <span className="font-medium">Mandar los precios</span>
          <span className="block text-xs text-texto-2">Precio final con IVA, de la lista elegida (solo listas en pesos).</span>
        </span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-texto-2">Lista de precios</span>
        <select name="listaPreciosId" defaultValue={canal.listaPreciosId ?? ''} className={control}>
          <option value="">Elegí una lista</option>
          {listas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </select>
      </label>
      <Boton type="submit" disabled={enviando}>
        Guardar
      </Boton>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
    </form>
  )
}

export function Vincular({ canalId, id, codigo }: { canalId: string; id: string; codigo: string | null }) {
  const [estado, accion, enviando] = useActionState(vincularAccion.bind(null, canalId, id), undefined)
  return (
    <form action={accion} className="flex items-center gap-1">
      <input
        name="codigo"
        defaultValue={codigo ?? ''}
        placeholder="Código del artículo"
        aria-label="Código del artículo"
        className="h-8 w-36 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2 text-xs"
      />
      <Boton type="submit" disabled={enviando} className="h-8 px-2 text-xs">
        {codigo ? 'Cambiar' : 'Vincular'}
      </Boton>
      {estado?.error && <span className="text-xs text-error">{estado.error}</span>}
    </form>
  )
}
