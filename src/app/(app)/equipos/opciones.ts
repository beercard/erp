import { asc, eq } from 'drizzle-orm'

import type { Transaccion } from '@/db/conexion'
import { contratos, terceros } from '@/db/schema'
import { listarModelos } from '@/modulos/contratos/contratos'

/** Modelos y contratos activos para el formulario del equipo. */
export async function opcionesEquipo(tx: Transaccion) {
  const [modelos, activos] = await Promise.all([
    listarModelos(tx),
    tx
      .select({ id: contratos.id, numero: contratos.numero, cliente: terceros.razonSocial })
      .from(contratos)
      .innerJoin(terceros, eq(terceros.id, contratos.terceroId))
      .where(eq(contratos.estado, 'activo'))
      .orderBy(asc(terceros.razonSocial), asc(contratos.numero)),
  ])
  return {
    modelos: modelos.map((m) => ({ valor: m.id, texto: m.nombre })),
    contratos: activos.map((c) => ({ valor: c.id, texto: `${c.cliente} · contrato ${c.numero}` })),
  }
}
