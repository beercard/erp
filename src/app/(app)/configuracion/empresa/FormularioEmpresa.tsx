'use client'

import { useActionState } from 'react'

import { Aviso, Boton, Campo, Panel, Selector } from '@/components/ui'

import { guardarEmpresaAccion } from './acciones'

export function FormularioEmpresa({
  inicial,
  provincias,
}: {
  inicial: Record<string, string | null>
  provincias: { valor: string; texto: string }[]
}) {
  const [estado, accion, enviando] = useActionState(guardarEmpresaAccion, undefined)
  const v = (c: string) => estado?.valores?.[c] ?? inicial[c] ?? ''
  const e = estado?.errores ?? {}
  return (
    <form action={accion} noValidate className="flex flex-col gap-4">
      {estado?.errores && <Aviso>Revisá los campos marcados.</Aviso>}
      <Panel className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Campo
          id="razonSocial"
          name="razonSocial"
          etiqueta="Razón social"
          defaultValue={v('razonSocial')}
          error={e.razonSocial}
          className="sm:col-span-2"
          required
        />
        <Campo id="nombreFantasia" name="nombreFantasia" etiqueta="Nombre de fantasía" defaultValue={v('nombreFantasia')} />
        <Selector
          id="condicionIva"
          name="condicionIva"
          etiqueta="Condición frente al IVA"
          opciones={[
            { valor: 1, texto: 'IVA Responsable Inscripto' },
            { valor: 4, texto: 'IVA Sujeto Exento' },
            { valor: 6, texto: 'Responsable Monotributo' },
          ]}
          defaultValue={v('condicionIva')}
          error={e.condicionIva}
        />
        <Selector
          id="iibbRegimen"
          name="iibbRegimen"
          etiqueta="Ingresos Brutos"
          vacio="Sin datos"
          opciones={[
            { valor: 'local', texto: 'Contribuyente local' },
            { valor: 'convenio', texto: 'Convenio Multilateral' },
            { valor: 'exento', texto: 'Exento' },
          ]}
          defaultValue={v('iibbRegimen')}
        />
        <Campo id="iibbNumero" name="iibbNumero" etiqueta="Número de IIBB" defaultValue={v('iibbNumero')} className="cifras" />
        <Campo
          id="inicioActividades"
          name="inicioActividades"
          type="date"
          etiqueta="Inicio de actividades"
          defaultValue={v('inicioActividades')}
          error={e.inicioActividades}
        />
        <Campo
          id="domicilioFiscal"
          name="domicilioFiscal"
          etiqueta="Domicilio fiscal"
          defaultValue={v('domicilioFiscal')}
          className="sm:col-span-2"
        />
        <Campo id="localidad" name="localidad" etiqueta="Localidad" defaultValue={v('localidad')} />
        <Campo id="codigoPostal" name="codigoPostal" etiqueta="Código postal" defaultValue={v('codigoPostal')} />
        <Selector
          id="provincia"
          name="provincia"
          etiqueta="Provincia"
          vacio="Elegí"
          opciones={provincias}
          defaultValue={v('provincia')}
        />
      </Panel>
      <p className="text-xs text-texto-2">
        Estos datos salen impresos en cada comprobante. Tienen que coincidir con los que figuran en ARCA.
      </p>
      <div className="flex justify-end">
        <Boton type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Grabando…' : 'Grabar'}
        </Boton>
      </div>
    </form>
  )
}
