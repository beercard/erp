import type { Transaccion } from '../db/conexion'
import { auditoria } from '../db/schema'

export type Registro = {
  /** Nulo: lo hizo el sistema (tarea periódica, aviso de una tienda). */
  usuarioId: string | null
  accion: 'alta' | 'modificacion' | 'baja' | 'emision' | 'anulacion' | 'ingreso' | 'importacion'
  entidad: string
  entidadId?: string | null
  antes?: unknown
  despues?: unknown
}

/**
 * Deja constancia de una operación dentro de la MISMA transacción que la
 * hace: si la operación se revierte, el registro también, y no puede quedar
 * una operación sin registrar.
 */
export async function auditar(tx: Transaccion, registro: Registro) {
  await tx.insert(auditoria).values({
    usuarioId: registro.usuarioId,
    accion: registro.accion,
    entidad: registro.entidad,
    entidadId: registro.entidadId ?? null,
    antes: (registro.antes ?? null) as never,
    despues: (registro.despues ?? null) as never,
  })
}
