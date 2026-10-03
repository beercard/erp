import {
  Banknote,
  BellRing,
  Boxes,
  Calculator,
  Check,
  FileSpreadsheet,
  HandCoins,
  Landmark,
  MessageCircle,
  Minus,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Store,
  Wallet,
  Wrench,
  X,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Contenedor, Destacado, Llamado, Pildora, Preguntas, Rotulo, TituloSeccion } from '@/components/sitio/Bloques'
import { Calculadora, NumerosEnVivo, PlanesPortada } from '@/components/sitio/Interactivos'
import { JsonLd } from '@/components/sitio/JsonLd'
import { MarcoNavegador, VistaFactura, VistaPanel, VistaTiendas } from '@/components/sitio/Maqueta'
import {
  BotonWhatsapp,
  ChatSoporte,
  MiniAvisos,
  MiniCuentas,
  MiniFactura,
  MiniIva,
  MiniPedidos,
  MiniStock,
} from '@/components/sitio/Portada'
import { SOLUCIONES } from '@/components/sitio/soluciones'
import { Vitrina } from '@/components/sitio/Vitrina'
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
  {
    p: '¿Puedo cancelar cuando quiera?',
    r: 'Sí. No hay permanencia ni contrato: cambiás de plan o das de baja desde la configuración, y podés descargar tus datos.',
  },
  {
    p: '¿Cómo manejo a mis empleados?',
    r: 'Cada persona entra con su usuario y ve solo lo que su rol permite: el que vende no toca la caja y el contador entra a sus libros. Todo cambio queda registrado.',
  },
]

const INTEGRACIONES = [
  { nombre: 'ARCA', icono: Landmark },
  { nombre: 'Mercado Libre', icono: ShoppingBag },
  { nombre: 'Tienda Nube', icono: Store },
  { nombre: 'WooCommerce', icono: ShoppingCart },
  { nombre: 'Mercado Pago', icono: Wallet },
  { nombre: 'Excel', icono: FileSpreadsheet },
  { nombre: 'WhatsApp', icono: MessageCircle },
  { nombre: 'Bancos y ECHEQ', icono: Banknote },
]

const SOPORTE = [
  ['Te ayudamos a arrancar', 'Importamos tus clientes, artículos y saldos, y te guiamos con el certificado de ARCA.'],
  ['Por WhatsApp y email', 'Escribís como le escribís a cualquiera. Sin formularios ni números de ticket.'],
  ['Capacitación incluida', 'En los planes Pyme y Empresa, una sesión para tu equipo al empezar.'],
  ['Equipo argentino', 'Conocemos ARCA, el IVA, IIBB y las retenciones porque trabajamos con eso todos los días.'],
]

const COMPARACION: { q: string; v: boolean | 'parcial'; p: boolean | 'parcial'; s: boolean | 'parcial' }[] = [
  { q: '¿Se usa desde el primer día, sin cursos?', v: true, p: true, s: false },
  { q: '¿Factura con CAE de ARCA en el mismo paso?', v: true, p: false, s: 'parcial' },
  { q: '¿El stock se descuenta solo, también en tus tiendas online?', v: true, p: false, s: 'parcial' },
  { q: '¿Sabés al instante quién te debe y desde cuándo?', v: true, p: false, s: true },
  { q: '¿Libro IVA y paquete del contador sin planillas?', v: true, p: false, s: 'parcial' },
  { q: '¿Desde el celular y sin instalar nada?', v: true, p: 'parcial', s: false },
  { q: '¿Un solo sistema para ventas, compras, bancos y servicio técnico?', v: true, p: false, s: false },
]

function Marca({ v }: { v: boolean | 'parcial' }) {
  if (v === 'parcial') return <Minus aria-label="En parte" className="mx-auto size-5 text-aviso" />
  return v ? (
    <Check aria-label="Sí" className="mx-auto size-5 text-ok" strokeWidth={2.5} />
  ) : (
    <X aria-label="No" className="mx-auto size-5 text-texto-3" />
  )
}

/** Tarjeta del mosaico: la mini pantalla arriba, el texto abajo. */
function Bento({
  icono: I,
  titulo,
  texto,
  visual,
  tinte,
  className = '',
}: {
  icono: typeof Receipt
  titulo: string
  texto: string
  visual: React.ReactNode
  tinte: string
  className?: string
}) {
  return (
    <div className={`group relative flex flex-col overflow-hidden rounded-3xl bg-superficie ring-1 ring-borde ${className}`}>
      <div aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 h-2/3 ${tinte}`} />
      <div className="relative flex min-h-48 flex-1 items-center justify-center p-6 pb-2">{visual}</div>
      <div className="relative p-6 pt-4">
        <span className="grid size-9 place-items-center rounded-xl bg-superficie text-acento ring-1 ring-borde">
          <I aria-hidden className="size-[18px]" />
        </span>
        <h3 className="mt-4 text-xl font-semibold tracking-tight">{titulo}</h3>
        <p className="mt-1.5 text-texto-2">{texto}</p>
      </div>
    </div>
  )
}

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
      <section className="relative overflow-hidden pt-14 sm:pt-20">
        <div aria-hidden className="fondo-sitio pointer-events-none absolute inset-0 opacity-60" />
        <Contenedor className="relative flex flex-col items-center gap-8 text-center">
          <Link
            href="/integraciones"
            className="inline-flex items-center gap-2 rounded-full bg-superficie py-1 pr-3.5 pl-1 text-sm text-texto-2 ring-1 ring-borde transition hover:ring-borde-fuerte"
          >
            <span className="flex items-center gap-1.5 rounded-full bg-ok-suave px-2.5 py-0.5 text-xs font-semibold text-ok">
              <span className="size-1.5 rounded-full bg-ok" /> Nuevo
            </span>
            <span className="sm:hidden">Tiendas online conectadas →</span>
            <span className="hidden sm:inline">Mercado Libre, Tienda Nube y WooCommerce conectados →</span>
          </Link>
          <h1 className="max-w-5xl text-[3.1rem] leading-[0.98] font-bold tracking-[-0.055em] text-balance sm:text-7xl lg:text-[6.2rem]">
            Dejá las planillas. Facturá, controlá y <Destacado>crecé</Destacado>.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-pretty text-texto-2 sm:text-xl">
            {MARCA.producto} es el sistema de gestión en la nube para pymes de Argentina: facturá con ARCA en segundos, controlá
            el stock, cobrá y sabé quién te debe. Fácil desde el primer día, aunque nunca hayas usado un sistema.
          </p>
          <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <Pildora href="/registro">Probar {DIAS_DE_PRUEBA} días gratis</Pildora>
            <Pildora href="/precios" variante="contorno">
              Ver precios
            </Pildora>
          </div>
          <p className="-mt-2 text-sm text-texto-2">
            Gratis para facturar · Gestión completa desde{' '}
            <span className="font-mono font-semibold text-texto">
              $ {PLANES.find((p) => p.precioMensual > 0)!.precioMensual.toLocaleString('es-AR')}
            </span>{' '}
            por mes + IVA
          </p>
        </Contenedor>

        {/* Vitrina del producto */}
        <Contenedor className="relative mt-16 sm:mt-20">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-marca to-marca-2 px-3 pt-8 pb-8 sm:px-12 sm:pt-10">
            <div aria-hidden className="puntos-sitio pointer-events-none absolute inset-0" />
            <div
              aria-hidden
              className="absolute -top-40 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-white/10 blur-3xl"
            />
            <div className="relative mx-auto max-w-4xl">
              <Vitrina
                vistas={[
                  {
                    titulo: 'Panel',
                    contenido: (
                      <MarcoNavegador ruta="inicio" activo="Inicio" etiqueta="Panel de Vektra ERP con las cifras del mes">
                        <VistaPanel />
                      </MarcoNavegador>
                    ),
                  },
                  {
                    titulo: 'Facturar',
                    contenido: (
                      <MarcoNavegador ruta="facturas/nueva" activo="Facturas" etiqueta="Factura A con CAE de ARCA en Vektra ERP">
                        <VistaFactura />
                      </MarcoNavegador>
                    ),
                  },
                  {
                    titulo: 'Tiendas online',
                    contenido: (
                      <MarcoNavegador
                        ruta="tiendas"
                        activo="Tiendas online"
                        etiqueta="Pedidos de Mercado Libre, Tienda Nube y WooCommerce en Vektra ERP"
                      >
                        <VistaTiendas />
                      </MarcoNavegador>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        </Contenedor>
      </section>

      {/* Cifras del producto: datos de Vektra, no de clientes */}
      <section aria-label="Vektra en números" className="mt-16 bg-barra py-14 text-sobre-barra sm:mt-20">
        <Contenedor>
          <dl className="grid grid-cols-2 gap-y-10 text-center lg:grid-cols-4">
            {[
              [`${MODULOS.length}`, 'módulos en un solo sistema'],
              [`${DIAS_DE_PRUEBA} días`, 'de prueba, sin tarjeta'],
              ['$ 0', 'para empezar a facturar'],
              ['A, B y C', 'facturas con CAE de ARCA'],
            ].map(([v, t]) => (
              <div key={t} className="flex flex-col gap-2">
                <dt className="order-2 text-sm text-sobre-barra-2">{t}</dt>
                <dd className="font-mono text-4xl font-semibold tracking-tight sm:text-5xl">{v}</dd>
              </div>
            ))}
          </dl>
        </Contenedor>
      </section>

      {/* Integraciones */}
      <section aria-label="Integraciones" className="border-b border-borde py-8">
        <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <ul className="marquesina flex w-max gap-14 pr-14 text-lg font-semibold tracking-tight text-texto-3">
            {[...INTEGRACIONES, ...INTEGRACIONES].map((m, n) => (
              <li
                key={n}
                aria-hidden={n >= INTEGRACIONES.length || undefined}
                className="flex items-center gap-2 whitespace-nowrap"
              >
                <m.icono aria-hidden className="size-5" /> {m.nombre}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 01 · Lo esencial */}
      <section className="py-24 sm:py-32">
        <Contenedor className="flex flex-col gap-14">
          <TituloSeccion
            numero={1}
            rotulo="Lo esencial"
            titulo={
              <>
                Todo tu negocio, <Destacado>ordenado</Destacado>.
              </>
            }
            bajada="Lo que hoy tenés repartido en cuadernos, planillas y sistemas sueltos. Cada venta se carga una vez y llega sola a donde tiene que llegar."
          />
          <div className="grid gap-4 md:grid-cols-6">
            <Bento
              className="md:col-span-4"
              icono={Receipt}
              titulo="Facturá en segundos con ARCA"
              texto="Factura A, B y C, notas de crédito y FCE MiPyME con CAE. Mandala por email o WhatsApp en un toque."
              visual={<MiniFactura />}
              tinte="bg-gradient-to-b from-acento-suave to-transparent"
            />
            <Bento
              className="md:col-span-2"
              icono={HandCoins}
              titulo="Sabé quién te debe"
              texto="Cuentas corrientes con antigüedad de deuda y cobranzas."
              visual={<MiniCuentas />}
              tinte="bg-gradient-to-b from-aviso-suave to-transparent"
            />
            <Bento
              className="md:col-span-2"
              icono={Boxes}
              titulo="Stock en vivo"
              texto="Por depósito, con aviso cuando algo se está terminando."
              visual={<MiniStock />}
              tinte="bg-gradient-to-b from-ok-suave to-transparent"
            />
            <Bento
              className="md:col-span-2"
              icono={ShoppingBag}
              titulo="Vendé online sin cargar dos veces"
              texto="Los pedidos entran solos y el stock se descuenta en todas las tiendas."
              visual={<MiniPedidos />}
              tinte="bg-gradient-to-b from-info-suave to-transparent"
            />
            <Bento
              className="md:col-span-2"
              icono={Calculator}
              titulo="Impuestos sin planillas"
              texto="Libro IVA Digital, retenciones e IIBB listos para presentar."
              visual={<MiniIva />}
              tinte="bg-gradient-to-b from-app-impuestos/12 to-transparent"
            />
            <Bento
              className="md:col-span-3"
              icono={BellRing}
              titulo="Te avisa antes de que se te pase"
              texto="Vencimientos de impuestos, cheques a depositar y clientes atrasados."
              visual={<MiniAvisos />}
              tinte="bg-gradient-to-b from-error-suave to-transparent"
            />
            <div className="relative flex flex-col justify-end gap-4 overflow-hidden rounded-3xl bg-barra p-7 text-sobre-barra md:col-span-3">
              <div aria-hidden className="absolute -top-24 -right-16 size-72 rounded-full bg-marca/60 blur-3xl" />
              <Wrench aria-hidden className="relative size-6 text-acento-claro" />
              <h3 className="relative text-2xl font-semibold tracking-tight">Y mucho más cuando lo necesites</h3>
              <p className="relative text-sobre-barra-2">
                Compras y pagos con retenciones, bancos y cheques, contabilidad automática, servicio técnico con app para el
                celular y contratos de equipos.
              </p>
              <Link href="/funciones" className="relative font-semibold text-acento-claro hover:underline">
                Ver todas las funciones →
              </Link>
            </div>
          </div>
        </Contenedor>
      </section>

      {/* 02 · Acompañamiento */}
      <section className="bg-superficie py-24 sm:py-32">
        <Contenedor className="flex flex-col gap-14">
          <TituloSeccion
            numero={2}
            rotulo="Acompañamiento"
            titulo={
              <>
                Soporte que <Destacado>te entiende</Destacado>.
              </>
            }
            bajada="Personas reales que conocen tu negocio y la normativa argentina. Sin bots ni formularios eternos."
          />
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
            <ol className="flex flex-col border-t border-borde">
              {SOPORTE.map(([t, d], n) => (
                <li key={t} className="flex gap-6 border-b border-borde py-6">
                  <span className="font-mono text-sm text-texto-3">{String(n + 1).padStart(2, '0')}</span>
                  <span>
                    <span className="block text-xl font-semibold tracking-tight">{t}</span>
                    <span className="mt-1 block text-texto-2">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
            <ChatSoporte />
          </div>
        </Contenedor>
      </section>

      {/* 03 · En vivo */}
      <section className="py-24 sm:py-32">
        <Contenedor className="flex flex-col gap-14">
          <TituloSeccion
            numero={3}
            rotulo="En vivo"
            titulo={
              <>
                Tus números, en <Destacado>tiempo real</Destacado>.
              </>
            }
            bajada="No esperes al cierre del mes: abrís el sistema y ves cuánto vendiste, cuánto cobraste y qué falta facturar."
          />
          <NumerosEnVivo />
        </Contenedor>
      </section>

      {/* 04 · Calculadora */}
      <section className="bg-superficie py-24 sm:py-32">
        <Contenedor className="flex flex-col gap-14">
          <TituloSeccion
            numero={4}
            rotulo="Calculadora"
            titulo={
              <>
                ¿Cuánto <Destacado>tiempo</Destacado> perdés con planillas?
              </>
            }
            bajada="Mové los valores según cómo trabajás hoy y mirá cuántas horas por mes te devuelve el sistema."
          />
          <Calculadora />
        </Contenedor>
      </section>

      {/* 05 · Rubros */}
      <section className="py-24 sm:py-32">
        <Contenedor className="flex flex-col gap-14">
          <TituloSeccion
            numero={5}
            rotulo="Para tu rubro"
            titulo={
              <>
                Pensado para <Destacado>cómo trabajás</Destacado>.
              </>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SOLUCIONES.map((s) => (
              <Link
                key={s.slug}
                href={`/soluciones/${s.slug}`}
                className="group flex flex-col gap-3 rounded-3xl bg-superficie p-7 ring-1 ring-borde transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-20px_rgb(0_0_0/0.25)]"
              >
                <span className="font-mono text-xs tracking-[0.18em] text-acento uppercase">Solución</span>
                <h3 className="text-xl font-semibold tracking-tight">{s.menu}</h3>
                <p className="text-texto-2">{s.bajada}</p>
                <span className="mt-auto pt-2 font-semibold text-texto group-hover:text-acento">Conocer más →</span>
              </Link>
            ))}
          </div>
        </Contenedor>
      </section>

      {/* 06 · Planes */}
      <section className="bg-superficie py-24 sm:py-32">
        <Contenedor className="flex flex-col gap-12">
          <TituloSeccion
            numero={6}
            rotulo="Planes simples"
            titulo={
              <>
                Elegí tu <Destacado>plan</Destacado>.
              </>
            }
            bajada="Empezá gratis y crecé cuando lo necesites. Sin permanencia ni letra chica."
          />
          <PlanesPortada />
          <div className="relative flex flex-col items-start justify-between gap-6 overflow-hidden rounded-3xl bg-barra p-8 text-sobre-barra sm:p-10 lg:flex-row lg:items-center">
            <div aria-hidden className="absolute -right-20 -bottom-24 size-72 rounded-full bg-marca/60 blur-3xl" />
            <div className="relative">
              <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">¿No sabés qué plan te conviene?</h3>
              <p className="mt-2 max-w-xl text-sobre-barra-2">
                Contanos cómo trabaja tu empresa y te mostramos el sistema funcionando con tu operación, no con datos de ejemplo.
              </p>
            </div>
            <div className="relative flex flex-wrap items-center gap-4">
              <Pildora href="/contacto" variante="blanco">
                Agendá una demo
              </Pildora>
              <Link
                href="/contacto?motivo=escribir"
                className="font-semibold text-sobre-barra underline-offset-4 hover:underline"
              >
                Prefiero que me escriban
              </Link>
            </div>
          </div>
          <p className="text-center text-sm text-texto-2">
            ¿Tiendas online, contratos y equipos o más usuarios?{' '}
            <Link href="/precios" className="font-semibold text-acento hover:underline">
              Mirá las aplicaciones y la comparación completa
            </Link>
          </p>
        </Contenedor>
      </section>

      {/* 07 · Comparativa */}
      <section className="py-24 sm:py-32">
        <Contenedor className="flex flex-col gap-14">
          <TituloSeccion
            numero={7}
            rotulo="Comparativa"
            titulo={
              <>
                Mirá por qué <Destacado>conviene</Destacado>.
              </>
            }
            bajada="Una comparación honesta con las formas más comunes de llevar una pyme."
          />
          <div className="overflow-x-auto rounded-3xl bg-superficie ring-1 ring-borde">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr>
                  <th scope="col" className="p-5 font-mono text-xs font-medium tracking-[0.18em] text-texto-3 uppercase sm:p-6">
                    Lo que importa
                  </th>
                  <th scope="col" className="w-40 bg-acento p-5 text-center text-sobre-acento">
                    <span className="mb-1 inline-block rounded-full bg-white/20 px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase">
                      Recomendado
                    </span>
                    <span className="block font-semibold">{MARCA.producto}</span>
                  </th>
                  <th scope="col" className="w-40 p-5 text-center font-semibold">
                    Planillas y cuaderno
                  </th>
                  <th scope="col" className="w-40 p-5 text-center font-semibold">
                    Sistemas sueltos
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARACION.map((f) => (
                  <tr key={f.q} className="border-t border-borde">
                    <th scope="row" className="p-5 font-medium sm:px-6">
                      {f.q}
                    </th>
                    <td className="bg-acento-suave/60 p-5">
                      <Marca v={f.v} />
                    </td>
                    <td className="p-5">
                      <Marca v={f.p} />
                    </td>
                    <td className="p-5">
                      <Marca v={f.s} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Contenedor>
      </section>

      {/* 08 · Preguntas */}
      <section className="bg-superficie py-24 sm:py-32">
        <Contenedor className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col items-start gap-6">
            <Rotulo numero={8}>Preguntas</Rotulo>
            <h2 className="text-5xl leading-[1] font-bold tracking-[-0.05em] sm:text-6xl">
              ¿Dudas?
              <br />
              <Destacado>Las resolvemos.</Destacado>
            </h2>
            <p className="max-w-sm text-lg text-texto-2">
              ¿Algo sin respuesta? Escribinos y te mostramos el sistema funcionando con tus propios datos.
            </p>
            <Link href="/contacto" className="font-semibold text-acento hover:underline">
              Hablar con un asesor →
            </Link>
          </div>
          <Preguntas preguntas={PREGUNTAS} />
        </Contenedor>
      </section>

      <Llamado
        titulo="Manejá tu pyme sin que te consuma el día."
        bajada={`Ordená ventas, stock, cobranzas e impuestos en un solo lugar. ${DIAS_DE_PRUEBA} días gratis con todo el plan Pyme.`}
      />
      <BotonWhatsapp />
    </>
  )
}
