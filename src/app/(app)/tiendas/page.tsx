import { Boxes, ShoppingBag, ShoppingCart, Store, Tag, Warehouse } from 'lucide-react'
import { EnlaceAyuda } from '@/components/ayuda/EnlaceAyuda'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Aviso, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { listarCanales } from '@/modulos/tiendas/canales'
import { mlConfigurado } from '@/modulos/tiendas/mercadolibre'
import { shopifyConfigurado } from '@/modulos/tiendas/shopify'
import { tnConfigurado } from '@/modulos/tiendas/tiendanube'
import { NOMBRES_CANAL, type TipoCanal } from '@/modulos/tiendas/tipos'

import { ConectarConClave, ConectarShopify, ConectarWoo } from './Formularios'

export const metadata: Metadata = { title: 'Tiendas online' }

// Enlace común (no Link): la ruta redirige a la plataforma.
const BOTON =
  'inline-flex h-9 items-center justify-center rounded-md bg-acento px-3 text-sm font-medium text-sobre-acento hover:bg-acento-hover'

const ESTADO = {
  conectado: { tono: 'ok', texto: 'Conectada' },
  error: { tono: 'error', texto: 'Hay que reconectar' },
  desconectado: { tono: 'neutro', texto: 'Desconectada' },
} as const

export default async function Tiendas({ searchParams }: PageProps<'/tiendas'>) {
  const sesion = await exigirPermiso('tienda.ver')
  const { error, woocommerce } = await searchParams
  const canales = await conEmpresa(sesion, (tx) => listarCanales(tx))
  const puede = tienePermiso(sesion.permisos, 'tienda.configurar')
  return (
    <>
      <EncabezadoPagina
        acciones={<EnlaceAyuda guia="tiendas" />}
        titulo="Tiendas online"
        bajada="Conectá Mercado Libre, Tienda Nube, WooCommerce, Shopify, Magento o PrestaShop: el stock y los precios se mantienen al día y los pedidos pagados entran solos."
      />
      {typeof error === 'string' && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}
      {woocommerce && (
        <div className="mb-4">
          <Aviso tono="info">Si aprobaste la conexión en WooCommerce, la tienda aparece abajo en unos segundos.</Aviso>
        </div>
      )}

      {canales.length > 0 && (
        <Panel className="mb-6 divide-y divide-borde">
          {canales.map((c) => (
            <Link
              key={c.id}
              href={`/tiendas/${c.id}`}
              className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 hover:bg-superficie-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{c.nombre}</span>
                <span className="block text-xs text-texto-2">
                  {NOMBRES_CANAL[c.tipo as TipoCanal]}
                  {c.ultimaSincronizacion &&
                    ` · sincronizada ${c.ultimaSincronizacion.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`}
                </span>
              </span>
              <span className="text-sm text-texto-2">
                {c.vinculadas}/{c.publicaciones} publicaciones vinculadas
              </span>
              <span className="text-sm text-texto-2">{c.importados} pedidos</span>
              {c.errores > 0 && <Chip tono="error">{c.errores} con error</Chip>}
              <Chip tono={ESTADO[c.estado as keyof typeof ESTADO].tono}>{ESTADO[c.estado as keyof typeof ESTADO].texto}</Chip>
            </Link>
          ))}
        </Panel>
      )}

      {puede && (
        <>
          <h2 className="mb-3 text-sm font-semibold">Conectar una tienda</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Panel className="flex flex-col gap-3 p-4">
              <span className="flex items-center gap-2 font-semibold">
                <ShoppingBag aria-hidden className="size-5 text-acento" /> Mercado Libre
              </span>
              <p className="flex-1 text-sm text-texto-2">
                Entrás con tu cuenta de vendedor y autorizás al ERP. Las publicaciones se vinculan solas si el SKU es el código
                del artículo.
              </p>
              {mlConfigurado() ? (
                <a href="/api/tiendas/mercadolibre/conectar" className={BOTON}>
                  Conectar Mercado Libre
                </a>
              ) : (
                <Aviso tono="info">Disponible cuando el administrador de la plataforma habilite la aplicación.</Aviso>
              )}
            </Panel>
            <Panel className="flex flex-col gap-3 p-4">
              <span className="flex items-center gap-2 font-semibold">
                <Store aria-hidden className="size-5 text-acento" /> Tienda Nube
              </span>
              <p className="flex-1 text-sm text-texto-2">
                Instalás la aplicación del ERP en tu tienda con un clic. Los pedidos pagados avisan al instante.
              </p>
              {tnConfigurado() ? (
                <a href="/api/tiendas/tiendanube/conectar" className={BOTON}>
                  Conectar Tienda Nube
                </a>
              ) : (
                <Aviso tono="info">Disponible cuando el administrador de la plataforma habilite la aplicación.</Aviso>
              )}
            </Panel>
            <Panel className="flex flex-col gap-3 p-4">
              <span className="flex items-center gap-2 font-semibold">
                <Tag aria-hidden className="size-5 text-acento" /> WooCommerce
              </span>
              <p className="text-sm text-texto-2">
                Escribí la dirección de tu tienda y aprobá el acceso en WordPress. No hay que copiar claves.
              </p>
              <ConectarWoo />
            </Panel>
            <Panel className="flex flex-col gap-3 p-4">
              <span className="flex items-center gap-2 font-semibold">
                <ShoppingCart aria-hidden className="size-5 text-acento" /> Shopify
              </span>
              <p className="text-sm text-texto-2">
                Escribí el nombre de tu tienda y aprobá los permisos en Shopify. Los pedidos pagados avisan al instante.
              </p>
              {shopifyConfigurado() ? (
                <ConectarShopify />
              ) : (
                <Aviso tono="info">Disponible cuando el administrador de la plataforma habilite la aplicación.</Aviso>
              )}
            </Panel>
            <Panel className="flex flex-col gap-3 p-4">
              <span className="flex items-center gap-2 font-semibold">
                <Warehouse aria-hidden className="size-5 text-acento" /> Magento
              </span>
              <p className="text-sm text-texto-2">
                En tu panel, creá una integración (Sistema → Integraciones) con acceso a Catálogo, Inventario y Ventas, y pegá su
                Access Token. Los pedidos se traen cada 15 minutos.
              </p>
              <ConectarConClave tipo="magento" />
            </Panel>
            <Panel className="flex flex-col gap-3 p-4">
              <span className="flex items-center gap-2 font-semibold">
                <Boxes aria-hidden className="size-5 text-acento" /> PrestaShop
              </span>
              <p className="text-sm text-texto-2">
                Activá el servicio web (Parámetros avanzados → Webservice) y creá una clave. El ERP manda el stock; los precios se
                cargan en la tienda. Los pedidos se traen cada 15 minutos.
              </p>
              <ConectarConClave tipo="prestashop" />
            </Panel>
          </div>
        </>
      )}
    </>
  )
}
