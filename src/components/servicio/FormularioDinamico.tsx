'use client'

import { Camera, Eraser, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { buscarArticulosOrden, quitarArchivoAccion, subirArchivoAccion } from '@/app/(app)/servicio/acciones'
import { Buscador } from '@/components/comercial/Buscador'
import { Aviso, Boton } from '@/components/ui'
import { visible, type Campo, type Firma, type Lectura, type Material, type Valores } from '@/modulos/servicio/formularios'

import { borrarArchivoLocal, esLocal, guardarArchivoLocal, leerArchivoLocal, sinConexion } from './sinSenal'

/**
 * Dibuja un formulario de orden (instrucciones o devolución) y deja las
 * respuestas, en JSON, en un campo oculto `nombre` del formulario que lo
 * contiene. Los campos condicionales aparecen y desaparecen en el momento.
 */

const control = 'h-10 w-full rounded-md border border-borde bg-superficie px-2.5 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'
type Articulo = Awaited<ReturnType<typeof buscarArticulosOrden>>[number]

/** Fotos y firma de algo que no es una orden (un formulario suelto): se suben con señal, sin cola. */
export type ArchivosExternos = {
  subir: (clase: 'foto' | 'firma', datos: FormData) => Promise<{ ok: true; id: string } | { ok: false; error: string }>
  quitar: (id: string) => Promise<unknown>
  /** Ruta de donde se ven (…/{id}). */
  ruta: string
}

export type Contexto = {
  /** Necesario para fotos, firma y materiales (se suben a la orden). */
  ordenId?: string
  archivos?: ArchivosExternos
  equipos?: { id: string; texto: string }[]
  /** Tipos que no se dibujan (por ejemplo, el equipo, que la oficina elige arriba). */
  omitir?: Campo['tipo'][]
}

export function FormularioDinamico({
  campos,
  inicial,
  nombre,
  contexto = {},
  alCambiar,
}: {
  campos: Campo[]
  inicial?: Valores | null
  nombre: string
  contexto?: Contexto
  /** Para guardar el borrador mientras se completa. */
  alCambiar?: (v: Valores) => void
}) {
  const [valores, setValores] = useState<Valores>(inicial ?? {})
  const cambiar = (id: string, v: unknown) => setValores((x) => ({ ...x, [id]: v }))
  useEffect(() => {
    alCambiar?.(valores)
  }, [valores, alCambiar])

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name={nombre} value={JSON.stringify(valores)} />
      {campos
        .filter((c) => !contexto.omitir?.includes(c.tipo) && visible(c, campos, valores))
        .map((c) => (
          <CampoEditable key={c.id} campo={c} valor={valores[c.id]} cambiar={(v) => cambiar(c.id, v)} contexto={contexto} />
        ))}
    </div>
  )
}

function Rotulo({ campo }: { campo: Campo }) {
  return (
    <span className={etiqueta}>
      {campo.etiqueta}
      {campo.requerido && <span className="text-error"> *</span>}
      {campo.ayuda && <span className="block font-normal text-texto-3">{campo.ayuda}</span>}
    </span>
  )
}

function CampoEditable({
  campo: c,
  valor,
  cambiar,
  contexto,
}: {
  campo: Campo
  valor: unknown
  cambiar: (v: unknown) => void
  contexto: Contexto
}) {
  const texto = (valor as string | undefined) ?? ''
  switch (c.tipo) {
    case 'seccion':
      return <h3 className="border-b border-borde pt-2 pb-1 text-sm font-semibold">{c.etiqueta}</h3>
    case 'estatico':
      return <p className="rounded-md bg-info-suave px-3 py-2 text-sm text-info">{c.etiqueta}</p>
    case 'texto':
    case 'link':
    case 'numero':
    case 'fecha':
    case 'hora':
      return (
        <label className="flex flex-col gap-1">
          <Rotulo campo={c} />
          <input
            type={c.tipo === 'fecha' ? 'date' : c.tipo === 'hora' ? 'time' : c.tipo === 'link' ? 'url' : 'text'}
            inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
            value={texto}
            maxLength={c.tipo === 'texto' ? 200 : 500}
            onChange={(e) => cambiar(e.target.value)}
            className={`${control} ${c.tipo === 'numero' ? 'cifras' : ''}`}
          />
        </label>
      )
    case 'parrafo':
      return (
        <label className="flex flex-col gap-1">
          <Rotulo campo={c} />
          <textarea
            value={texto}
            maxLength={2000}
            rows={3}
            onChange={(e) => cambiar(e.target.value)}
            className="rounded-md border border-borde bg-superficie px-2.5 py-2 text-sm focus:border-acento"
          />
        </label>
      )
    case 'seleccion':
    case 'si_no': {
      const opciones = c.tipo === 'si_no' ? ['Sí', 'No'] : (c.opciones ?? [])
      // Pocas opciones: botones grandes (más cómodos en el celular).
      if (opciones.length <= 4) {
        return (
          <fieldset className="min-w-0 flex flex-col gap-1">
            <legend className="mb-1">
              <Rotulo campo={c} />
            </legend>
            <div className="flex flex-wrap gap-2">
              {opciones.map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={texto === o}
                  onClick={() => cambiar(texto === o ? '' : o)}
                  className={`h-10 min-w-16 rounded-md border px-3 text-sm ${texto === o ? 'border-acento bg-acento text-sobre-acento' : 'border-borde bg-superficie hover:bg-superficie-2'}`}
                >
                  {o}
                </button>
              ))}
            </div>
          </fieldset>
        )
      }
      return (
        <label className="flex flex-col gap-1">
          <Rotulo campo={c} />
          <select value={texto} onChange={(e) => cambiar(e.target.value)} className={control}>
            <option value="">Elegí…</option>
            {opciones.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      )
    }
    case 'multiple': {
      const elegidas = (valor as string[] | undefined) ?? []
      return (
        <fieldset className="min-w-0 flex flex-col gap-1">
          <legend className="mb-1">
            <Rotulo campo={c} />
          </legend>
          {(c.opciones ?? []).map((o) => (
            <label key={o} className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={elegidas.includes(o)}
                onChange={(e) => cambiar(e.target.checked ? [...elegidas, o] : elegidas.filter((x) => x !== o))}
              />
              {o}
            </label>
          ))}
        </fieldset>
      )
    }
    case 'equipo':
      return (
        <label className="flex flex-col gap-1">
          <Rotulo campo={c} />
          <select value={texto} onChange={(e) => cambiar(e.target.value)} className={control}>
            <option value="">{contexto.equipos?.length ? 'Elegí el equipo…' : 'El cliente no tiene equipos instalados'}</option>
            {contexto.equipos?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.texto}
              </option>
            ))}
          </select>
        </label>
      )
    case 'contador': {
      const l = (valor as Partial<Record<keyof Lectura, string>> | undefined) ?? {}
      return (
        <fieldset className="min-w-0 grid grid-cols-2 gap-2">
          <legend className="col-span-2 mb-1">
            <Rotulo campo={c} />
          </legend>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-texto-3">Contador total</span>
            <input
              inputMode="numeric"
              value={l.contador ?? ''}
              onChange={(e) => cambiar({ ...l, contador: e.target.value })}
              className={`${control} cifras`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-texto-3">Copias de prueba</span>
            <input
              inputMode="numeric"
              value={l.creditos ?? ''}
              onChange={(e) => cambiar({ ...l, creditos: e.target.value })}
              className={`${control} cifras`}
            />
          </label>
        </fieldset>
      )
    }
    case 'tabla':
      return <Tabla campo={c} valor={(valor as string[][] | undefined) ?? []} cambiar={cambiar} />
    case 'materiales':
      return <Materiales campo={c} valor={(valor as Material[] | undefined) ?? []} cambiar={cambiar} ordenId={contexto.ordenId} />
    case 'fotos':
      return (
        <Fotos
          campo={c}
          valor={(valor as string[] | undefined) ?? []}
          cambiar={cambiar}
          ordenId={contexto.ordenId}
          externos={contexto.archivos}
        />
      )
    case 'firma':
      return (
        <CampoFirma
          campo={c}
          valor={valor as Firma | undefined}
          cambiar={cambiar}
          ordenId={contexto.ordenId}
          externos={contexto.archivos}
        />
      )
  }
}

function Tabla({ campo: c, valor, cambiar }: { campo: Campo; valor: string[][]; cambiar: (v: unknown) => void }) {
  const columnas = c.columnas ?? []
  const filas = valor.length ? valor : [columnas.map(() => '')]
  const poner = (f: number, i: number, v: string) =>
    cambiar(filas.map((fila, n) => (n === f ? columnas.map((_, k) => (k === i ? v : (fila[k] ?? ''))) : fila)))
  return (
    <fieldset className="min-w-0 flex flex-col gap-1">
      <legend className="mb-1">
        <Rotulo campo={c} />
      </legend>
      <div className="overflow-x-auto rounded-md border border-borde">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-superficie-2 text-left text-xs text-texto-2">
            <tr>
              {columnas.map((col) => (
                <th key={col.id} className="px-2 py-1.5 font-medium">
                  {col.etiqueta}
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filas.map((fila, f) => (
              <tr key={f}>
                {columnas.map((col, i) => (
                  <td key={col.id} className="p-1">
                    {col.tipo === 'seleccion' ? (
                      <select value={fila[i] ?? ''} onChange={(e) => poner(f, i, e.target.value)} className={control}>
                        <option value="" />
                        {(col.opciones ?? []).map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={fila[i] ?? ''}
                        inputMode={col.tipo === 'numero' ? 'decimal' : undefined}
                        onChange={(e) => poner(f, i, e.target.value)}
                        className={control}
                      />
                    )}
                  </td>
                ))}
                <td className="p-1">
                  <button
                    type="button"
                    title="Quitar la fila"
                    onClick={() => cambiar(filas.filter((_, n) => n !== f))}
                    className="grid size-8 place-items-center rounded text-texto-3 hover:text-error"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <Boton type="button" onClick={() => cambiar([...filas, columnas.map(() => '')])}>
          <Plus aria-hidden className="size-4" /> Fila
        </Boton>
      </div>
    </fieldset>
  )
}

function Materiales({
  campo: c,
  valor,
  cambiar,
  ordenId,
}: {
  campo: Campo
  valor: Material[]
  cambiar: (v: unknown) => void
  ordenId?: string
}) {
  const [libre, setLibre] = useState('')
  const poner = (n: number, m: Partial<Material>) => cambiar(valor.map((x, i) => (i === n ? { ...x, ...m } : x)))
  return (
    <fieldset className="min-w-0 flex flex-col gap-2">
      <legend className="mb-1">
        <Rotulo campo={c} />
      </legend>
      {valor.map((m, n) => (
        <div key={n} className="flex items-center gap-2 rounded-md border border-borde px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-sm">{m.descripcion}</span>
          <input
            aria-label="Cantidad"
            inputMode="decimal"
            value={m.cantidad}
            onChange={(e) => poner(n, { cantidad: e.target.value })}
            className="cifras h-9 w-20 rounded-md border border-borde bg-superficie px-2 text-right text-sm"
          />
          <button
            type="button"
            title="Quitar"
            onClick={() => cambiar(valor.filter((_, i) => i !== n))}
            className="grid size-9 place-items-center rounded text-texto-3 hover:text-error"
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        </div>
      ))}
      {ordenId && (
        <Buscador<Articulo>
          etiqueta="Buscar repuesto o insumo"
          placeholder="Código o nombre"
          buscar={(t) => buscarArticulosOrden(ordenId, t)}
          clave={(a) => a.id}
          render={(a) => (
            <span>
              <span className="cifras text-texto-3">{a.codigo}</span> {a.nombre}
            </span>
          )}
          alElegir={(a) => cambiar([...valor, { articuloId: a.id, descripcion: a.nombre, cantidad: '1' }])}
        />
      )}
      <div className="flex gap-2">
        <input
          value={libre}
          onChange={(e) => setLibre(e.target.value)}
          placeholder="…o algo que no está en la lista"
          className={control}
        />
        <Boton
          type="button"
          disabled={!libre.trim()}
          onClick={() => {
            cambiar([...valor, { articuloId: null, descripcion: libre.trim(), cantidad: '1' }])
            setLibre('')
          }}
        >
          Agregar
        </Boton>
      </div>
    </fieldset>
  )
}

/** Achica la foto en el celular antes de subirla (lado mayor 1600 px, JPEG). */
async function achicar(archivo: File): Promise<Blob> {
  const imagen = await createImageBitmap(archivo)
  const escala = Math.min(1, 1600 / Math.max(imagen.width, imagen.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(imagen.width * escala)
  lienzo.height = Math.round(imagen.height * escala)
  lienzo.getContext('2d')!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
  return new Promise((ok, mal) =>
    lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo leer la foto.'))), 'image/jpeg', 0.82),
  )
}

/** Sube la imagen; sin señal la guarda en el celular (id "local-…") y se sube con el informe. */
async function subir(
  ordenId: string,
  clase: 'foto' | 'firma',
  blob: Blob,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const datos = new FormData()
  datos.set('archivo', blob, clase === 'firma' ? 'firma.png' : 'foto.jpg')
  if (!navigator.onLine) return { ok: true, id: await guardarArchivoLocal(ordenId, clase, blob) }
  try {
    return await subirArchivoAccion(ordenId, clase, datos)
  } catch (e) {
    if (sinConexion(e)) return { ok: true, id: await guardarArchivoLocal(ordenId, clase, blob) }
    throw e
  }
}

/** Sube a la orden (con cola sin señal) o al destino externo (formulario suelto). */
async function subirA(
  ordenId: string | undefined,
  externos: ArchivosExternos | undefined,
  clase: 'foto' | 'firma',
  blob: Blob,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!externos) return subir(ordenId!, clase, blob)
  const datos = new FormData()
  datos.set('archivo', blob, clase === 'firma' ? 'firma.png' : 'foto.jpg')
  try {
    return await externos.subir(clase, datos)
  } catch (e) {
    if (sinConexion(e)) return { ok: false, error: 'Sin señal: probá de nuevo cuando vuelva.' }
    throw e
  }
}

/** Imagen de la orden: del servidor, o del celular si todavía no se subió. */
function Imagen({
  id,
  alt,
  className,
  ruta = '/servicio/archivo',
}: {
  id: string
  alt: string
  className: string
  ruta?: string
}) {
  const [local, setLocal] = useState<string | null>(null)
  useEffect(() => {
    if (!esLocal(id)) return
    let url: string | null = null
    let vigente = true
    leerArchivoLocal(id).then((a) => {
      if (!a || !vigente) return
      url = URL.createObjectURL(a.blob)
      setLocal(url)
    })
    return () => {
      vigente = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [id])
  const src = esLocal(id) ? local : `${ruta}/${id}`
  if (!src) return <span className={`${className} grid place-items-center text-xs text-texto-3`}>…</span>
  // eslint-disable-next-line @next/next/no-img-element -- imagen privada (o guardada en el celular), servida por la ruta propia
  return <img src={src} alt={alt} className={className} />
}

function Fotos({
  campo: c,
  valor,
  cambiar,
  ordenId,
  externos,
}: {
  campo: Campo
  valor: string[]
  cambiar: (v: unknown) => void
  ordenId?: string
  externos?: ArchivosExternos
}) {
  const puede = !!(ordenId || externos)
  const [subiendo, setSubiendo] = useState(0)
  const [error, setError] = useState('')
  const maximo = c.maximo ?? 10
  async function elegir(archivos: FileList | null) {
    if (!archivos || !puede) return
    setError('')
    // Se suben de a una; cada una que termina se suma a las que ya estaban.
    const ids = [...valor]
    for (const archivo of [...archivos].slice(0, maximo - ids.length)) {
      setSubiendo((n) => n + 1)
      try {
        const r = await subirA(ordenId, externos, 'foto', await achicar(archivo))
        if (r.ok) {
          ids.push(r.id)
          cambiar([...ids])
        } else setError(r.error)
      } catch {
        setError('No se pudo leer la foto.')
      } finally {
        setSubiendo((n) => n - 1)
      }
    }
  }
  return (
    <fieldset className="min-w-0 flex flex-col gap-2">
      <legend className="mb-1">
        <Rotulo campo={c} />
      </legend>
      <div className="flex flex-wrap gap-2">
        {valor.map((id) => (
          <div key={id} className="relative">
            <Imagen id={id} alt="Foto" ruta={externos?.ruta} className="size-24 rounded-md border border-borde object-cover" />
            <button
              type="button"
              title="Quitar la foto"
              onClick={() => {
                cambiar(valor.filter((x) => x !== id))
                if (esLocal(id)) void borrarArchivoLocal(id)
                else if (externos) void externos.quitar(id).catch(() => undefined)
                else if (ordenId) void quitarArchivoAccion(ordenId, id).catch(() => undefined)
              }}
              className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-superficie/90 text-error"
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          </div>
        ))}
        {valor.length < maximo && puede && (
          <label className="grid size-24 cursor-pointer place-items-center rounded-md border border-dashed border-borde text-texto-2 hover:bg-superficie-2">
            <span className="flex flex-col items-center gap-1 text-xs">
              <Camera aria-hidden className="size-6" />
              {subiendo ? 'Subiendo…' : 'Sacar foto'}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="sr-only"
              onChange={(e) => elegir(e.target.files)}
            />
          </label>
        )}
      </div>
      {error && <Aviso>{error}</Aviso>}
    </fieldset>
  )
}

/** Firma con el dedo sobre la pantalla; se sube como PNG. */
function CampoFirma({
  campo: c,
  valor,
  cambiar,
  ordenId,
  externos,
}: {
  campo: Campo
  valor: Firma | undefined
  cambiar: (v: unknown) => void
  ordenId?: string
  externos?: ArchivosExternos
}) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const dibujando = useRef(false)
  const [trazos, setTrazos] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aclaracion, setAclaracion] = useState(valor?.aclaracion ?? '')

  useEffect(() => {
    const cv = lienzo.current
    if (!cv) return
    const r = cv.getBoundingClientRect()
    cv.width = r.width * 2
    cv.height = r.height * 2
    const ctx = cv.getContext('2d')!
    ctx.scale(2, 2)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111827'
  }, [valor?.archivoId])

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }

  async function guardar() {
    if (!lienzo.current || !(ordenId || externos)) return
    setGuardando(true)
    setError('')
    const blob = await new Promise<Blob | null>((ok) => lienzo.current!.toBlob(ok, 'image/png'))
    const r = blob ? await subirA(ordenId, externos, 'firma', blob) : { ok: false as const, error: 'No se pudo leer la firma.' }
    setGuardando(false)
    if (r.ok) cambiar({ archivoId: r.id, aclaracion })
    else setError(r.error)
  }

  return (
    <fieldset className="min-w-0 flex flex-col gap-2">
      <legend className="mb-1">
        <Rotulo campo={c} />
      </legend>
      {valor?.archivoId ? (
        <div className="flex items-end gap-3">
          <Imagen
            id={valor.archivoId}
            alt="Firma"
            ruta={externos?.ruta}
            className="h-28 rounded-md border border-borde bg-white"
          />
          <Boton
            type="button"
            onClick={() => {
              cambiar(undefined)
              setTrazos(false)
            }}
          >
            Volver a firmar
          </Boton>
        </div>
      ) : (
        <>
          <canvas
            ref={lienzo}
            className="h-40 w-full touch-none rounded-md border border-borde bg-white"
            onPointerDown={(e) => {
              dibujando.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
              const ctx = e.currentTarget.getContext('2d')!
              ctx.beginPath()
              ctx.moveTo(...punto(e))
            }}
            onPointerMove={(e) => {
              if (!dibujando.current) return
              const ctx = e.currentTarget.getContext('2d')!
              ctx.lineTo(...punto(e))
              ctx.stroke()
              setTrazos(true)
            }}
            onPointerUp={() => (dibujando.current = false)}
          />
          <div className="flex flex-wrap gap-2">
            <Boton
              type="button"
              onClick={() => {
                const cv = lienzo.current!
                cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height)
                setTrazos(false)
              }}
            >
              <Eraser aria-hidden className="size-4" /> Borrar
            </Boton>
            <Boton type="button" variante="primario" disabled={!trazos || guardando || !(ordenId || externos)} onClick={guardar}>
              {guardando ? 'Guardando…' : 'Guardar la firma'}
            </Boton>
          </div>
        </>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-texto-3">Aclaración (nombre de quien firma)</span>
        <input
          value={aclaracion}
          onChange={(e) => {
            setAclaracion(e.target.value)
            if (valor?.archivoId) cambiar({ ...valor, aclaracion: e.target.value })
          }}
          className={control}
        />
      </label>
      {error && <Aviso>{error}</Aviso>}
    </fieldset>
  )
}
