import { desc, eq, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { cuentasTesoreria, movimientosTesoreria, usuarios, vales } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { aImporte, D, monto } from '../../lib/dinero'
import { decimal, primerError } from '../comercial/documentos'
import { siguienteNumero } from '../comercial/numeracion'
import { filasDe } from '../compras/compras'
import { controlarBloqueo } from '../empresa/bloqueos'
import { cajaCerrada } from './cuentas'

/**
 * Vales a rendir: plata que sale de la caja para una persona (compras chicas,
 * viáticos, un trámite). Al rendir se cargan los gastos con su comprobante:
 * lo que sobra vuelve a la caja y lo que puso de más se le reintegra.
 */

const texto = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)

const positivo = (mensaje: string) => decimal(mensaje).refine((v) => Number(v) > 0, { error: mensaje })

const EsquemaVale = z.object({
  cuentaId: z.uuid({ error: 'Elegí la caja.' }),
  persona: z.string().trim().min(2, { error: 'Escribí a quién se le da el vale.' }),
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  importe: positivo('Escribí el importe del vale.'),
  motivo: texto,
})

type Resultado = { ok: true; id: string; numero?: number } | { ok: false; error: string }

async function cajaDelVale(tx: Transaccion, cuentaId: string) {
  const [c] = await tx.select().from(cuentasTesoreria).where(eq(cuentasTesoreria.id, cuentaId))
  if (!c || !c.activa) return { ok: false as const, error: 'Esa caja no existe o está inactiva.' }
  if (c.tipo !== 'caja') return { ok: false as const, error: 'Los vales salen de una caja.' }
  const cerrada = await cajaCerrada(tx, c)
  if (cerrada) return { ok: false as const, error: cerrada }
  return { ok: true as const, caja: c }
}

/** Entrega un vale: sale la plata de la caja. */
export async function entregarVale(tx: Transaccion, usuarioId: string, entrada: unknown): Promise<Resultado> {
  const p = EsquemaVale.safeParse(entrada)
  if (!p.success) return { ok: false, error: primerError(p.error) }
  const d = p.data
  const cerrado = await controlarBloqueo(tx, 'tesoreria', d.fecha)
  if (cerrado) return { ok: false, error: cerrado }
  const c = await cajaDelVale(tx, d.cuentaId)
  if (!c.ok) return c
  const numero = await siguienteNumero(tx, 'vale')
  const [m] = await tx
    .insert(movimientosTesoreria)
    .values({
      cuentaId: d.cuentaId,
      fecha: d.fecha,
      importe: aImporte(monto(d.importe).negated()),
      tipo: 'vale',
      concepto: `Vale a rendir N° ${numero}`,
      detalle: `${d.persona}${d.motivo ? ` · ${d.motivo}` : ''}`,
      usuarioId,
    })
    .returning()
  const [v] = await tx
    .insert(vales)
    .values({
      numero,
      cuentaId: d.cuentaId,
      persona: d.persona,
      fecha: d.fecha,
      importe: aImporte(d.importe),
      motivo: d.motivo,
      movimientoId: m.id,
      usuarioId,
    })
    .returning()
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'vale', entidadId: v.id, despues: { numero, ...d } })
  return { ok: true, id: v.id, numero }
}

const EsquemaRendicion = z.object({
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  gastos: z
    .array(
      z.object({
        concepto: z.string().trim().min(2, { error: 'Escribí en qué se gastó.' }),
        importe: positivo('Importe del gasto inválido.'),
        comprobante: texto,
      }),
    )
    .max(50),
})

/**
 * Rinde un vale: se cargan los gastos. Si sobró plata vuelve a la caja; si
 * gastó más que el vale, se le reintegra la diferencia desde la caja.
 */
export async function rendirVale(tx: Transaccion, usuarioId: string, id: string, entrada: unknown): Promise<Resultado> {
  const p = EsquemaRendicion.safeParse(entrada)
  if (!p.success) return { ok: false, error: primerError(p.error) }
  const d = p.data
  const [v] = await tx.select().from(vales).where(eq(vales.id, id)).for('update')
  if (!v) return { ok: false, error: 'Ese vale ya no existe.' }
  if (v.estado !== 'abierto') return { ok: false, error: 'El vale ya está rendido o anulado.' }
  if (d.fecha < v.fecha) return { ok: false, error: 'La rendición no puede ser anterior al vale.' }
  const cerrado = await controlarBloqueo(tx, 'tesoreria', d.fecha)
  if (cerrado) return { ok: false, error: cerrado }
  const gastado = d.gastos.reduce((s, g) => s.plus(g.importe), new D(0))
  const devuelto = monto(v.importe).minus(gastado)
  let movimientoRendicionId: string | null = null
  if (!devuelto.isZero()) {
    const c = await cajaDelVale(tx, v.cuentaId)
    if (!c.ok) return c
    const [m] = await tx
      .insert(movimientosTesoreria)
      .values({
        cuentaId: v.cuentaId,
        fecha: d.fecha,
        importe: aImporte(devuelto),
        tipo: 'rendicion_vale',
        concepto: devuelto.gt(0) ? `Devolución del vale N° ${v.numero}` : `Reintegro del vale N° ${v.numero}`,
        detalle: v.persona,
        usuarioId,
      })
      .returning()
    movimientoRendicionId = m.id
  }
  await tx
    .update(vales)
    .set({
      estado: 'rendido',
      gastos: d.gastos.map((g) => ({ concepto: g.concepto, importe: aImporte(g.importe), comprobante: g.comprobante })),
      gastado: aImporte(gastado),
      devuelto: aImporte(devuelto),
      movimientoRendicionId,
      fechaRendicion: d.fecha,
      rendidoPor: usuarioId,
    })
    .where(eq(vales.id, id))
  await auditar(tx, {
    usuarioId,
    accion: 'modificacion',
    entidad: 'vale',
    entidadId: id,
    despues: { rendicion: d, devuelto: aImporte(devuelto) },
  })
  return { ok: true, id }
}

/** Anula un vale que todavía no se rindió (se cargó mal o no se entregó): la plata vuelve a la caja. */
export async function anularVale(tx: Transaccion, usuarioId: string, id: string): Promise<Resultado> {
  const [v] = await tx.select().from(vales).where(eq(vales.id, id)).for('update')
  if (!v) return { ok: false, error: 'Ese vale ya no existe.' }
  if (v.estado !== 'abierto') return { ok: false, error: 'Solo se anulan vales sin rendir.' }
  const cerrado = await controlarBloqueo(tx, 'tesoreria', v.fecha)
  if (cerrado) return { ok: false, error: cerrado }
  if (v.movimientoId) {
    await tx
      .update(movimientosTesoreria)
      .set({ estado: 'anulado', anulado: new Date(), anuladoPor: usuarioId })
      .where(eq(movimientosTesoreria.id, v.movimientoId))
  }
  await tx.update(vales).set({ estado: 'anulado' }).where(eq(vales.id, id))
  await auditar(tx, { usuarioId, accion: 'anulacion', entidad: 'vale', entidadId: id })
  return { ok: true, id }
}

export async function listarVales(tx: Transaccion, filtro: { estado?: 'abierto' | 'rendido' | 'anulado' } = {}) {
  return tx
    .select({
      id: vales.id,
      numero: vales.numero,
      persona: vales.persona,
      fecha: vales.fecha,
      importe: vales.importe,
      motivo: vales.motivo,
      estado: vales.estado,
      gastado: vales.gastado,
      devuelto: vales.devuelto,
      fechaRendicion: vales.fechaRendicion,
      gastos: vales.gastos,
      caja: cuentasTesoreria.nombre,
      entrego: usuarios.nombre,
    })
    .from(vales)
    .innerJoin(cuentasTesoreria, eq(cuentasTesoreria.id, vales.cuentaId))
    .leftJoin(usuarios, eq(usuarios.id, vales.usuarioId))
    .where(filtro.estado ? eq(vales.estado, filtro.estado) : undefined)
    .orderBy(desc(vales.fecha), desc(vales.numero))
    .limit(300)
}

/** Gastos rendidos por concepto en un período (para el informe de caja). */
export async function gastosPorConcepto(tx: Transaccion, desde: string, hasta: string) {
  return filasDe<{ concepto: string; total: string; cantidad: number }>(
    await tx.execute(sql`
      select g->>'concepto' as concepto, sum((g->>'importe')::numeric)::text as total, count(*)::int as cantidad
      from vales v, jsonb_array_elements(v.gastos) g
      where v.estado = 'rendido' and v.fecha_rendicion between ${desde}::date and ${hasta}::date
      group by 1 order by sum((g->>'importe')::numeric) desc`),
  ).map((f) => ({ ...f, total: aImporte(f.total) }))
}
