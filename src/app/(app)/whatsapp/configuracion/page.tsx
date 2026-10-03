import { Trash2 } from 'lucide-react'
import type { Metadata } from 'next'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { EncabezadoPagina, Panel } from '@/components/ui'
import { whatsappCuentas } from '@/db/schema'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { responsables } from '@/modulos/crm/crm'
import { claveDeEmpresa, cuentaDeEmpresa, listarAutorizados, urlAvisos } from '@/modulos/whatsapp/whatsapp'

import { Copiar } from '../../crm/configuracion/Extras'
import { desconectarAccion, quitarAutorizadoAccion } from '../acciones'
import { FormAutorizado, FormCuenta } from '../Piezas'

export const metadata: Metadata = { title: 'Configuración de WhatsApp' }

export default async function ConfiguracionWhatsapp() {
  const sesion = await exigirPermiso('whatsapp.configurar')
  const [cuenta, verificacion, autorizados, personas] = await enLaEmpresa(
    'whatsapp.configurar',
    async (tx) =>
      [
        await cuentaDeEmpresa(tx),
        (await tx.select({ t: whatsappCuentas.tokenVerificacion }).from(whatsappCuentas))[0]?.t ?? null,
        await listarAutorizados(tx),
        await responsables(tx, sesion.empresa.id),
      ] as const,
  )
  const clave = cuenta ? await claveDeEmpresa(sesion.empresa.id) : null
  return (
    <>
      <EncabezadoPagina
        titulo="WhatsApp Business"
        bajada="Conectá el número de la empresa con la API oficial de WhatsApp (Meta). Las claves se guardan cifradas."
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel className="flex flex-col gap-4 p-5">
          <h2 className="font-semibold">
            {cuenta
              ? `Conectado${cuenta.numero ? `: ${cuenta.numero}` : ''}${cuenta.nombreVerificado ? ` (${cuenta.nombreVerificado})` : ''}`
              : 'Conectar el número'}
          </h2>
          <FormCuenta
            cuenta={
              cuenta && {
                numeroId: cuenta.numeroId,
                plantilla: cuenta.plantilla,
                idioma: cuenta.idioma,
                agente: cuenta.agente,
                registroFacturas: cuenta.registroFacturas,
                instrucciones: cuenta.instrucciones,
                activa: cuenta.activa,
              }
            }
          />
          {cuenta && (
            <form action={desconectarAccion} className="self-end">
              <BotonConfirmar
                variante="fantasma"
                pregunta="¿Desconectar WhatsApp? Se borran el token y el secreto; las conversaciones quedan."
              >
                Desconectar
              </BotonConfirmar>
            </form>
          )}
        </Panel>
        <div className="flex flex-col gap-5">
          <Panel className="flex flex-col gap-3 p-5 text-sm">
            <h2 className="font-semibold">Cómo se conecta</h2>
            <ol className="list-decimal space-y-1.5 pl-5 text-texto-2">
              <li>En Meta for Developers, creá una app de tipo Empresa y agregale el producto WhatsApp.</li>
              <li>Agregá tu número a la cuenta de WhatsApp Business y copiá su “Phone number ID”.</li>
              <li>
                En el Business Manager, creá un usuario del sistema con permiso sobre la cuenta y generá un token permanente
                (whatsapp_business_messaging y whatsapp_business_management).
              </li>
              <li>Copiá el “App secret” (Configuración de la app → Básica) y guardá todo acá.</li>
              <li>
                En WhatsApp → Configuración → Webhook, pegá la dirección y el token de verificación de abajo y suscribite al campo
                “messages”.
              </li>
            </ol>
            {cuenta && clave && verificacion && (
              <div className="flex flex-col gap-2 rounded-lg bg-superficie-2 p-3 text-xs">
                <span className="font-medium">Dirección del webhook</span>
                <code className="truncate font-mono">{urlAvisos(clave)}</code>
                <span>
                  <Copiar texto={urlAvisos(clave)} etiqueta="Copiar dirección" />
                </span>
                <span className="mt-1 font-medium">Token de verificación</span>
                <code className="truncate font-mono">{verificacion}</code>
                <span>
                  <Copiar texto={verificacion} etiqueta="Copiar token" />
                </span>
              </div>
            )}
          </Panel>
          <Panel className="flex flex-col gap-3 p-5">
            <h2 className="font-semibold">Quién puede mandar facturas de proveedores</h2>
            <p className="text-sm text-texto-2">
              Los mensajes de estos celulares no los contesta el agente: si traen una foto o un PDF de una factura, se lee y queda
              para revisar en Compras.
            </p>
            <ul className="divide-y divide-borde text-sm">
              {autorizados.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {a.nombre} <span className="text-texto-3">+{a.telefono}</span>
                  </span>
                  <form action={quitarAutorizadoAccion.bind(null, a.id)}>
                    <button
                      type="submit"
                      aria-label={`Quitar a ${a.nombre}`}
                      className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-error-suave hover:text-error"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <FormAutorizado personas={personas} />
          </Panel>
        </div>
      </div>
    </>
  )
}
