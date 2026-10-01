import { and, asc, desc, eq, ilike, lte, or } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { alicuotasIva, articulos, listasPrecios, marcas, precios, rubros } from '../../db/schema'
import { aImporte, aplicarPorcentaje } from '../../lib/dinero'
import { hoyArgentina } from '../../lib/fechas'

export type FiltroArticulos = { q?: string; listaId?: string }

/** Listas activas; las derivadas indican de qué lista salen y con qué porcentaje. */
export async function listasDisponibles(tx: Transaccion) {
  return tx
    .select({
      id: listasPrecios.id,
      codigo: listasPrecios.codigo,
      nombre: listasPrecios.nombre,
      moneda: listasPrecios.moneda,
      listaBaseId: listasPrecios.listaBaseId,
      porcentaje: listasPrecios.porcentaje,
    })
    .from(listasPrecios)
    .where(eq(listasPrecios.activa, true))
    .orderBy(asc(listasPrecios.codigo))
}

/**
 * Precio vigente de cada artículo en una lista: el de mayor vigente_desde
 * hasta hoy. Si la lista es derivada, sale de su lista base con el
 * porcentaje aplicado (Tarjeta 3 cuotas = Lista general + 30 %).
 */
async function preciosVigentes(tx: Transaccion, listaId: string): Promise<Map<string, string>> {
  const [lista] = await tx.select().from(listasPrecios).where(eq(listasPrecios.id, listaId))
  if (!lista) return new Map()
  const origen = lista.listaBaseId ?? lista.id
  const filas = await tx
    .selectDistinctOn([precios.articuloId], { articuloId: precios.articuloId, precio: precios.precio })
    .from(precios)
    .where(and(eq(precios.listaId, origen), lte(precios.vigenteDesde, hoyArgentina())))
    .orderBy(precios.articuloId, desc(precios.vigenteDesde))
  return new Map(
    filas.map((f) => [
      f.articuloId,
      lista.listaBaseId && lista.porcentaje ? aImporte(aplicarPorcentaje(f.precio, lista.porcentaje)) : aImporte(f.precio),
    ]),
  )
}

export async function listarArticulos(tx: Transaccion, filtro: FiltroArticulos = {}, limite = 300) {
  const condiciones = [eq(articulos.activo, true)]
  const q = filtro.q?.trim()
  if (q) {
    const patron = `%${q}%`
    condiciones.push(or(ilike(articulos.nombre, patron), ilike(articulos.codigo, patron), ilike(articulos.codigoBarras, patron))!)
  }
  const filas = await tx
    .select({
      id: articulos.id,
      codigo: articulos.codigo,
      nombre: articulos.nombre,
      tipo: articulos.tipo,
      rubro: rubros.nombre,
      marca: marcas.nombre,
      iva: alicuotasIva.nombre,
      llevaStock: articulos.llevaStock,
      llevaSerie: articulos.llevaSerie,
      costo: articulos.costo,
      monedaCosto: articulos.monedaCosto,
    })
    .from(articulos)
    .innerJoin(alicuotasIva, eq(alicuotasIva.codigo, articulos.alicuotaIva))
    .leftJoin(rubros, eq(rubros.id, articulos.rubroId))
    .leftJoin(marcas, eq(marcas.id, articulos.marcaId))
    .where(and(...condiciones))
    .orderBy(asc(articulos.nombre))
    .limit(limite)
  const vigentes = filtro.listaId ? await preciosVigentes(tx, filtro.listaId) : new Map<string, string>()
  return filas.map((a) => ({ ...a, precio: vigentes.get(a.id) ?? null }))
}
