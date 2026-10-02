'use client'

import { Copy, Mail, MessageCircle, Navigation } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { avisarClienteAccion, enlaceEncuestaAccion, enlaceSeguimientoAccion } from './acciones'

type Resultado = Awaited<ReturnType<typeof avisarClienteAccion>>

/**
 * Avisos al cliente desde la orden: el de la visita programada y el de
 * trabajo terminado (con la encuesta), y el enlace público de seguimiento.
 * Encola el email si el cliente tiene y deja el texto listo para WhatsApp,
 * como hace Persat.
 */
export function AvisosCliente({
  id,
  visita,
  cierre,
  correoConfigurado,
}: {
  id: string
  visita: boolean
  cierre: boolean
  correoConfigurado: boolean
}) {
  const [r, setR] = useState<Resultado | null>(null)
  const [enlace, setEnlace] = useState('')
  const [copiado, setCopiado] = useState('')
  const [enviando, iniciar] = useTransition()
  const avisar = (tipo: 'visita' | 'cierre') => iniciar(async () => setR(await avisarClienteAccion(id, tipo)))
  const copiar = async (texto: string, que: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(que)
    } catch {
      setCopiado('')
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {visita && (
          <Boton type="button" onClick={() => avisar('visita')} disabled={enviando}>
            <Mail aria-hidden className="size-4" /> Avisar la visita
          </Boton>
        )}
        {cierre && (
          <>
            <Boton type="button" onClick={() => avisar('cierre')} disabled={enviando}>
              <Mail aria-hidden className="size-4" /> Mandar el resumen y la encuesta
            </Boton>
            <Boton
              type="button"
              disabled={enviando}
              onClick={() =>
                iniciar(async () => {
                  const e = await enlaceEncuestaAccion(id)
                  if (e.ok) {
                    setEnlace(e.enlace)
                    await copiar(e.enlace, 'enlace')
                  } else setR(e)
                })
              }
            >
              <Copy aria-hidden className="size-4" /> Enlace de la encuesta
            </Boton>
          </>
        )}
        <Boton
          type="button"
          disabled={enviando}
          onClick={() =>
            iniciar(async () => {
              const e = await enlaceSeguimientoAccion(id)
              if (e.ok) {
                setEnlace(e.enlace)
                await copiar(e.enlace, 'enlace')
              } else setR(e)
            })
          }
        >
          <Navigation aria-hidden className="size-4" /> Enlace de seguimiento
        </Boton>
      </div>
      {enlace && (
        <p className="text-xs break-all text-texto-2">
          {copiado === 'enlace' ? 'Copiado: ' : ''}
          {enlace}
        </p>
      )}
      {r && !r.ok && <Aviso>{r.error}</Aviso>}
      {r?.ok && (
        <div className="flex flex-col gap-2 rounded-md border border-borde p-3">
          <p className="text-xs text-texto-2">
            {r.encolado
              ? correoConfigurado
                ? `Email en camino a ${r.para}.`
                : `Email guardado para ${r.para}: sale cuando se configure el servidor de correo.`
              : 'El cliente no tiene email cargado: mandalo por WhatsApp.'}
          </p>
          <pre className="max-h-48 overflow-auto rounded bg-superficie-2 p-2 font-sans text-xs whitespace-pre-wrap">
            {r.texto}
          </pre>
          <div className="flex flex-wrap gap-2">
            <a
              href={r.whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#25D366] px-3 text-sm font-medium text-white hover:opacity-90"
            >
              <MessageCircle aria-hidden className="size-4" /> Abrir WhatsApp
            </a>
            <Boton type="button" onClick={() => copiar(r.texto, 'texto')}>
              <Copy aria-hidden className="size-4" /> {copiado === 'texto' ? 'Copiado' : 'Copiar el texto'}
            </Boton>
          </div>
        </div>
      )}
    </div>
  )
}
