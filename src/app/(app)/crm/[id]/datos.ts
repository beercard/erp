import 'server-only'

import type { Transaccion } from '@/db/conexion'
import type { SesionConEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import {
  asegurarEtapas,
  etiquetasUsadas,
  listarMotivos,
  obtenerOportunidad,
  posiblesDuplicados,
  responsables,
} from '@/modulos/crm/crm'
import { datosParaPlantilla, listarPlantillas } from '@/modulos/crm/extras'

/** Todo lo que muestran la ficha y la vista rápida de una oportunidad. */
export async function cargarFicha(tx: Transaccion, sesion: SesionConEmpresa, id: string) {
  const o = await obtenerOportunidad(tx, id)
  if (!o) return null
  const puede = tienePermiso(sesion.permisos, 'crm.oportunidades')
  return {
    o,
    etapas: await asegurarEtapas(tx),
    motivos: await listarMotivos(tx),
    personas: await responsables(tx, sesion.empresa.id),
    etiquetas: await etiquetasUsadas(tx),
    duplicados: o.estado === 'abierta' ? await posiblesDuplicados(tx, id) : { clientes: [], oportunidades: [] },
    plantillas: puede
      ? (await listarPlantillas(tx)).map((p) => ({
          id: p.id,
          nombre: p.nombre,
          canal: p.canal,
          asunto: p.asunto,
          texto: p.texto,
        }))
      : [],
    variables: puede ? await datosParaPlantilla(tx, id, sesion.usuario.id, sesion.empresa.razonSocial) : {},
    puede,
  }
}

export type DatosFicha = NonNullable<Awaited<ReturnType<typeof cargarFicha>>>
