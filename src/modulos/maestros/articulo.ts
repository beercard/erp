import { and, asc, desc, eq, lte, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { alicuotasIva, articulos, listasPrecios, marcas, monedas, precios, rubros } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { aImporte, aplicarPorcentaje, normalizarNumero } from '../../lib/dinero'
import { hoyArgentina } from '../../lib/fechas'

/** Alta y modificación de artículos y sus precios (con historial). */

const texto = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()
  .optional()
const uuid = z
  .string()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable())
  .optional()
const decimal = (mensaje = 'Escribí un número.') =>
  z
    .string()
    .trim()
    .transform((v) => normalizarNumero(v) || null)
    .pipe(
      z
        .string()
        .regex(/^\d+(\.\d{1,4})?$/, { error: mensaje })
        .nullable(),
    )
    .optional()

export const EsquemaArticulo = z.object({
  codigo: z.string().trim().min(1, { error: 'Escribí el código.' }).max(40),
  nombre: z.string().trim().min(2, { error: 'Escribí el nombre.' }),
  descripcion: texto,
  tipo: z.enum(['producto', 'servicio']),
  rubroId: uuid,
  marcaId: uuid,
  unidad: z.string().trim().min(1).default('unidad'),
  alicuotaIva: z.coerce.number().int(),
  llevaStock: z.boolean(),
  llevaSerie: z.boolean(),
  codigoBarras: texto,
  costo: decimal('El costo tiene que ser un número positivo (hasta 4 decimales).'),
  monedaCosto: z.string().min(3),
  stockMinimo: decimal(),
})

export type DatosArticulo = z.infer<typeof EsquemaArticulo>
export type ResultadoArticulo =
  { ok: true; id: string } | { ok: false; errores: Partial<Record<keyof DatosArticulo, string>>; mensaje?: string }

export async function guardarArticulo(
  tx: Transaccion,
  usuarioId: string,
  entrada: unknown,
  id?: string,
): Promise<ResultadoArticulo> {
  const p = EsquemaArticulo.safeParse(entrada)
  if (!p.success) {
    const errores: Partial<Record<keyof DatosArticulo, string>> = {}
    for (const i of p.error.issues) errores[i.path[0] as keyof DatosArticulo] ??= i.message
    return { ok: false, errores }
  }
  // Un servicio no lleva stock ni número de serie.
  const datos = p.data.tipo === 'servicio' ? { ...p.data, llevaStock: false, llevaSerie: false } : p.data
  try {
    if (id) {
      const [antes] = await tx.select().from(articulos).where(eq(articulos.id, id))
      if (!antes) return { ok: false, errores: {}, mensaje: 'Ese artículo ya no existe.' }
      const [despues] = await tx.update(articulos).set(datos).where(eq(articulos.id, id)).returning()
      await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'articulo', entidadId: id, antes, despues })
      return { ok: true, id }
    }
    const [nuevo] = await tx.insert(articulos).values(datos).returning()
    await auditar(tx, { usuarioId, accion: 'alta', entidad: 'articulo', entidadId: nuevo.id, despues: nuevo })
    return { ok: true, id: nuevo.id }
  } catch (e) {
    const m = (e as { cause?: { message?: string } }).cause?.message ?? ''
    if (m.includes('articulos_empresa_id_codigo'))
      return { ok: false, errores: { codigo: 'Ese código ya lo tiene otro artículo.' } }
    throw e
  }
}

export async function opcionesArticulo(tx: Transaccion) {
  const [rbs, mcs, ivas, mons] = await Promise.all([
    tx.select({ valor: rubros.id, texto: rubros.nombre }).from(rubros).where(eq(rubros.activo, true)).orderBy(asc(rubros.nombre)),
    tx.select({ valor: marcas.id, texto: marcas.nombre }).from(marcas).where(eq(marcas.activa, true)).orderBy(asc(marcas.nombre)),
    tx
      .select({ valor: alicuotasIva.codigo, texto: alicuotasIva.nombre })
      .from(alicuotasIva)
      .orderBy(asc(alicuotasIva.porcentaje)),
    tx.select({ valor: monedas.codigo, texto: monedas.nombre }).from(monedas),
  ])
  return { rubros: rbs, marcas: mcs, alicuotas: ivas, monedas: mons }
}

export type PrecioDeLista = {
  listaId: string
  lista: string
  moneda: string
  derivada: boolean
  porcentaje: string | null
  base: string | null
  vigente: string | null
  desde: string | null
  /** En una lista derivada: el artículo tiene un precio propio que reemplaza al calculado. */
  especial: boolean
  /** Últimos cambios (solo en listas base). */
  historial: { precio: string; desde: string; moneda: string }[]
  /** Precio que entra en vigencia más adelante, si hay. */
  programado: { precio: string; desde: string; moneda: string } | null
}

/** Precio de un artículo en cada lista activa, con historial y lo programado. */
export async function preciosDeArticulo(tx: Transaccion, articuloId: string): Promise<PrecioDeLista[]> {
  const listas = await tx.select().from(listasPrecios).where(eq(listasPrecios.activa, true)).orderBy(asc(listasPrecios.codigo))
  const filas = await tx
    .select({ listaId: precios.listaId, precio: precios.precio, desde: precios.vigenteDesde, moneda: precios.moneda })
    .from(precios)
    .where(eq(precios.articuloId, articuloId))
    .orderBy(desc(precios.vigenteDesde))
  const hoy = hoyArgentina()
  const deLista = (id: string) => filas.filter((f) => f.listaId === id)
  const vigenteDe = (id: string) => deLista(id).find((f) => f.desde <= hoy) ?? null

  return listas.map((l) => {
    const origen = l.listaBaseId ?? l.id
    // En una derivada, un precio cargado en la propia lista (especial) manda sobre el calculado.
    const propio = l.listaBaseId ? vigenteDe(l.id) : null
    const v = propio ?? vigenteDe(origen)
    const futuro =
      deLista(origen)
        .filter((f) => f.desde > hoy)
        .at(-1) ?? null
    const monedaLista = listas.find((x) => x.id === origen)?.moneda ?? l.moneda
    const ajustar = (precio: string) =>
      l.listaBaseId && l.porcentaje ? aImporte(aplicarPorcentaje(precio, l.porcentaje)) : aImporte(precio)
    return {
      listaId: l.id,
      lista: l.nombre,
      moneda: v?.moneda ?? (propio ? l.moneda : monedaLista),
      derivada: Boolean(l.listaBaseId),
      porcentaje: l.porcentaje,
      base: l.listaBaseId ? (listas.find((x) => x.id === l.listaBaseId)?.nombre ?? null) : null,
      vigente: propio ? aImporte(propio.precio) : v ? ajustar(v.precio) : null,
      especial: Boolean(propio),
      desde: v?.desde ?? null,
      historial: l.listaBaseId
        ? []
        : deLista(l.id)
            .filter((f) => f.desde <= hoy)
            .slice(0, 5)
            .map((f) => ({ precio: aImporte(f.precio), desde: f.desde, moneda: f.moneda ?? monedaLista })),
      programado: futuro ? { precio: ajustar(futuro.precio), desde: futuro.desde, moneda: futuro.moneda ?? monedaLista } : null,
    }
  })
}

const EsquemaPrecio = z.object({
  precio: z
    .string()
    .trim()
    .transform((v) => normalizarNumero(v))
    .pipe(z.string().regex(/^\d+(\.\d{1,4})?$/, { error: 'Escribí un precio válido.' })),
  desde: z.iso.date({ error: 'Elegí la fecha desde la que rige.' }),
  moneda: z.enum(['PES', 'DOL', '060']).optional(),
})

/**
 * Fija el precio de un artículo en una lista desde una fecha. Queda el
 * historial: no se pisa el precio anterior, salvo que sea de la misma fecha.
 * En una lista derivada queda como precio especial: reemplaza al calculado
 * hasta que se quite.
 */
export async function fijarPrecio(
  tx: Transaccion,
  usuarioId: string,
  articuloId: string,
  listaId: string,
  entrada: { precio: unknown; desde: unknown; moneda?: unknown },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = EsquemaPrecio.safeParse({ ...entrada, moneda: entrada.moneda || undefined })
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const [lista] = await tx.select().from(listasPrecios).where(eq(listasPrecios.id, listaId))
  if (!lista) return { ok: false, error: 'Esa lista ya no existe.' }
  const [anterior] = await tx
    .select({ precio: precios.precio, desde: precios.vigenteDesde })
    .from(precios)
    .where(and(eq(precios.listaId, listaId), eq(precios.articuloId, articuloId), lte(precios.vigenteDesde, p.data.desde)))
    .orderBy(desc(precios.vigenteDesde))
    .limit(1)
  await tx
    .insert(precios)
    .values({ listaId, articuloId, precio: p.data.precio, moneda: p.data.moneda ?? null, vigenteDesde: p.data.desde })
    .onConflictDoUpdate({
      target: [precios.empresaId, precios.listaId, precios.articuloId, precios.vigenteDesde],
      set: { precio: p.data.precio, moneda: p.data.moneda ?? null, actualizado: sql`now()` },
    })
  await auditar(tx, {
    usuarioId,
    accion: 'modificacion',
    entidad: 'precio',
    entidadId: articuloId,
    antes: anterior ?? null,
    despues: {
      lista: lista.nombre,
      precio: p.data.precio,
      moneda: p.data.moneda ?? lista.moneda,
      desde: p.data.desde,
      especial: Boolean(lista.listaBaseId),
    },
  })
  return { ok: true }
}

/** Quita el precio especial de un artículo en una lista derivada: vuelve a calcularse. */
export async function quitarPrecioEspecial(
  tx: Transaccion,
  usuarioId: string,
  articuloId: string,
  listaId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [lista] = await tx.select().from(listasPrecios).where(eq(listasPrecios.id, listaId))
  if (!lista?.listaBaseId) return { ok: false, error: 'Solo las listas calculadas tienen precios especiales.' }
  const borrados = await tx
    .delete(precios)
    .where(and(eq(precios.listaId, listaId), eq(precios.articuloId, articuloId)))
    .returning()
  await auditar(tx, {
    usuarioId,
    accion: 'baja',
    entidad: 'precio',
    entidadId: articuloId,
    antes: { lista: lista.nombre, precios: borrados },
  })
  return { ok: true }
}
