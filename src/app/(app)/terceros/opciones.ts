import type { Transaccion } from '@/db/conexion'
import { opcionesTercero } from '@/modulos/maestros/terceros'

import type { OpcionesFormulario } from './FormularioTercero'

/** Opciones del formulario en el formato de los desplegables. */
export async function opcionesFormulario(tx: Transaccion): Promise<OpcionesFormulario> {
  const o = await opcionesTercero(tx)
  return {
    ivas: o.ivas.map((x) => ({ valor: x.codigo, texto: x.nombre })),
    documentos: o.documentos.map((x) => ({ valor: x.codigo, texto: x.nombre })),
    provincias: o.provincias.map((x) => ({ valor: x.codigo, texto: x.nombre })),
    listas: o.listas.map((x) => ({ valor: x.id, texto: x.nombre })),
    vendedores: o.vendedores.map((x) => ({ valor: x.id, texto: x.nombre })),
    condiciones: o.condiciones.map((x) => ({ valor: x.id, texto: x.nombre })),
    zonas: o.zonas.map((x) => ({ valor: x.id, texto: x.nombre })),
    transportes: o.transportes.map((x) => ({ valor: x.id, texto: x.nombre })),
  }
}
