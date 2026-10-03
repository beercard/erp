import { and, asc, count, desc, eq, getTableColumns, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { comoPlataforma } from '../../db/empresa'
import {
  articulos,
  canalesVenta,
  cuentasCanal,
  depositos,
  listasPrecios,
  pedidosCanal,
  publicacionesCanal,
  cuentasTesoreria,
  puntosVenta,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { cifrar, descifrar } from '../arca/certificado'
import { SIN_PRECIOS, type TipoCanal } from './tipos'

/** Canales de venta: alta (al volver de la plataforma), configuración y baja. */

export type Canal = typeof canalesVenta.$inferSelect

export function credencialesDe<T>(canal: Pick<Canal, 'credenciales'>): T {
  return JSON.parse(descifrar(canal.credenciales)) as T
}

export async function guardarCredenciales(tx: Transaccion, canalId: string, credenciales: unknown) {
  await tx
    .update(canalesVenta)
    .set({ credenciales: cifrar(JSON.stringify(credenciales)), actualizado: new Date() })
    .where(eq(canalesVenta.id, canalId))
}

/**
 * Conecta (o reconecta) una cuenta. Una misma cuenta no puede estar en dos
 * empresas: los avisos de la plataforma tienen que saber a cuál ir.
 */
export async function conectarCanal(
  tx: Transaccion,
  usuarioId: string | null,
  d: { tipo: TipoCanal; nombre: string; cuenta: string; credenciales: unknown; secretoAvisos?: string },
) {
  const [otra] = await tx
    .select()
    .from(cuentasCanal)
    .where(and(eq(cuentasCanal.tipo, d.tipo), eq(cuentasCanal.cuenta, d.cuenta)))
  const [existente] = await tx
    .select()
    .from(canalesVenta)
    .where(and(eq(canalesVenta.tipo, d.tipo), eq(canalesVenta.cuenta, d.cuenta)))
  if (otra && otra.canalId !== existente?.id) {
    return { ok: false as const, error: 'Esa cuenta ya está conectada a otra empresa. Desconectala ahí primero.' }
  }
  const valores = {
    nombre: d.nombre,
    estado: 'conectado',
    credenciales: cifrar(JSON.stringify(d.credenciales)),
    secretoAvisos: d.secretoAvisos ? cifrar(d.secretoAvisos) : (existente?.secretoAvisos ?? null),
    ultimoError: null,
    actualizado: new Date(),
  }
  let canal: Canal
  if (existente) {
    ;[canal] = await tx.update(canalesVenta).set(valores).where(eq(canalesVenta.id, existente.id)).returning()
  } else {
    ;[canal] = await tx
      .insert(canalesVenta)
      .values({ ...valores, tipo: d.tipo, cuenta: d.cuenta })
      .returning()
  }
  if (!otra)
    await tx.insert(cuentasCanal).values({ tipo: d.tipo, cuenta: d.cuenta, empresaId: canal.empresaId, canalId: canal.id })
  await auditar(tx, {
    usuarioId,
    accion: existente ? 'modificacion' : 'alta',
    entidad: 'canal_venta',
    entidadId: canal.id,
    despues: { tipo: d.tipo, cuenta: d.cuenta, nombre: d.nombre },
  })
  return { ok: true as const, id: canal.id, nuevo: !existente }
}

/** Borra las credenciales y suelta la cuenta; publicaciones y pedidos quedan como historia. */
export async function desconectarCanal(tx: Transaccion, usuarioId: string | null, id: string) {
  const [c] = await tx.select().from(canalesVenta).where(eq(canalesVenta.id, id))
  if (!c) return { ok: false as const, error: 'Ese canal ya no existe.' }
  await tx
    .update(canalesVenta)
    .set({ estado: 'desconectado', credenciales: cifrar('{}'), secretoAvisos: null, actualizado: new Date() })
    .where(eq(canalesVenta.id, id))
  await tx.delete(cuentasCanal).where(eq(cuentasCanal.canalId, id))
  await auditar(tx, {
    usuarioId,
    accion: 'baja',
    entidad: 'canal_venta',
    entidadId: id,
    antes: { tipo: c.tipo, cuenta: c.cuenta },
  })
  return { ok: true as const }
}

const uuidONulo = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable())

const EsquemaConfig = z.object({
  nombre: z.string().trim().min(2, { error: 'Escribí un nombre para el canal.' }).max(60),
  listaPreciosId: uuidONulo,
  depositoId: uuidONulo,
  enviarStock: z.boolean(),
  enviarPrecios: z.boolean(),
  traerPedidos: z.boolean(),
  facturarSolo: z.boolean().default(false),
  cuentaCobroId: uuidONulo,
  puntoVenta: z.coerce.number().int().min(1).max(99998).nullable().optional().default(null),
})

export async function configurarCanal(tx: Transaccion, usuarioId: string, id: string, entrada: unknown) {
  const p = EsquemaConfig.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message }
  const [canal] = await tx.select({ tipo: canalesVenta.tipo }).from(canalesVenta).where(eq(canalesVenta.id, id))
  if (p.data.enviarPrecios && canal && SIN_PRECIOS.includes(canal.tipo as TipoCanal)) {
    return { ok: false as const, error: 'A esta plataforma el ERP le manda el stock; los precios se cargan en la tienda.' }
  }
  if (p.data.facturarSolo && !p.data.traerPedidos) {
    return { ok: false as const, error: 'Para facturar solo, la tienda tiene que traer los pedidos.' }
  }
  if (p.data.enviarPrecios && !p.data.listaPreciosId) {
    return { ok: false as const, error: 'Para mandar precios, elegí de qué lista salen.' }
  }
  const [antes] = await tx.select().from(canalesVenta).where(eq(canalesVenta.id, id))
  if (!antes) return { ok: false as const, error: 'Ese canal ya no existe.' }
  await tx
    .update(canalesVenta)
    .set({ ...p.data, actualizado: new Date() })
    .where(eq(canalesVenta.id, id))
  await auditar(tx, {
    usuarioId,
    accion: 'modificacion',
    entidad: 'canal_venta',
    entidadId: id,
    antes: { ...antes, credenciales: undefined, secretoAvisos: undefined },
    despues: p.data,
  })
  return { ok: true as const }
}

export async function listarCanales(tx: Transaccion) {
  const canales = await tx.select().from(canalesVenta).orderBy(asc(canalesVenta.creado))
  const pubs = await tx
    .select({
      canalId: publicacionesCanal.canalId,
      total: count(),
      vinculadas: sql<number>`count(${publicacionesCanal.articuloId})::int`,
    })
    .from(publicacionesCanal)
    .where(eq(publicacionesCanal.activa, true))
    .groupBy(publicacionesCanal.canalId)
  const peds = await tx
    .select({
      canalId: pedidosCanal.canalId,
      importados: sql<number>`count(*) filter (where ${pedidosCanal.estado} = 'importado')::int`,
      errores: sql<number>`count(*) filter (where ${pedidosCanal.estado} = 'error')::int`,
    })
    .from(pedidosCanal)
    .groupBy(pedidosCanal.canalId)
  return canales.map((c) => ({
    ...sinSecretos(c),
    publicaciones: pubs.find((p) => p.canalId === c.id)?.total ?? 0,
    vinculadas: pubs.find((p) => p.canalId === c.id)?.vinculadas ?? 0,
    importados: peds.find((p) => p.canalId === c.id)?.importados ?? 0,
    errores: peds.find((p) => p.canalId === c.id)?.errores ?? 0,
  }))
}

export const sinSecretos = (c: Canal) => {
  const { credenciales: _c, secretoAvisos: _s, ...resto } = c
  void _c
  void _s
  return resto
}

export async function obtenerCanal(tx: Transaccion, id: string) {
  const [c] = await tx.select().from(canalesVenta).where(eq(canalesVenta.id, id))
  if (!c) return null
  const [listas, deps, cuentas, pvs, publicaciones, pedidos] = await Promise.all([
    tx.select({ id: listasPrecios.id, nombre: listasPrecios.nombre, incluyeIva: listasPrecios.incluyeIva }).from(listasPrecios),
    tx.select({ id: depositos.id, nombre: depositos.nombre }).from(depositos),
    tx
      .select({ id: cuentasTesoreria.id, nombre: cuentasTesoreria.nombre })
      .from(cuentasTesoreria)
      .where(and(eq(cuentasTesoreria.activa, true), eq(cuentasTesoreria.moneda, 'PES'))),
    tx
      .select({ numero: puntosVenta.numero, nombre: puntosVenta.nombre })
      .from(puntosVenta)
      .where(and(eq(puntosVenta.activo, true), eq(puntosVenta.tipo, 'electronico'))),
    tx
      .select({ ...getTableColumns(publicacionesCanal), articuloCodigo: articulos.codigo })
      .from(publicacionesCanal)
      .leftJoin(articulos, eq(articulos.id, publicacionesCanal.articuloId))
      .where(eq(publicacionesCanal.canalId, id))
      .orderBy(sql`${publicacionesCanal.articuloId} is not null`, asc(publicacionesCanal.titulo)),
    tx.select().from(pedidosCanal).where(eq(pedidosCanal.canalId, id)).orderBy(desc(pedidosCanal.creado)).limit(100),
  ])
  return { canal: sinSecretos(c), listas, depositos: deps, cuentas, puntosVenta: pvs, publicaciones, pedidos }
}

export async function vincularPublicacion(tx: Transaccion, usuarioId: string, id: string, articuloId: string | null) {
  const [p] = await tx
    .update(publicacionesCanal)
    .set({ articuloId, stockEnviado: null, precioEnviado: null, error: null, actualizado: new Date() })
    .where(eq(publicacionesCanal.id, id))
    .returning()
  if (!p) return { ok: false as const, error: 'Esa publicación ya no existe.' }
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'publicacion_canal', entidadId: id, despues: { articuloId } })
  return { ok: true as const }
}

/** Para los avisos sin sesión: a qué empresa y canal va una cuenta (o un canal). */
export async function buscarCuenta(filtro: { tipo: TipoCanal; cuenta: string } | { canalId: string }) {
  return comoPlataforma(async (tx) => {
    const [c] = await tx
      .select()
      .from(cuentasCanal)
      .where(
        'canalId' in filtro
          ? eq(cuentasCanal.canalId, filtro.canalId)
          : and(eq(cuentasCanal.tipo, filtro.tipo), eq(cuentasCanal.cuenta, filtro.cuenta)),
      )
    return c ?? null
  })
}
