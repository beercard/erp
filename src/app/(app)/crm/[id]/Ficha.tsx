import { CircleAlert, FileText, Hourglass, RotateCcw, Trophy, UserPlus } from 'lucide-react'
import Link from 'next/link'

import { BotonConfirmar } from '@/components/BotonConfirmar'
import { Boton, BotonEnlace, Chip } from '@/components/ui'
import type { SesionConEmpresa } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'

import {
  borrarOportunidadAccion,
  clienteAccion,
  ganarAccion,
  moverEnFichaAccion,
  presupuestoAccion,
  reabrirAccion,
  vincularAccion,
} from '../acciones'
import { CampoEnLinea, TituloEnLinea } from '../CampoEnLinea'
import { pesosServidor } from '../formato'
import type { DatosFicha } from './datos'
import { BotonesContacto, PanelActividad } from './PanelActividad'
import { Perder } from './PiezasFicha'

const ESTADO = {
  abierta: { tono: 'info', texto: 'Abierta' },
  ganada: { tono: 'ok', texto: 'Ganada' },
  perdida: { tono: 'error', texto: 'Perdida' },
} as const

/**
 * La oportunidad completa: etapas y acciones arriba, una columna fija con
 * los datos (se editan en el lugar) y, al lado, la actividad. La usan la
 * ficha y la vista rápida del embudo, para que se vean igual.
 */
export function Ficha({ datos, sesion, compacta = false }: { datos: DatosFicha; sesion: SesionConEmpresa; compacta?: boolean }) {
  const { o, etapas, motivos, personas, etiquetas, duplicados, plantillas, variables, puede } = datos
  const id = o.id
  const hoy = hoyArgentina()
  const indice = etapas.findIndex((e) => e.id === o.etapaId)
  const email = o.email ?? o.clienteEmail
  const telefono = o.telefono ?? o.clienteTelefono
  const ponderado = (Number(o.ingresoEsperado) * o.probabilidad) / 100
  const estado = ESTADO[o.estado as keyof typeof ESTADO]

  return (
    <div className="flex flex-col gap-5">
      {/* Acciones y etapas */}
      <div className={`flex flex-col gap-3 ${compacta ? '' : 'tarjeta p-3 lg:flex-row lg:items-center lg:justify-between'}`}>
        <div className="flex flex-wrap items-center gap-2">
          {puede && o.estado === 'abierta' && (
            <>
              {tienePermiso(sesion.permisos, 'ventas.presupuestos') && !o.presupuestoId && (
                <form action={presupuestoAccion.bind(null, id)}>
                  <Boton type="submit" variante="primario">
                    <FileText aria-hidden /> Nuevo presupuesto
                  </Boton>
                </form>
              )}
              <form action={ganarAccion.bind(null, id)}>
                <Boton type="submit" className="text-ok">
                  <Trophy aria-hidden /> Ganada
                </Boton>
              </form>
              <Perder id={id} motivos={motivos} />
            </>
          )}
          {puede && o.estado !== 'abierta' && (
            <form action={reabrirAccion.bind(null, id)}>
              <Boton type="submit">
                <RotateCcw aria-hidden /> Reabrir
              </Boton>
            </form>
          )}
          {o.presupuestoId && (
            <BotonEnlace href={`/presupuestos/${o.presupuestoId}`}>
              <FileText aria-hidden /> Presupuesto N.º {o.presupuestoNumero}
            </BotonEnlace>
          )}
          {puede && o.esProspecto && tienePermiso(sesion.permisos, 'maestros.terceros') && (
            <form action={clienteAccion.bind(null, id)}>
              <Boton type="submit" variante="fantasma">
                <UserPlus aria-hidden /> Dar de alta como cliente
              </Boton>
            </form>
          )}
        </div>
        <ol aria-label="Etapas" className="flex overflow-x-auto rounded-lg bg-superficie ring-1 ring-borde">
          {etapas.map((e, n) => {
            const actual = e.id === o.etapaId
            const pasada = n < indice
            const clase = `relative flex h-9 items-center px-3.5 text-[13px] whitespace-nowrap ${
              actual
                ? o.estado === 'perdida'
                  ? 'bg-error-suave font-semibold text-error'
                  : 'bg-acento font-semibold text-sobre-acento'
                : pasada
                  ? 'bg-acento-suave text-acento'
                  : 'text-texto-2 hover:bg-superficie-2'
            } ${n ? 'border-l border-borde' : ''}`
            return (
              <li key={e.id} aria-current={actual ? 'step' : undefined}>
                {puede && !actual && o.estado !== 'perdida' ? (
                  <form action={moverEnFichaAccion.bind(null, id, e.id)}>
                    <button type="submit" className={clase} title={`Pasar a ${e.nombre}`}>
                      {e.nombre}
                    </button>
                  </form>
                ) : (
                  <span className={clase}>{e.nombre}</span>
                )}
              </li>
            )
          })}
        </ol>
      </div>

      <div className={compacta ? 'flex flex-col gap-5' : 'grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]'}>
        {/* Columna fija: identidad y datos */}
        <aside className={`flex min-w-0 flex-col gap-5 ${compacta ? '' : 'lg:sticky lg:top-4'}`}>
          <div className={compacta ? '' : 'tarjeta p-4'}>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <Chip tono={estado.tono}>{estado.texto}</Chip>
              {o.estancada && (
                <Chip tono="aviso">
                  <Hourglass aria-hidden className="size-3" /> {o.diasEnEtapa} días en {o.etapa}
                </Chip>
              )}
            </div>
            <TituloEnLinea key={o.titulo} id={id} valor={o.titulo} editar={puede} />
            <p className="mt-1 text-sm text-texto-2">
              {o.terceroId ? (
                <Link href={`/terceros/${o.terceroId}`} className="font-medium text-texto hover:text-acento">
                  {o.cliente}
                </Link>
              ) : (
                <>
                  {o.cliente} <span className="text-texto-3">· prospecto</span>
                </>
              )}
            </p>
            <p className="cifras mt-3 text-2xl font-bold tracking-tight">{pesosServidor(o.ingresoEsperado)}</p>
            <p className="cifras text-xs text-texto-3">
              {o.probabilidad} % · {pesosServidor(ponderado)} ponderado
            </p>
            <div className="mt-3">
              <BotonesContacto telefono={telefono} email={email} puede={puede} />
            </div>
            {o.estado === 'perdida' && (
              <p className="mt-3 rounded-lg bg-error-suave px-3 py-2 text-sm text-error">
                <span className="font-semibold">Perdida en {o.etapa}:</span> {o.motivoPerdida}
                {o.notaPerdida && <> — {o.notaPerdida}</>}
              </p>
            )}

            <div className="-mx-2 mt-4 flex flex-col border-t border-borde pt-3">
              <CampoEnLinea
                key={`i${o.ingresoEsperado}`}
                id={id}
                campo="ingresoEsperado"
                etiqueta="Ingreso esperado"
                icono="ingreso"
                tipo="pesos"
                valor={o.ingresoEsperado}
                editar={puede}
              />
              <CampoEnLinea
                key={`p${o.probabilidad}`}
                id={id}
                campo="probabilidad"
                etiqueta="Probabilidad"
                icono="probabilidad"
                tipo="porcentaje"
                valor={String(o.probabilidad)}
                editar={puede}
              />
              <CampoEnLinea
                key={`c${o.cierreEstimado}`}
                id={id}
                campo="cierreEstimado"
                etiqueta="Cierre estimado"
                icono="fecha"
                tipo="fecha"
                valor={o.cierreEstimado ?? ''}
                editar={puede}
              />
              <CampoEnLinea
                key={`r${o.responsableId}`}
                id={id}
                campo="responsableId"
                etiqueta="Responsable"
                icono="persona"
                tipo="opciones"
                valor={o.responsableId ?? ''}
                opciones={[{ valor: '', texto: 'Sin asignar' }, ...personas.map((p) => ({ valor: p.id, texto: p.nombre }))]}
                editar={puede}
              />
              <CampoEnLinea
                key={`pr${o.prioridad}`}
                id={id}
                campo="prioridad"
                etiqueta="Prioridad"
                icono="prioridad"
                tipo="estrellas"
                valor={String(o.prioridad)}
                editar={puede}
              />
              <CampoEnLinea
                key={`o${o.origen}`}
                id={id}
                campo="origen"
                etiqueta="Origen"
                icono="origen"
                valor={o.origen ?? ''}
                editar={puede}
                sugerencias={['Recomendación', 'Sitio web', 'WhatsApp', 'Redes sociales', 'Llamada', 'Feria o evento']}
              />
              <CampoEnLinea
                key={`e${o.etiquetas.join()}`}
                id={id}
                campo="etiquetas"
                etiqueta="Etiquetas"
                icono="etiquetas"
                tipo="etiquetas"
                valor={o.etiquetas.join(', ')}
                editar={puede}
                sugerencias={etiquetas}
              />
              <CampoEnLinea
                key={`s${o.proximoPaso}`}
                id={id}
                campo="proximoPaso"
                etiqueta="Próximo paso"
                icono="paso"
                valor={o.proximoPaso ?? ''}
                editar={puede}
              />
            </div>

            <h2 className="mt-4 border-t border-borde pt-3 text-xs font-semibold tracking-wide text-texto-3 uppercase">
              Contacto
            </h2>
            <div className="-mx-2 mt-1 flex flex-col">
              <CampoEnLinea
                key={`n${o.contacto}`}
                id={id}
                campo="contacto"
                etiqueta="Nombre"
                icono="contacto"
                valor={o.contacto ?? ''}
                editar={puede}
              />
              <CampoEnLinea
                key={`m${o.email}`}
                id={id}
                campo="email"
                etiqueta="Email"
                icono="email"
                valor={o.email ?? ''}
                editar={puede}
              />
              <CampoEnLinea
                key={`t${o.telefono}`}
                id={id}
                campo="telefono"
                etiqueta="Teléfono"
                icono="telefono"
                valor={o.telefono ?? ''}
                editar={puede}
              />
            </div>
            {o.descripcion && (
              <p className="mt-3 border-t border-borde pt-3 text-sm whitespace-pre-line text-texto-2">{o.descripcion}</p>
            )}
            {puede && (
              <p className="mt-3 text-right">
                <Link href={`/crm/${id}?editar=1`} className="text-xs text-texto-3 hover:text-acento">
                  Editar todo (cliente, descripción…)
                </Link>
              </p>
            )}
          </div>

          {(duplicados.clientes.length > 0 || duplicados.oportunidades.length > 0) && (
            <div className="tarjeta border-aviso/40 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-aviso">
                <CircleAlert aria-hidden className="size-4" /> Puede estar repetida
              </p>
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {duplicados.clientes.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Cliente{' '}
                      <Link href={`/terceros/${c.id}`} className="font-medium hover:text-acento">
                        {c.razonSocial}
                      </Link>
                    </span>
                    {puede && (
                      <form action={vincularAccion.bind(null, id, c.id)}>
                        <Boton type="submit" className="h-8">
                          Es este cliente
                        </Boton>
                      </form>
                    )}
                  </li>
                ))}
                {duplicados.oportunidades.map((d) => (
                  <li key={d.id}>
                    Otra abierta:{' '}
                    <Link href={`/crm/${d.id}`} className="font-medium hover:text-acento">
                      {d.titulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {puede && !compacta && (
            <form action={borrarOportunidadAccion.bind(null, id)} className="self-start">
              <BotonConfirmar
                variante="fantasma"
                pregunta="¿Borrar la oportunidad con sus actividades e historial? No se puede deshacer."
              >
                Borrar oportunidad
              </BotonConfirmar>
            </form>
          )}
        </aside>

        <PanelActividad
          id={id}
          abierta={o.estado === 'abierta'}
          puede={puede}
          hoy={hoy}
          yo={sesion.usuario.id}
          personas={personas}
          historial={o.historial.map((h) => ({ ...h, creado: new Date(h.creado).toISOString() }))}
          actividades={o.actividades}
          plantillas={plantillas}
          variables={variables}
          email={email}
          telefono={telefono}
        />
      </div>
    </div>
  )
}
