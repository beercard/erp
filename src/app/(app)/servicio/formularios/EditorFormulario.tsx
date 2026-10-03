'use client'

import { Eye, Pencil } from 'lucide-react'
import { useActionState, useState } from 'react'

import { FormularioDinamico } from '@/components/servicio/FormularioDinamico'
import { Aviso, Boton } from '@/components/ui'
import type { Campo } from '@/modulos/servicio/formularios'

import { EditorCampos, limpiar, type CampoEditado } from '../tipos/EditorTipo'
import { guardarFormularioAccion } from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'

export type DatosFormulario = {
  codigo: string
  nombre: string
  descripcion: string | null
  color: string
  pideCliente: boolean
  tecnico: boolean
  portal: boolean
  activo: boolean
  campos: Campo[]
}

export function EditorFormulario({ id, inicial }: { id: string | null; inicial: DatosFormulario }) {
  const [estado, accion, enviando] = useActionState(guardarFormularioAccion.bind(null, id), undefined)
  const [campos, setCampos] = useState<CampoEditado[]>(inicial.campos)
  const [vista, setVista] = useState(false)
  return (
    <form action={accion} className="flex flex-col gap-5">
      <input type="hidden" name="campos" value={JSON.stringify(limpiar(campos))} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Código</span>
          <input name="codigo" defaultValue={inicial.codigo} required maxLength={12} className={`${control} uppercase`} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={etiqueta}>Nombre</span>
          <input name="nombre" defaultValue={inicial.nombre} required className={control} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          <span className={etiqueta}>Para qué es (lo ve quien lo completa)</span>
          <input name="descripcion" defaultValue={inicial.descripcion ?? ''} className={control} />
        </label>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="pideCliente" defaultChecked={inicial.pideCliente} /> Es de un cliente (pide elegirlo)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="tecnico" defaultChecked={inicial.tecnico} /> Lo completan los técnicos
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="portal" defaultChecked={inicial.portal} /> Lo completan los clientes en el portal
        </label>
        <label className="flex items-center gap-2">
          <input type="color" name="color" defaultValue={inicial.color} className="h-8 w-10 rounded border border-borde" /> Color
        </label>
        {id && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="activo" defaultChecked={inicial.activo} /> Activo
          </label>
        )}
      </div>

      <section className="rounded-lg border border-borde p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Campos</h3>
          <Boton type="button" onClick={() => setVista(!vista)}>
            {vista ? <Pencil aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
            {vista ? 'Editar' : 'Vista previa'}
          </Boton>
        </div>
        {vista ? (
          <FormularioDinamico campos={limpiar(campos)} nombre="_vista" />
        ) : (
          <EditorCampos campos={campos} cambiar={setCampos} donde="suelto" otros={[]} />
        )}
      </section>

      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <div>
        <Boton type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Guardando…' : id ? 'Guardar' : 'Crear el formulario'}
        </Boton>
        {id && (
          <p className="mt-2 text-xs text-texto-3">
            Si cambiás los campos se crea una versión nueva: lo ya enviado se sigue viendo como se completó.
          </p>
        )}
      </div>
    </form>
  )
}
