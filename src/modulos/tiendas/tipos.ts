/** Lo común a las tres plataformas: cada conector traduce su API a esto. */

export type TipoCanal = 'mercadolibre' | 'tiendanube' | 'woocommerce'

export const NOMBRES_CANAL: Record<TipoCanal, string> = {
  mercadolibre: 'Mercado Libre',
  tiendanube: 'Tienda Nube',
  woocommerce: 'WooCommerce',
}

/** Una publicación o, si tiene variantes, cada variante. */
export type ProductoCanal = {
  externoId: string
  /** Vacío si no tiene variantes. */
  varianteId: string
  sku: string | null
  titulo: string
  enlace: string | null
  precio: number | null
  stock: number | null
}

export type ItemPedidoCanal = {
  externoId: string | null
  varianteId: string
  sku: string | null
  titulo: string
  cantidad: number
  /** Precio final al comprador, con IVA. */
  precioUnitario: number
}

export type PedidoCanal = {
  externoId: string
  numero: string
  fecha: Date
  /** pagado: se importa; pendiente: se espera; cancelado: no se importa (o se cancela). */
  estado: 'pagado' | 'pendiente' | 'cancelado'
  moneda: string
  total: number
  comprador: { nombre: string; email: string | null; documento: string | null; telefono: string | null }
  items: ItemPedidoCanal[]
}

export type CambiosPublicacion = { stock?: number; precio?: number }

export interface Conector {
  /** Todas las publicaciones activas (con sus variantes). */
  productos(): Promise<ProductoCanal[]>
  actualizar(p: { externoId: string; varianteId: string }, cambios: CambiosPublicacion): Promise<void>
  /** Pedidos creados o modificados desde esa fecha. */
  pedidosDesde(desde: Date): Promise<PedidoCanal[]>
  pedido(externoId: string): Promise<PedidoCanal | null>
}

/** fetch inyectable: las pruebas pasan uno falso que responde como la plataforma. */
export type Fetch = typeof fetch
