import { and, asc, desc, eq, ilike, inArray, lte, or } from 'drizzle-orm'

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

export type PrecioVigente = { precio: string; moneda: string; especial: boolean }

async function vigentesDeLista(tx: Transaccion, listaId: string, articuloIds?: string[]) {
  return tx
    .selectDistinctOn([precios.articuloId], { articuloId: precios.articuloId, precio: precios.precio, moneda: precios.moneda })
    .from(precios)
    .where(
      and(
        eq(precios.listaId, listaId),
        lte(precios.vigenteDesde, hoyArgentina()),
        articuloIds ? inArray(precios.articuloId, articuloIds) : undefined,
      ),
    )
    .orderBy(precios.articuloId, desc(precios.vigenteDesde))
}

/**
 * Precio vigente de cada artículo en una lista: el de mayor vigente_desde
 * hasta hoy. Si la lista es derivada, sale de su lista base con el
 * porcentaje aplicado (Tarjeta 3 cuotas = Lista general + 30 %), salvo que
 * el artículo tenga un precio especial cargado en la propia lista derivada:
 * ese manda.
 */
export async function preciosVigentes(
  tx: Transaccion,
  listaId: string,
  articuloIds?: string[],
): Promise<Map<string, PrecioVigente>> {
  const [elegida] = await tx.select().from(listasPrecios).where(eq(listasPrecios.id, listaId))
  if (!elegida) return new Map()
  const resultado = new Map<string, PrecioVigente>()
  if (elegida.listaBaseId) {
    const [base] = await tx.select().from(listasPrecios).where(eq(listasPrecios.id, elegida.listaBaseId))
    for (const f of await vigentesDeLista(tx, elegida.listaBaseId, articuloIds)) {
      resultado.set(f.articuloId, {
        precio: elegida.porcentaje ? aImporte(aplicarPorcentaje(f.precio, elegida.porcentaje)) : aImporte(f.precio),
        moneda: f.moneda ?? base?.moneda ?? elegida.moneda,
        especial: false,
      })
    }
  }
  for (const f of await vigentesDeLista(tx, elegida.id, articuloIds)) {
    resultado.set(f.articuloId, {
      precio: aImporte(f.precio),
      moneda: f.moneda ?? elegida.moneda,
      especial: Boolean(elegida.listaBaseId),
    })
  }
  return resultado
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
  const vigentes = filtro.listaId ? await preciosVigentes(tx, filtro.listaId) : new Map<string, PrecioVigente>()
  return filas.map((a) => ({
    ...a,
    precio: vigentes.get(a.id)?.precio ?? null,
    monedaPrecio: vigentes.get(a.id)?.moneda ?? null,
    precioEspecial: vigentes.get(a.id)?.especial ?? false,
  }))
}
