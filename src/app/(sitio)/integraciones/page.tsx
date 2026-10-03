import type { Metadata } from 'next'
import Link from 'next/link'

import { Contenedor, Lista, Llamado, Rotulo } from '@/components/sitio/Bloques'

export const metadata: Metadata = {
  title: 'Integraciones: ARCA, Mercado Libre, Tienda Nube, WooCommerce, Shopify y API',
  description:
    'Facturación electrónica con ARCA, tiendas online con Mercado Libre, Tienda Nube, WooCommerce, Shopify, Magento y PrestaShop, cobro con Mercado Pago y API con webhooks firmados.',
  alternates: { canonical: '/integraciones' },
}

const INTEGRACIONES = [
  {
    nombre: 'ARCA (ex AFIP)',
    texto: 'Factura electrónica por web service con tu certificado, consulta de comprobantes e importación de Mis Comprobantes.',
    items: ['CAE en el momento', 'Libro IVA Digital', 'Cruce con Mis Comprobantes'],
  },
  {
    nombre: 'Mercado Libre',
    texto: 'Autorizás con tu cuenta de vendedor y el stock, los precios y los pedidos quedan sincronizados.',
    items: ['Publicaciones y variantes', 'Pedidos pagados al instante', 'Stock único'],
    enlace: '/soluciones/tiendas-online',
  },
  {
    nombre: 'Tienda Nube',
    texto: 'Instalás la aplicación en tu tienda y los pedidos pagados avisan al sistema en el momento.',
    items: ['Instalación en un clic', 'Precios con IVA', 'Cancelaciones automáticas'],
    enlace: '/soluciones/tiendas-online',
  },
  {
    nombre: 'WooCommerce',
    texto: 'Escribís la dirección de tu tienda, aprobás en WordPress y listo: sin copiar claves.',
    items: ['Productos y variaciones', 'Avisos firmados', 'Stock por depósito'],
    enlace: '/soluciones/tiendas-online',
  },
  {
    nombre: 'Shopify',
    texto: 'Escribís el nombre de tu tienda, aprobás los permisos y los pedidos pagados avisan al instante.',
    items: ['Variantes', 'Stock en tu ubicación', 'Pedidos pagados y cancelados'],
    enlace: '/soluciones/tiendas-online',
  },
  {
    nombre: 'Magento y PrestaShop',
    texto: 'Pegás la clave de tu tienda y el sistema mantiene el stock al día y trae los pedidos cada 15 minutos.',
    items: ['Magento 2 y Adobe Commerce', 'PrestaShop 1.7 en adelante', 'Prueba la conexión antes de guardar'],
    enlace: '/soluciones/tiendas-online',
  },
  {
    nombre: 'Mercado Pago',
    texto: 'Pagá la suscripción con débito automático, con tarjeta o dinero en cuenta.',
    items: ['Renovación automática', 'Factura A o B', 'Sin permanencia'],
  },
  {
    nombre: 'API y webhooks',
    texto: 'Conectá tu tienda propia u otros sistemas con claves de API y avisos firmados.',
    items: ['Clientes, órdenes y lecturas', 'Webhooks con firma HMAC', 'Claves de lectura o de acceso total'],
  },
  {
    nombre: 'Excel y otros sistemas',
    texto: 'Importá clientes, artículos y saldos desde planillas; migramos desde PYMEXIS y desde sistemas de servicio técnico.',
    items: ['Simulación antes de grabar', 'Sin duplicados', 'Reportes a Excel'],
  },
]

export default function Integraciones() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-borde">
        <div aria-hidden className="fondo-sitio pointer-events-none absolute inset-0" />
        <Contenedor className="relative flex flex-col items-center gap-4 py-16 text-center sm:py-20">
          <Rotulo>Integraciones</Rotulo>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Conectado con ARCA y con donde vendés
          </h1>
          <p className="max-w-2xl text-lg text-texto-2">
            Menos carga manual, menos errores: los datos van y vienen solos entre el sistema y las plataformas que ya usás.
          </p>
        </Contenedor>
      </section>
      <Contenedor className="grid gap-4 py-16 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRACIONES.map((i) => (
          <article key={i.nombre} className="flex flex-col gap-3 rounded-xl border border-borde bg-superficie p-6">
            <h2 className="text-xl font-semibold">{i.nombre}</h2>
            <p className="text-texto-2">{i.texto}</p>
            <Lista items={i.items} />
            {i.enlace && (
              <Link href={i.enlace} className="mt-auto pt-2 text-sm font-medium text-acento hover:underline">
                Cómo funciona →
              </Link>
            )}
          </article>
        ))}
      </Contenedor>
      <Llamado titulo="Conectá tu negocio hoy" bajada="Las tiendas online son una aplicación que sumás a cualquier plan pago." />
    </>
  )
}
