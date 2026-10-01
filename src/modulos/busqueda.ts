import { and, asc, eq, ilike, or } from 'drizzle-orm'

import type { Transaccion } from '../db/conexion'
import { articulos, terceros } from '../db/schema'
import { soloDigitos } from '../lib/cuit'

export type Resultado = { tipo: 'tercero' | 'articulo'; id: string; titulo: string; detalle: string; href: string }

/**
 * Búsqueda universal (Ctrl + K): clientes, proveedores y artículos por
 * nombre, código, CUIT o código de barras. Reemplaza al F4 de PYMEXIS.
 */
export async function buscarTodo(tx: Transaccion, texto: string): Promise<Resultado[]> {
  const q = texto.trim()
  if (q.length < 2) return []
  const patron = `%${q}%`
  const digitos = soloDigitos(q)
  const [ters, arts] = await Promise.all([
    tx
      .select({
        id: terceros.id,
        codigo: terceros.codigo,
        razonSocial: terceros.razonSocial,
        esCliente: terceros.esCliente,
        numeroDocumento: terceros.numeroDocumento,
      })
      .from(terceros)
      .where(
        and(
          eq(terceros.activo, true),
          or(
            ilike(terceros.razonSocial, patron),
            ilike(terceros.nombreFantasia, patron),
            ilike(terceros.codigo, patron),
            digitos.length >= 4 ? ilike(terceros.numeroDocumento, `%${digitos}%`) : undefined,
          ),
        ),
      )
      .orderBy(asc(terceros.razonSocial))
      .limit(6),
    tx
      .select({ id: articulos.id, codigo: articulos.codigo, nombre: articulos.nombre })
      .from(articulos)
      .where(
        and(
          eq(articulos.activo, true),
          or(ilike(articulos.nombre, patron), ilike(articulos.codigo, patron), ilike(articulos.codigoBarras, patron)),
        ),
      )
      .orderBy(asc(articulos.nombre))
      .limit(6),
  ])
  return [
    ...ters.map((t) => ({
      tipo: 'tercero' as const,
      id: t.id,
      titulo: t.razonSocial,
      detalle: `${t.esCliente ? 'Cliente' : 'Proveedor'} ${t.codigo}${t.numeroDocumento ? ` · ${t.numeroDocumento}` : ''}`,
      href: `/terceros/${t.id}`,
    })),
    ...arts.map((a) => ({
      tipo: 'articulo' as const,
      id: a.id,
      titulo: a.nombre,
      detalle: `Artículo ${a.codigo}`,
      href: `/articulos?q=${encodeURIComponent(a.codigo)}`,
    })),
  ]
}
