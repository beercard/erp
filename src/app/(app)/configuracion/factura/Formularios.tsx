'use client'

import { useActionState, useState } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { disenoAccion, quitarLogoAccion, subirLogoAccion } from './acciones'

type Estado = { error?: string; ok?: string } | undefined
const Resultado = ({ e }: { e: Estado }) => (e?.error ? <Aviso>{e.error}</Aviso> : e?.ok ? <Aviso tono="ok">{e.ok}</Aviso> : null)

export function Logo({ logo }: { logo: string | null }) {
  const [estado, accion, enviando] = useActionState(subirLogoAccion, undefined)
  const [quitado, quitar, quitando] = useActionState(quitarLogoAccion, undefined)
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid h-28 place-items-center rounded-lg border border-dashed border-borde bg-superficie-2">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa del logo guardado (data URL)
          <img src={logo} alt="Logo actual" className="max-h-24 max-w-[80%] object-contain" />
        ) : (
          <span className="text-texto-3">Sin logo</span>
        )}
      </div>
      <form action={accion} className="flex flex-wrap items-center gap-2">
        <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="min-w-0 flex-1 text-sm" />
        <Boton type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Subiendo…' : 'Subir'}
        </Boton>
      </form>
      {logo && (
        <form action={quitar}>
          <Boton type="submit" variante="fantasma" disabled={quitando}>
            Quitar el logo
          </Boton>
        </form>
      )}
      <p className="text-xs text-texto-3">PNG, JPG o WebP de hasta 500 KB. Mejor con fondo transparente y horizontal.</p>
      <Resultado e={estado ?? quitado} />
    </div>
  )
}

const DISENOS = [
  { id: 'clasico', nombre: 'Clásico', detalle: 'Cuadros con borde, en blanco y negro.' },
  { id: 'moderno', nombre: 'Moderno', detalle: 'Franja de color, logo grande y tabla de color.' },
  { id: 'compacto', nombre: 'Compacto', detalle: 'Letra más chica y sin cuadros.' },
] as const

/** Miniatura del diseño: un esquema de la hoja, no una factura real. */
function Miniatura({ diseno, color }: { diseno: string; color: string }) {
  const moderno = diseno === 'moderno'
  const compacto = diseno === 'compacto'
  return (
    <div aria-hidden className="flex aspect-[3/4] w-full flex-col gap-1.5 rounded-md border border-borde bg-white p-2">
      <div
        className={`flex h-7 items-stretch ${compacto ? 'border-y border-neutral-300' : 'border border-neutral-700'} ${moderno ? 'overflow-hidden rounded' : ''}`}
        style={moderno ? { borderColor: color } : undefined}
      >
        <div className="flex-1" style={moderno ? { backgroundColor: `${color}22` } : undefined}>
          <div className="m-1 h-2 w-8 rounded-sm" style={{ backgroundColor: moderno ? color : '#a3a3a3' }} />
        </div>
        <div
          className="w-5 border-x border-neutral-700"
          style={moderno ? { backgroundColor: color, borderColor: color } : undefined}
        />
        <div className="flex-1" />
      </div>
      <div className={`h-4 ${compacto ? 'border-b border-neutral-300' : 'border border-neutral-700'}`} />
      <div className="h-2" style={{ backgroundColor: moderno ? color : compacto ? 'transparent' : '#e5e5e5' }} />
      {[...Array(compacto ? 6 : 4)].map((_, i) => (
        <div key={i} className={`border-b border-neutral-200 ${compacto ? 'h-1.5' : 'h-2'}`} />
      ))}
      <div className="mt-auto ml-auto h-5 w-1/2 border" style={{ borderColor: moderno ? color : '#404040' }} />
    </div>
  )
}

export function Diseno({ diseno, color }: { diseno: string; color: string }) {
  const [estado, accion, enviando] = useActionState(disenoAccion, undefined)
  const [elegido, setElegido] = useState(diseno)
  const [tono, setTono] = useState(color)
  return (
    <form action={accion} className="flex flex-col gap-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        {DISENOS.map((d) => (
          <label
            key={d.id}
            className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 ${elegido === d.id ? 'border-acento ring-1 ring-acento' : 'border-borde'}`}
          >
            <Miniatura diseno={d.id} color={tono} />
            <span className="flex items-center gap-2 font-medium">
              <input
                type="radio"
                name="diseno"
                value={d.id}
                checked={elegido === d.id}
                onChange={() => setElegido(d.id)}
                className="accent-acento"
              />
              {d.nombre}
            </span>
            <span className="text-xs text-texto-2">{d.detalle}</span>
          </label>
        ))}
      </div>
      <label className="flex items-center gap-3">
        <input type="color" name="color" value={tono} onChange={(e) => setTono(e.target.value)} className="h-9 w-14" />
        <span>Color de la empresa (se usa en el diseño Moderno)</span>
      </label>
      <Resultado e={estado} />
      <div>
        <Boton type="submit" variante="primario" disabled={enviando}>
          Guardar el diseño
        </Boton>
      </div>
    </form>
  )
}
