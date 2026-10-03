'use client'

import { useActionState } from 'react'

import { Aviso, Boton } from '@/components/ui'
import type { ConfiguracionServicio } from '@/modulos/servicio/configuracion'

import { guardarConfiguracionAccion } from '../acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'

export function FormularioConfiguracion({ inicial, portal }: { inicial: ConfiguracionServicio; portal: string }) {
  const [estado, accion, enviando] = useActionState(guardarConfiguracionAccion, undefined)
  const horas = (nombre: keyof ConfiguracionServicio, rotulo: string) => (
    <label className="flex flex-col gap-1">
      <span className={etiqueta}>{rotulo}</span>
      <input name={nombre} defaultValue={String(inicial[nombre] ?? '')} inputMode="numeric" className={`${control} cifras`} />
    </label>
  )
  return (
    <form action={accion} className="flex flex-col gap-5">
      <fieldset className="min-w-0">
        <legend className="mb-1 text-sm font-semibold">Tiempos de servicio (SLA)</legend>
        <p className="mb-3 text-xs text-texto-2">
          Horas corridas desde que se abre la orden. Un contrato puede tener los suyos (en la ficha del contrato).
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {horas('respuestaNormal', 'Llegar en (normal)')}
          {horas('resolucionNormal', 'Resolver en (normal)')}
          {horas('respuestaUrgente', 'Llegar en (urgente)')}
          {horas('resolucionUrgente', 'Resolver en (urgente)')}
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="mb-3 text-sm font-semibold">Avisos</legend>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="avisarVisita" defaultChecked={inicial.avisarVisita} /> Avisarle al cliente la visita
            programada (se manda solo, hasta dos días antes)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="avisarCierre" defaultChecked={inicial.avisarCierre} /> Mandarle al cliente el resumen del
            trabajo al cerrar la orden
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="encuesta" defaultChecked={inicial.encuesta} /> Incluir la encuesta de satisfacción
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Email de coordinación (alertas de SLA)</span>
            <input name="emailCoordinacion" type="email" defaultValue={inicial.emailCoordinacion ?? ''} className={control} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Firma de los correos</span>
            <textarea
              name="firma"
              rows={2}
              defaultValue={inicial.firma ?? ''}
              placeholder="Servicio técnico · 011 4444-0000 · lunes a viernes de 8 a 17"
              className="rounded-md border border-borde bg-superficie px-2 py-1.5 text-sm focus:border-acento"
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="mb-1 text-sm font-semibold">Ubicación de los técnicos</legend>
        <p className="mb-3 text-xs text-texto-2">
          Con la ubicación compartida desde Mi agenda, el sistema registra cuándo el técnico entró y salió del lugar de cada orden
          (geocerca) y su recorrido del día.
        </p>
        <div className="grid gap-3 sm:grid-cols-4">{horas('radioGeocerca', 'Radio alrededor del cliente (metros)')}</div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="mb-1 text-sm font-semibold">Portal de clientes</legend>
        <p className="mb-3 text-xs text-texto-2">
          Tus clientes ven sus equipos y el estado de sus órdenes, piden servicio y cargan contadores. Entran desde{' '}
          <a href={portal} target="_blank" rel="noreferrer" className="break-all text-acento hover:underline">
            {portal}
          </a>{' '}
          con el usuario que les mandes abajo.
        </p>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="portal" defaultChecked={inicial.portal} /> Habilitar el portal
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="portalOrdenes" defaultChecked={inicial.portalOrdenes} /> Los clientes pueden pedir
            servicio (los tipos de orden marcados “portal”)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="portalContadores" defaultChecked={inicial.portalContadores} /> Los clientes pueden cargar
            los contadores
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="portalCuenta" defaultChecked={inicial.portalCuenta} /> Los clientes ven su cuenta: saldo,
            facturas impagas y movimientos
          </label>
          <label className="flex items-center gap-2">
            <input
              type="color"
              name="portalColor"
              defaultValue={inicial.portalColor}
              className="h-9 w-12 rounded border border-borde"
            />{' '}
            Color del portal (el de tu marca)
          </label>
        </div>
      </fieldset>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <div>
        <Boton type="submit" variante="primario" disabled={enviando}>
          Guardar
        </Boton>
      </div>
    </form>
  )
}
