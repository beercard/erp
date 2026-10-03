import {
  ArrowRight,
  Boxes,
  Calculator,
  Landmark,
  Lock,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Wrench,
  FileSpreadsheet,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonesInicio, Contenedor, Llamado, Preguntas, TituloSeccion } from '@/components/sitio/Bloques'
import { JsonLd } from '@/components/sitio/JsonLd'
import { Maqueta } from '@/components/sitio/Maqueta'
import { SOLUCIONES } from '@/components/sitio/soluciones'
import { MARCA, URL_SITIO } from '@/lib/marca'
import { DIAS_DE_PRUEBA, PLANES } from '@/lib/planes'

const TITULO = 'Vektra ERP · Sistema de gestión y facturación electrónica para pymes'
const DESCRIPCION =
  'ERP en la nube para pymes argentinas: facturación electrónica ARCA, stock, compras, bancos, impuestos, contabilidad y tiendas online con Mercado Libre. Probalo gratis.'

export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRIPCION,
  alternates: { canonical: '/' },
  openGraph: { title: TITULO, description: DESCRIPCION, url: '/' },
}

const MODULOS = [
  {
    icono: Receipt,
    titulo: 'Facturación electrónica',
    texto: 'Facturas A, B y C, notas de crédito y FCE MiPyME con CAE de ARCA, en segundos.',
    ancla: 'facturacion',
  },
  {
    icono: ShoppingCart,
    titulo: 'Ventas y stock',
    texto: 'Presupuestos, pedidos, remitos y stock por depósito, con listas de precios.',
    ancla: 'ventas',
  },
  {
    icono: FileSpreadsheet,
    titulo: 'Compras y pagos',
    texto: 'Comprobantes desde ARCA, órdenes de compra y de pago con retenciones.',
    ancla: 'compras',
  },
  {
    icono: Landmark,
    titulo: 'Tesorería',
    texto: 'Cajas, bancos, cheques y ECHEQ, con conciliación bancaria.',
    ancla: 'tesoreria',
  },
  {
    icono: Calculator,
    titulo: 'Impuestos y contabilidad',
    texto: 'Libro IVA Digital, SICORE, IIBB y asientos que se hacen solos.',
    ancla: 'impuestos',
  },
  {
    icono: ShoppingBag,
    titulo: 'Tiendas online',
    texto: 'Mercado Libre, Tienda Nube y WooCommerce con stock y pedidos sincronizados.',
    ancla: 'tiendas',
  },
  {
    icono: Wrench,
    titulo: 'Servicio técnico',
    texto: 'Órdenes, agenda, app del técnico sin señal, preventivos y portal de clientes.',
    ancla: 'servicio',
  },
  {
    icono: Boxes,
    titulo: 'Contratos y equipos',
    texto: 'Abonos, lecturas de contadores y facturación mensual.',
    ancla: 'contratos',
  },
]

const PREGUNTAS = [
  {
    p: '¿Tengo que instalar algo?',
    r: 'No. Funciona en el navegador de la computadora y del celular, con tus datos en la nube y copias de seguridad diarias.',
  },
  {
    p: '¿Sirve para facturar con ARCA (ex AFIP)?',
    r: 'Sí. Emite facturas electrónicas con CAE por web service, con tu propio certificado y punto de venta.',
  },
  {
    p: '¿Cuánto cuesta?',
    r: `Hay un plan gratis para empezar a facturar y planes pagos desde $ ${PLANES.find((p) => p.precioMensual > 0)!.precioMensual.toLocaleString('es-AR')} por mes + IVA. Los ${DIAS_DE_PRUEBA} días de prueba no piden tarjeta.`,
  },
  {
    p: '¿Puedo conectar mi tienda de Mercado Libre?',
    r: 'Sí: también Tienda Nube y WooCommerce. El stock y los precios se actualizan solos y los pedidos entran al sistema.',
  },
  {
    p: '¿Mis datos están seguros?',
    r: 'Cada empresa está aislada de las demás en la base de datos, las claves y certificados se guardan cifrados y todo pasa por conexión segura.',
  },
  {
    p: '¿Me ayudan a empezar?',
    r: 'Sí. Importamos tus clientes, artículos y saldos, y en los planes Pyme y Empresa hay capacitación incluida.',
  },
]

export default function Inicio() {
  return (
    <>
      <JsonLd
        datos={[
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: MARCA.producto,
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: URL_SITIO,
            description: DESCRIPCION,
            offers: PLANES.map((p) => ({
              '@type': 'Offer',
              name: `Plan ${p.nombre}`,
              price: p.precioMensual,
              priceCurrency: 'ARS',
              url: `${URL_SITIO}/precios`,
            })),
            publisher: { '@type': 'Organization', name: MARCA.empresa },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: PREGUNTAS.map((q) => ({
              '@type': 'Question',
              name: q.p,
              acceptedAnswer: { '@type': 'Answer', text: q.r },
            })),
          },
        ]}
      />

      {/* Portada */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="fondo-sitio pointer-events-none absolute inset-0" />
        <div aria-hidden className="rejilla-sitio pointer-events-none absolute inset-0" />
        <Contenedor className="relative flex flex-col items-center gap-8 pt-16 pb-20 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-borde bg-superficie/80 px-3 py-1 text-xs text-texto-2">
            <Sparkles aria-hidden className="size-3.5 text-acento" /> Nuevo: tiendas online con Mercado Libre, Tienda Nube y
            WooCommerce
          </span>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Facturá, controlá el stock y vendé online <span className="text-acento">desde un solo sistema</span>
          </h1>
          <p className="max-w-2xl text-lg text-pretty text-texto-2">
            {MARCA.producto} es el sistema de gestión en la nube para pymes argentinas: facturación electrónica con ARCA, ventas,
            compras, bancos, impuestos y contabilidad, simple de usar para todo tu equipo.
          </p>
          <BotonesInicio centrado />
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-texto-2">
            <li>✓ {DIAS_DE_PRUEBA} días gratis, sin tarjeta</li>
            <li>✓ Sin instalar nada</li>
            <li>✓ Factura A, B y C con CAE</li>
          </ul>
          <div className="mt-6 w-full max-w-5xl">
            <Maqueta />
          </div>
        </Contenedor>
      </section>

      {/* Integraciones */}
      <section aria-label="Integraciones" className="border-y border-borde bg-superficie py-8">
        <Contenedor className="flex flex-col items-center gap-4">
          <p className="text-sm text-texto-3">Conectado con lo que ya usás</p>
          <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-lg font-semibold text-texto-2">
            {['ARCA', 'Mercado Libre', 'Tienda Nube', 'WooCommerce', 'Mercado Pago', 'Excel'].map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Contenedor>
      </section>

      {/* Módulos */}
      <section className="py-20 sm:py-24">
        <Contenedor className="flex flex-col gap-12">
          <TituloSeccion
            rotulo="Todo en un lugar"
            titulo="Lo que hoy tenés repartido en planillas y sistemas sueltos"
            bajada="Cada operación se carga una sola vez y llega sola a donde tiene que llegar: stock, cuenta corriente, libros de IVA y contabilidad."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULOS.map(({ icono: I, titulo, texto, ancla }) => (
              <Link
                key={titulo}
                href={`/funciones#${ancla}`}
                className="group flex flex-col gap-3 rounded-xl border border-borde bg-superficie p-5 transition hover:-translate-y-0.5 hover:border-acento/50 hover:shadow-panel"
              >
                <span className="grid size-10 place-items-center rounded-lg bg-acento-suave text-acento">
                  <I aria-hidden className="size-5" />
                </span>
                <h3 className="font-semibold">{titulo}</h3>
                <p className="text-sm text-texto-2">{texto}</p>
                <span className="mt-auto flex items-center gap-1 text-sm font-medium text-acento opacity-0 transition group-hover:opacity-100">
                  Ver más <ArrowRight aria-hidden className="size-4" />
                </span>
              </Link>
            ))}
          </div>
        </Contenedor>
      </section>

      {/* Por qué */}
      <section className="bg-superficie py-20 sm:py-24">
        <Contenedor className="grid gap-10 lg:grid-cols-3">
          {[
            {
              icono: Sparkles,
              titulo: 'Fácil para cualquiera',
              texto:
                'Pantallas claras, mensajes que explican qué pasó y cómo seguir, y atajos de teclado para el que carga todo el día.',
            },
            {
              icono: Smartphone,
              titulo: 'En la compu y en el celular',
              texto:
                'Consultá saldos, stock y precios desde el teléfono. Los técnicos trabajan desde el celular, también sin señal.',
            },
            {
              icono: Lock,
              titulo: 'Seguro desde el diseño',
              texto:
                'Cada empresa aislada en la base de datos, permisos por rol, auditoría de cada cambio y certificados cifrados.',
            },
          ].map(({ icono: I, titulo, texto }) => (
            <div key={titulo} className="flex flex-col gap-3">
              <I aria-hidden className="size-7 text-acento" />
              <h3 className="text-xl font-semibold">{titulo}</h3>
              <p className="text-texto-2">{texto}</p>
            </div>
          ))}
        </Contenedor>
      </section>

      {/* Cómo empezar */}
      <section className="py-20 sm:py-24">
        <Contenedor className="flex flex-col gap-12">
          <TituloSeccion rotulo="Empezar es simple" titulo="En marcha el mismo día" />
          <ol className="grid gap-6 md:grid-cols-3">
            {[
              ['Creá la cuenta', 'Con el CUIT de tu empresa y un email. Tenés todo el plan Pyme para probar.'],
              ['Traé tus datos', 'Importá clientes, artículos y precios desde Excel, o pedinos que lo hagamos.'],
              ['Conectá ARCA y facturá', 'Cargás tu certificado una vez y emitís la primera factura con CAE.'],
            ].map(([t, d], i) => (
              <li key={t} className="relative rounded-xl border border-borde bg-superficie p-6">
                <span className="cifras text-4xl font-semibold text-acento/30">0{i + 1}</span>
                <h3 className="mt-2 text-lg font-semibold">{t}</h3>
                <p className="mt-1 text-texto-2">{d}</p>
              </li>
            ))}
          </ol>
        </Contenedor>
      </section>

      {/* Rubros */}
      <section className="bg-superficie py-20 sm:py-24">
        <Contenedor className="flex flex-col gap-12">
          <TituloSeccion rotulo="Para tu rubro" titulo="Pensado para cómo trabaja tu empresa" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SOLUCIONES.map((s) => (
              <Link
                key={s.slug}
                href={`/soluciones/${s.slug}`}
                className="group flex flex-col gap-2 rounded-xl border border-borde bg-fondo p-5 hover:border-acento/50"
              >
                <h3 className="font-semibold group-hover:text-acento">{s.menu}</h3>
                <p className="text-sm text-texto-2">{s.bajada}</p>
              </Link>
            ))}
            <Link
              href="/precios"
              className="flex flex-col justify-center gap-2 rounded-xl bg-acento p-5 text-sobre-acento hover:bg-acento-hover"
            >
              <span className="text-sm opacity-80">Planes</span>
              <span className="text-xl font-semibold">
                Gratis para facturar. Desde $ {PLANES[1].precioMensual.toLocaleString('es-AR')} /mes + IVA la gestión completa.
              </span>
              <span className="flex items-center gap-1 text-sm font-medium">
                Ver precios <ArrowRight aria-hidden className="size-4" />
              </span>
            </Link>
          </div>
        </Contenedor>
      </section>

      {/* Preguntas */}
      <section className="py-20 sm:py-24">
        <Contenedor className="flex flex-col gap-10">
          <TituloSeccion rotulo="Preguntas frecuentes" titulo="Lo que más nos consultan" />
          <Preguntas preguntas={PREGUNTAS} />
        </Contenedor>
      </section>

      <Llamado
        titulo="Probá Vektra ERP con tus propios datos"
        bajada={`${DIAS_DE_PRUEBA} días con todo el plan Pyme. Si no te convence, no pagás nada y tus datos siguen siendo tuyos.`}
      />
    </>
  )
}
