'use client'

import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { useActionState, useState } from 'react'

import { FormularioDinamico } from '@/components/servicio/FormularioDinamico'
import { Aviso, Boton } from '@/components/ui'
import {
  idDesdeEtiqueta,
  SOLO_DEVOLUCION,
  TIPOS_CAMPO,
  type Campo,
  type Columna,
  type TipoCampo,
} from '@/modulos/servicio/formularios'
import { TIPOS_ORDEN } from '@/modulos/servicio/tipos'

import { guardarTipoAccion } from '../acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'

/** Campo en edición: los nuevos cambian su identificador con el título; los guardados lo conservan. */
type CampoEditado = Campo & { _nuevo?: boolean }

const limpiar = (campos: CampoEditado[]): Campo[] =>
  campos.map(({ _nuevo, ...c }) => {
    void _nuevo
    const x: Campo = { ...c }
    if (x.tipo !== 'seleccion' && x.tipo !== 'multiple') delete x.opciones
    if (x.tipo !== 'tabla') delete x.columnas
    if (x.tipo !== 'fotos') delete x.maximo
    if (x.opciones) x.opciones = x.opciones.map((o) => o.trim()).filter(Boolean)
    if (!x.ayuda) delete x.ayuda
    if (!x.requerido) delete x.requerido
    if (!x.si?.campo) delete x.si
    return x
  })

export type DatosTipo = {
  codigo: string
  nombre: string
  clase: string
  color: string
  duracion: number
  plazoHoras: number
  activo: boolean
  portal?: boolean
  instrucciones: Campo[]
  devolucion: Campo[]
}

export function EditorTipo({ id, inicial }: { id: string | null; inicial: DatosTipo }) {
  const [estado, accion, enviando] = useActionState(guardarTipoAccion.bind(null, id), undefined)
  const [instrucciones, setInstrucciones] = useState<CampoEditado[]>(inicial.instrucciones)
  const [devolucion, setDevolucion] = useState<CampoEditado[]>(inicial.devolucion)
  const [vista, setVista] = useState(false)

  return (
    <form action={accion} className="flex flex-col gap-5">
      <input type="hidden" name="instruccionesDef" value={JSON.stringify(limpiar(instrucciones))} />
      <input type="hidden" name="devolucionDef" value={JSON.stringify(limpiar(devolucion))} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Código</span>
          <input name="codigo" defaultValue={inicial.codigo} required maxLength={12} className={`${control} uppercase`} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={etiqueta}>Nombre</span>
          <input name="nombre" defaultValue={inicial.nombre} required className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Clase</span>
          <select name="clase" defaultValue={inicial.clase} className={control}>
            {Object.entries(TIPOS_ORDEN).map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Duración (min)</span>
          <input name="duracion" defaultValue={inicial.duracion} inputMode="numeric" className={`${control} cifras`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Plazo para informar (h)</span>
          <input name="plazoHoras" defaultValue={inicial.plazoHoras} inputMode="numeric" className={`${control} cifras`} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="color" name="color" defaultValue={inicial.color} className="h-9 w-12 rounded border border-borde" /> Color
          en el calendario
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="portal" defaultChecked={inicial.portal ?? false} /> Lo puede pedir el cliente desde el
          portal
        </label>
        {id && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="activo" defaultChecked={inicial.activo} /> Activo
          </label>
        )}
      </div>

      <div className="flex justify-end">
        <Boton type="button" onClick={() => setVista(!vista)}>
          {vista ? <Pencil aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          {vista ? 'Editar' : 'Vista previa'}
        </Boton>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-borde p-3">
          <h3 className="text-sm font-semibold">Instrucciones</h3>
          <p className="mb-3 text-xs text-texto-2">Lo completa la oficina al abrir la orden; el técnico lo ve en el celular.</p>
          {vista ? (
            <FormularioDinamico campos={limpiar(instrucciones)} nombre="_vista1" />
          ) : (
            <EditorCampos campos={instrucciones} cambiar={setInstrucciones} donde="instrucciones" otros={devolucion} />
          )}
        </section>
        <section className="rounded-lg border border-borde p-3">
          <h3 className="text-sm font-semibold">Devolución del técnico</h3>
          <p className="mb-3 text-xs text-texto-2">Lo completa el técnico en el celular al terminar.</p>
          {vista ? (
            <FormularioDinamico campos={limpiar(devolucion)} nombre="_vista2" />
          ) : (
            <EditorCampos campos={devolucion} cambiar={setDevolucion} donde="devolucion" otros={instrucciones} />
          )}
        </section>
      </div>

      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <div>
        <Boton type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Guardando…' : id ? 'Guardar' : 'Crear el tipo de orden'}
        </Boton>
        {id && (
          <p className="mt-2 text-xs text-texto-3">
            Si cambiaste los formularios se crea una versión nueva; las órdenes ya abiertas siguen con la suya.
          </p>
        )}
      </div>
    </form>
  )
}

function EditorCampos({
  campos,
  cambiar,
  donde,
  otros,
}: {
  campos: CampoEditado[]
  cambiar: (c: CampoEditado[]) => void
  donde: 'instrucciones' | 'devolucion'
  otros: Campo[]
}) {
  const [nuevoTipo, setNuevoTipo] = useState<TipoCampo>('texto')
  const usados = () => new Set([...campos, ...otros].map((c) => c.id))
  const poner = (n: number, c: Partial<CampoEditado>) => {
    const lista = campos.map((x, i) => {
      if (i !== n) return x
      const y = { ...x, ...c }
      // Un campo nuevo toma el identificador de su título (los guardados lo conservan: las respuestas viejas lo usan).
      if (x._nuevo && c.etiqueta !== undefined) {
        const otrosIds = usados()
        otrosIds.delete(x.id)
        y.id = idDesdeEtiqueta(c.etiqueta, otrosIds)
      }
      return y
    })
    cambiar(lista)
  }
  const mover = (n: number, d: -1 | 1) => {
    const lista = [...campos]
    ;[lista[n], lista[n + d]] = [lista[n + d], lista[n]]
    cambiar(lista)
  }
  const tipos = (Object.keys(TIPOS_CAMPO) as TipoCampo[]).filter((t) => donde === 'devolucion' || !SOLO_DEVOLUCION.includes(t))

  return (
    <div className="flex flex-col gap-2">
      {campos.length === 0 && <p className="text-sm text-texto-3">Sin campos.</p>}
      {campos.map((c, n) => {
        const anteriores = campos.slice(0, n).filter((x) => ['seleccion', 'multiple', 'si_no'].includes(x.tipo))
        const base = anteriores.find((x) => x.id === c.si?.campo)
        const valoresBase = base ? (base.tipo === 'si_no' ? ['Sí', 'No'] : (base.opciones ?? []).filter((o) => o.trim())) : []
        return (
          <div key={n} className="rounded-md border border-borde bg-superficie-2/40 p-2">
            <div className="flex items-start gap-2">
              <div className="grid flex-1 gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <select
                  value={c.tipo}
                  onChange={(e) => poner(n, { tipo: e.target.value as TipoCampo })}
                  className={control}
                  aria-label="Tipo de campo"
                >
                  {tipos.map((t) => (
                    <option key={t} value={t}>
                      {TIPOS_CAMPO[t]}
                    </option>
                  ))}
                </select>
                <input
                  value={c.etiqueta}
                  onChange={(e) => poner(n, { etiqueta: e.target.value })}
                  placeholder={c.tipo === 'estatico' ? 'Texto de la indicación' : 'Título del campo'}
                  className={control}
                  aria-label="Título"
                />
              </div>
              <div className="flex shrink-0">
                <button
                  type="button"
                  title="Subir"
                  disabled={n === 0}
                  onClick={() => mover(n, -1)}
                  className="grid size-9 place-items-center text-texto-3 disabled:opacity-30"
                >
                  <ArrowUp aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  title="Bajar"
                  disabled={n === campos.length - 1}
                  onClick={() => mover(n, 1)}
                  className="grid size-9 place-items-center text-texto-3 disabled:opacity-30"
                >
                  <ArrowDown aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  title="Quitar el campo"
                  onClick={() => cambiar(campos.filter((_, i) => i !== n))}
                  className="grid size-9 place-items-center text-texto-3 hover:text-error"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              {!['seccion', 'estatico'].includes(c.tipo) && (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={!!c.requerido} onChange={(e) => poner(n, { requerido: e.target.checked })} />{' '}
                  Obligatorio
                </label>
              )}
              {c.tipo === 'fotos' && (
                <label className="flex items-center gap-1.5">
                  Hasta
                  <input
                    value={c.maximo ?? 10}
                    inputMode="numeric"
                    onChange={(e) => poner(n, { maximo: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
                    className="h-7 w-12 rounded border border-borde bg-superficie px-1 text-center"
                  />
                  fotos
                </label>
              )}
              {anteriores.length > 0 && (
                <span className="flex flex-wrap items-center gap-1.5">
                  Mostrar solo si
                  <select
                    value={c.si?.campo ?? ''}
                    onChange={(e) => poner(n, { si: e.target.value ? { campo: e.target.value, valor: '' } : undefined })}
                    className="h-7 rounded border border-borde bg-superficie px-1"
                  >
                    <option value="">(siempre)</option>
                    {anteriores.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.etiqueta || a.id}
                      </option>
                    ))}
                  </select>
                  {c.si?.campo && (
                    <>
                      es
                      <select
                        value={c.si.valor}
                        onChange={(e) => poner(n, { si: { campo: c.si!.campo, valor: e.target.value } })}
                        className="h-7 rounded border border-borde bg-superficie px-1"
                      >
                        <option value="" />
                        {valoresBase.map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </>
                  )}
                </span>
              )}
            </div>
            {(c.tipo === 'seleccion' || c.tipo === 'multiple') && (
              <label className="mt-2 flex flex-col gap-1 text-xs">
                <span className="text-texto-2">Opciones (una por renglón)</span>
                <textarea
                  value={(c.opciones ?? []).join('\n')}
                  onChange={(e) => poner(n, { opciones: e.target.value.split('\n') })}
                  rows={Math.min(8, Math.max(3, (c.opciones ?? []).length + 1))}
                  className="rounded-md border border-borde bg-superficie px-2 py-1 text-sm"
                />
              </label>
            )}
            {c.tipo === 'tabla' && <EditorColumnas columnas={c.columnas ?? []} cambiar={(columnas) => poner(n, { columnas })} />}
          </div>
        )
      })}
      <div className="flex gap-2">
        <select
          value={nuevoTipo}
          onChange={(e) => setNuevoTipo(e.target.value as TipoCampo)}
          className={`${control} flex-1`}
          aria-label="Tipo del campo nuevo"
        >
          {tipos.map((t) => (
            <option key={t} value={t}>
              {TIPOS_CAMPO[t]}
            </option>
          ))}
        </select>
        <Boton
          type="button"
          onClick={() =>
            cambiar([
              ...campos,
              {
                id: idDesdeEtiqueta(TIPOS_CAMPO[nuevoTipo], usados()),
                tipo: nuevoTipo,
                etiqueta: '',
                _nuevo: true,
                ...(nuevoTipo === 'seleccion' || nuevoTipo === 'multiple' ? { opciones: ['', ''] } : {}),
                ...(nuevoTipo === 'tabla' ? { columnas: [{ id: 'c1', etiqueta: '', tipo: 'texto' as const }] } : {}),
              },
            ])
          }
        >
          <Plus aria-hidden className="size-4" /> Campo
        </Boton>
      </div>
    </div>
  )
}

function EditorColumnas({ columnas, cambiar }: { columnas: Columna[]; cambiar: (c: Columna[]) => void }) {
  const poner = (n: number, c: Partial<Columna>) => cambiar(columnas.map((x, i) => (i === n ? { ...x, ...c } : x)))
  return (
    <div className="mt-2 flex flex-col gap-1.5 text-xs">
      <span className="text-texto-2">Columnas</span>
      {columnas.map((col, n) => (
        <div key={n} className="flex flex-wrap items-center gap-1.5">
          <input
            value={col.etiqueta}
            onChange={(e) => poner(n, { etiqueta: e.target.value })}
            placeholder="Título"
            className="h-8 min-w-32 flex-1 rounded border border-borde bg-superficie px-2 text-sm"
          />
          <select
            value={col.tipo}
            onChange={(e) => poner(n, { tipo: e.target.value as Columna['tipo'] })}
            className="h-8 rounded border border-borde bg-superficie px-1 text-sm"
          >
            <option value="texto">Texto</option>
            <option value="numero">Número</option>
            <option value="seleccion">Lista</option>
          </select>
          {col.tipo === 'seleccion' && (
            <input
              value={(col.opciones ?? []).join(', ')}
              onChange={(e) => poner(n, { opciones: e.target.value.split(',').map((o) => o.trim()) })}
              placeholder="Opciones separadas por coma"
              className="h-8 min-w-40 flex-1 rounded border border-borde bg-superficie px-2 text-sm"
            />
          )}
          <button
            type="button"
            title="Quitar la columna"
            onClick={() => cambiar(columnas.filter((_, i) => i !== n))}
            className="text-texto-3 hover:text-error"
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        </div>
      ))}
      {columnas.length < 8 && (
        <button
          type="button"
          onClick={() => cambiar([...columnas, { id: `c${Date.now().toString(36)}`, etiqueta: '', tipo: 'texto' }])}
          className="self-start text-acento hover:underline"
        >
          + Columna
        </button>
      )}
    </div>
  )
}
