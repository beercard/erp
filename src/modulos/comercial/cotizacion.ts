import { and, desc, eq, lte } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { cotizaciones, cotizacionesEmpresa } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { normalizarNumero } from '../../lib/dinero'
import { hoyArgentina } from '../../lib/fechas'

/**
 * Cotización vigente de una moneda a una fecha: la que cargó la empresa (la
 * más reciente hasta esa fecha) y, si no cargó ninguna, la oficial del
 * sistema (BNA, cuando se sume la carga automática).
 */
export async function cotizacionVigente(
  tx: Transaccion,
  moneda: string,
  fecha: string = hoyArgentina(),
): Promise<{ valor: string; fecha: string; fuente: string } | null> {
  if (moneda === 'PES') return { valor: '1', fecha, fuente: 'pesos' }
  const [propia] = await tx
    .select()
    .from(cotizacionesEmpresa)
    .where(and(eq(cotizacionesEmpresa.moneda, moneda), lte(cotizacionesEmpresa.fecha, fecha)))
    .orderBy(desc(cotizacionesEmpresa.fecha))
    .limit(1)
  if (propia) return { valor: propia.valor, fecha: propia.fecha, fuente: 'empresa' }
  const [oficial] = await tx
    .select()
    .from(cotizaciones)
    .where(and(eq(cotizaciones.moneda, moneda), lte(cotizaciones.fecha, fecha)))
    .orderBy(desc(cotizaciones.fecha))
    .limit(1)
  return oficial ? { valor: oficial.valor, fecha: oficial.fecha, fuente: oficial.fuente } : null
}

const EsquemaCotizacion = z.object({
  moneda: z.enum(['DOL', '060']),
  fecha: z.iso.date(),
  valor: z
    .string()
    .trim()
    .transform((v) => normalizarNumero(v))
    .pipe(z.string().regex(/^\d+(\.\d{1,6})?$/, { error: 'Escribí la cotización (pesos por unidad).' }))
    .refine((v) => Number(v) > 0, { error: 'La cotización tiene que ser mayor que cero.' }),
})

export async function fijarCotizacion(tx: Transaccion, usuarioId: string, entrada: unknown) {
  const p = EsquemaCotizacion.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message }
  await tx
    .insert(cotizacionesEmpresa)
    .values({ ...p.data, usuarioId })
    .onConflictDoUpdate({
      target: [cotizacionesEmpresa.empresaId, cotizacionesEmpresa.moneda, cotizacionesEmpresa.fecha],
      set: { valor: p.data.valor, usuarioId },
    })
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'cotizacion', despues: p.data })
  return { ok: true as const }
}
