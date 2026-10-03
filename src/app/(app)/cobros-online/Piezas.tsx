'use client'

import { Check, Copy, Mail, MessageCircle } from 'lucide-react'
import { useActionState, useState, useTransition } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { crearPagoAccion, enviarPorEmailAccion, guardarPasarelaAccion, type EstadoCobro } from './acciones'

const campo = 'h-9 rounded-lg border border-borde-fuerte/80 bg-superficie px-2.5 text-sm shadow-suave'

type Pendiente = { id: string; nombre: string; saldo: string; vencida: boolean }

/** Nuevo link: se elige el cliente y, si debe, qué facturas; o un importe a cuenta. */
export function NuevoLink({
  clientes,
}: {
  clientes: { id: string; razonSocial: string; saldo: string; pendientes: Pendiente[] }[]
}) {
  const [estado, accion, enviando] = useActionState(crearPagoAccion, undefined)
  const [cliente, setCliente] = useState('')
  const elegido = clientes.find((c) => c.id === cliente)
  const pesos = (v: string) => Number(v).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
  return (
    <form action={accion} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
        Cliente
        <select name="terceroId" required value={cliente} onChange={(e) => setCliente(e.target.value)} className={campo}>
          <option value="">Elegí un cliente…</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.razonSocial}
              {Number(c.saldo) > 0 ? ` · debe ${pesos(c.saldo)}` : ''}
            </option>
          ))}
        </select>
      </label>
      {elegido && elegido.pendientes.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-medium text-texto-2">Facturas (sin marcar ninguna: todo el saldo)</legend>
          {elegido.pendientes.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="comprobanteIds" value={p.id} />
              <span className="flex-1">{p.nombre}</span>
              <span className={`cifras ${p.vencida ? 'text-error' : ''}`}>{pesos(p.saldo)}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Importe a cuenta (opcional)
          <input name="importe" inputMode="decimal" placeholder="Ej.: 150.000" className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Concepto (opcional)
          <input name="concepto" maxLength={120} placeholder="Ej.: Seña del pedido 120" className={campo} />
        </label>
      </div>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Boton type="submit" variante="primario" disabled={enviando}>
        Crear link de pago
      </Boton>
    </form>
  )
}

/** Copiar, mandar por WhatsApp (desde el teléfono de quien lo usa) o por email. */
export function Compartir({ id, url, texto, telefono }: { id: string; url: string; texto: string; telefono: string | null }) {
  const [copiado, setCopiado] = useState(false)
  const [estado, setEstado] = useState<EstadoCobro>()
  const [enviando, iniciar] = useTransition()
  const numero = (telefono ?? '').replace(/\D/g, '')
  const wa = `https://wa.me/${numero ? (numero.startsWith('54') ? numero : `549${numero.replace(/^0/, '')}`) : ''}?text=${encodeURIComponent(`${texto} ${url}`)}`
  const boton =
    'inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-texto-2 ring-1 ring-borde hover:bg-superficie-2 hover:text-texto'
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        className={boton}
        onClick={() =>
          navigator.clipboard.writeText(url).then(() => {
            setCopiado(true)
            setTimeout(() => setCopiado(false), 2000)
          })
        }
      >
        {copiado ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}{' '}
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
      <a href={wa} target="_blank" rel="noopener noreferrer" className={boton}>
        <MessageCircle aria-hidden className="size-3.5" /> WhatsApp
      </a>
      <button
        type="button"
        disabled={enviando}
        className={boton}
        onClick={() => iniciar(async () => setEstado(await enviarPorEmailAccion(id)))}
      >
        <Mail aria-hidden className="size-3.5" /> Email
      </button>
      {estado?.ok && <span className="text-xs text-ok">{estado.ok}</span>}
      {estado?.error && <span className="text-xs text-error">{estado.error}</span>}
    </span>
  )
}

type Campo = { clave: string; etiqueta: string; secreto?: boolean; ayuda?: string }

/** Alta o edición de una pasarela. Los secretos guardados no se muestran: vacío deja el que estaba. */
export function FormPasarela({
  proveedor,
  campos,
  valores,
  conectada,
  medios,
  cuentas,
}: {
  proveedor: string
  campos: Campo[]
  valores: { visibles: Record<string, string>; activa: boolean; prueba: boolean; medio: string; cuentaId: string | null } | null
  conectada: boolean
  medios: { valor: string; texto: string }[]
  cuentas: { id: string; nombre: string }[]
}) {
  const [estado, accion, enviando] = useActionState(guardarPasarelaAccion.bind(null, proveedor), undefined)
  return (
    <form action={accion} className="flex flex-col gap-2.5">
      {campos.map((c) => (
        <label key={c.clave} className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          {c.etiqueta}
          <input
            name={c.clave}
            type={c.secreto ? 'password' : 'text'}
            autoComplete="off"
            defaultValue={c.secreto ? '' : (valores?.visibles[c.clave] ?? '')}
            placeholder={c.secreto && conectada ? 'Guardado (escribí para cambiarlo)' : undefined}
            className={campo}
          />
          {c.ayuda && <span className="font-normal text-texto-3">{c.ayuda}</span>}
        </label>
      ))}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          Los recibos quedan como
          <select name="medio" defaultValue={valores?.medio} className={campo}>
            {medios.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.texto}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          La plata entra en
          <select name="cuentaId" defaultValue={valores?.cuentaId ?? ''} className={campo}>
            <option value="">La cuenta predeterminada del medio</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="activa" defaultChecked={valores?.activa ?? true} /> Disponible para pagar
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="prueba" defaultChecked={valores?.prueba ?? false} /> Modo de prueba
        </label>
      </div>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <Boton type="submit" variante="primario" disabled={enviando} className="self-start">
        {conectada ? 'Guardar' : 'Conectar'}
      </Boton>
    </form>
  )
}
