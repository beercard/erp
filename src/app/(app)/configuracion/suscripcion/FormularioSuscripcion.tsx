'use client'

import { useActionState, useEffect, useState } from 'react'

import { Aviso, Boton } from '@/components/ui'
import {
  APLICACIONES,
  FUNCIONES,
  MESES_COBRADOS_EN_ANUAL,
  ORDEN_PLANES,
  PLANES,
  planPorId,
  PRECIO_USUARIO_ADICIONAL,
  precioDeLista,
  type PlanId,
} from '@/lib/planes'

import { anularBajaAccion, cambiarSuscripcionAccion, pagarConMercadoPagoAccion, pedirBajaAccion } from './acciones'

const pesos = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`

/**
 * Armado de la suscripción: plan, aplicaciones, usuarios adicionales y
 * forma de pago, con el total a la vista.
 */
export function FormularioSuscripcion(props: {
  plan: string
  ciclo: string
  aplicaciones: string[]
  usuariosAdicionales: number
  enPrueba: boolean
  puedeCambiar: boolean
}) {
  const [estado, accion, enviando] = useActionState(cambiarSuscripcionAccion, undefined)
  const [plan, setPlan] = useState<PlanId>(props.plan as PlanId)
  const [ciclo, setCiclo] = useState(props.ciclo === 'anual' ? 'anual' : 'mensual')
  const [apps, setApps] = useState<string[]>(props.aplicaciones)
  const [extra, setExtra] = useState(props.usuariosAdicionales)
  const elegido = planPorId(plan)
  const appsValidas = elegido.admiteAplicaciones
    ? apps.filter((a) => ORDEN_PLANES.indexOf(plan) >= ORDEN_PLANES.indexOf(APLICACIONES.find((x) => x.id === a)!.desde))
    : []
  const mensual = precioDeLista({ plan, aplicaciones: appsValidas, usuariosAdicionales: extra })
  const cambio =
    plan !== props.plan ||
    ciclo !== props.ciclo ||
    extra !== props.usuariosAdicionales ||
    [...appsValidas].sort().join() !== [...props.aplicaciones].sort().join()

  return (
    <form action={accion} className="flex flex-col gap-5">
      <fieldset className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" disabled={!props.puedeCambiar}>
        <legend className="mb-2 text-xs font-medium text-texto-2">Plan</legend>
        {PLANES.map((p) => (
          <label
            key={p.id}
            className={`flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2 text-sm ${
              plan === p.id ? 'border-acento bg-acento-suave' : 'border-borde hover:bg-superficie-2'
            }`}
          >
            <span className="flex items-center gap-2">
              <input type="radio" name="plan" value={p.id} checked={plan === p.id} onChange={() => setPlan(p.id)} />
              <span className="font-medium">{p.nombre}</span>
            </span>
            <span className="cifras pl-5 text-xs text-texto-2">
              {p.precioMensual ? `${pesos(p.precioMensual)} /mes` : 'Gratis'}
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2" disabled={!props.puedeCambiar || !elegido.admiteAplicaciones}>
        <legend className="mb-1 text-xs font-medium text-texto-2">Aplicaciones</legend>
        {APLICACIONES.map((a) => {
          const alcanza = ORDEN_PLANES.indexOf(plan) >= ORDEN_PLANES.indexOf(a.desde)
          return (
            <label key={a.id} className={`flex items-start gap-2 text-sm ${!a.disponible || !alcanza ? 'text-texto-3' : ''}`}>
              <input
                type="checkbox"
                name="aplicaciones"
                value={a.id}
                className="mt-0.5"
                disabled={!a.disponible || !alcanza}
                checked={appsValidas.includes(a.id)}
                onChange={(e) => setApps(e.target.checked ? [...apps, a.id] : apps.filter((x) => x !== a.id))}
              />
              <span>
                <span className="font-medium">{FUNCIONES[a.id].nombre}</span>{' '}
                <span className="cifras">{pesos(a.precioMensual)} /mes</span>
                <span className="block text-xs text-texto-2">
                  {!a.disponible
                    ? 'Disponible pronto.'
                    : !alcanza
                      ? `Necesita el plan ${planPorId(a.desde).nombre} o superior.`
                      : FUNCIONES[a.id].detalle}
                </span>
              </span>
            </label>
          )
        })}
      </fieldset>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">
            Usuarios adicionales ({pesos(PRECIO_USUARIO_ADICIONAL)} /mes c/u)
          </span>
          <input
            type="number"
            name="usuariosAdicionales"
            min={0}
            max={200}
            value={extra}
            onChange={(e) => setExtra(Math.max(0, Number(e.target.value) || 0))}
            disabled={!props.puedeCambiar || elegido.precioMensual === 0}
            className="cifras h-9 w-28 rounded-lg border border-borde-fuerte/80 bg-superficie shadow-suave px-2 text-sm"
          />
        </label>
        <fieldset className="flex gap-4 text-sm" disabled={!props.puedeCambiar || elegido.precioMensual === 0}>
          <legend className="mb-1 text-xs font-medium text-texto-2">Forma de pago</legend>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="ciclo" value="mensual" checked={ciclo === 'mensual'} onChange={() => setCiclo('mensual')} />
            Mensual
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="ciclo" value="anual" checked={ciclo === 'anual'} onChange={() => setCiclo('anual')} />
            Anual (se pagan {MESES_COBRADOS_EN_ANUAL} meses)
          </label>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-superficie-2 px-4 py-3">
        <span className="text-sm">
          Total:{' '}
          <span className="cifras text-lg font-semibold">
            {ciclo === 'anual' ? pesos(mensual * MESES_COBRADOS_EN_ANUAL) : pesos(mensual)}
          </span>{' '}
          <span className="text-texto-2">{ciclo === 'anual' ? 'por año' : 'por mes'} + IVA</span>
        </span>
        {props.puedeCambiar && (
          <Boton type="submit" variante="primario" disabled={enviando || !cambio}>
            {enviando ? 'Enviando…' : props.enPrueba || elegido.precioMensual === 0 ? 'Aplicar' : 'Pedir el cambio'}
          </Boton>
        )}
      </div>
      {props.enPrueba && elegido.precioMensual > 0 && (
        <p className="text-xs text-texto-3">Durante la prueba el cambio se aplica en el momento y no se cobra nada.</p>
      )}
      <Resultado estado={estado} />
    </form>
  )
}

function Resultado({ estado }: { estado: { error?: string; ok?: string } | undefined }) {
  if (estado?.error) return <Aviso>{estado.error}</Aviso>
  if (estado?.ok) return <Aviso tono="ok">{estado.ok}</Aviso>
  return null
}

/** Lleva a Mercado Pago a autorizar el débito automático. */
export function PagarConMercadoPago() {
  const [estado, accion, enviando] = useActionState(pagarConMercadoPagoAccion, undefined)
  useEffect(() => {
    if (estado?.irA) window.location.assign(estado.irA)
  }, [estado?.irA])
  return (
    <form action={accion} className="flex flex-col gap-2">
      <Boton type="submit" variante="primario" disabled={enviando}>
        {enviando || estado?.irA ? 'Abriendo Mercado Pago…' : 'Pagar con Mercado Pago'}
      </Boton>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
    </form>
  )
}

/** Botón de baja: con confirmación explícita y, antes de que rija, la opción de deshacerla. */
export function DarDeBaja({ bajaDesde, hastaFuncionando }: { bajaDesde: string | null; hastaFuncionando: string }) {
  const [estado, pedir, pidiendo] = useActionState(pedirBajaAccion, undefined)
  const [anulado, anular, anulando] = useActionState(anularBajaAccion, undefined)
  const [abierto, setAbierto] = useState(false)
  const dma = (f: string) => f.split('-').reverse().join('/')
  const resultado = anulado ?? estado
  if (bajaDesde) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p>
          Pediste la baja. El sistema funciona normalmente hasta el día anterior al <strong>{dma(bajaDesde)}</strong>; desde ahí
          queda en modo consulta y podés exportar todo durante 12 meses.
        </p>
        <form action={anular}>
          <Boton type="submit" disabled={anulando}>
            Deshacer la baja
          </Boton>
        </form>
        {resultado?.error && <Aviso>{resultado.error}</Aviso>}
        {resultado?.ok && <Aviso tono="ok">{resultado.ok}</Aviso>}
      </div>
    )
  }
  if (!abierto) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-texto-2">Podés darte de baja cuando quieras, sin costo ni permanencia.</p>
        <Boton type="button" variante="fantasma" onClick={() => setAbierto(true)}>
          Dar de baja la suscripción
        </Boton>
      </div>
    )
  }
  return (
    <form action={pedir} className="flex flex-col gap-3 text-sm">
      <ul className="list-disc pl-5 text-texto-2">
        <li>Se cancela en el acto el débito automático de Mercado Pago, si lo tenés.</li>
        <li>El sistema sigue funcionando normalmente hasta el {dma(hastaFuncionando)}.</li>
        <li>Después queda en modo consulta: ves y exportás todo durante 12 meses. No se borra nada antes.</li>
        <li>Hasta esa fecha podés deshacer la baja desde acá.</li>
      </ul>
      <label className="flex flex-col gap-1">
        <span className="text-[13px] font-medium text-texto-2">¿Nos contás por qué? (opcional)</span>
        <textarea name="motivo" rows={2} maxLength={500} className="rounded-lg border border-borde-fuerte/80 bg-superficie p-2" />
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="confirmo" value="si" className="mt-0.5 accent-acento" required />
        Entiendo lo que pasa con la baja y quiero darla.
      </label>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <div className="flex gap-2">
        <Boton type="submit" variante="peligro" disabled={pidiendo}>
          {pidiendo ? 'Procesando…' : 'Confirmar la baja'}
        </Boton>
        <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  )
}
