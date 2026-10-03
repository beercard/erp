import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Bell,
  Boxes,
  Calculator,
  ChartPie,
  Check,
  CircleCheck,
  FileSpreadsheet,
  HandCoins,
  Landmark,
  MessageCircle,
  PlayCircle,
  Receipt,
  Rocket,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Store,
  Upload,
  UserPlus,
  Wallet,
  Wrench,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Contenedor, Lista, Preguntas, Rotulo, TituloSeccion } from '@/components/sitio/Bloques'
import { JsonLd } from '@/components/sitio/JsonLd'
import { Maqueta } from '@/components/sitio/Maqueta'
import {
  AvisoFlotante,
  BotonWhatsapp,
  MaquetaCelular,
  MiniAvisos,
  MiniCuentas,
  MiniFactura,
  MiniIva,
  MiniPedidos,
  MiniStock,
} from '@/components/sitio/Portada'
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

const EQUIPO = [
  {
    icono: ChartPie,
    quien: 'Para vos',
    titulo: 'Los números del negocio',
    app: 'bg-app-ventas',
    puntos: ['Ventas, cobranzas y caja del día', 'Quién te debe y desde cuándo', 'Qué se vende y qué se queda'],
  },
  {
    icono: Receipt,
    quien: 'Para el mostrador y ventas',
    titulo: 'Vender rápido y sin errores',
    app: 'bg-app-facturacion',
    puntos: ['Factura en tres pasos', 'Precios y stock a la vista', 'Presupuestos y pedidos por WhatsApp'],
  },
  {
    icono: Calculator,
    quien: 'Para tu contador',
    titulo: 'Todo listo para presentar',
    app: 'bg-app-impuestos',
    puntos: ['Libro IVA Digital y SICORE', 'Asientos contables automáticos', 'Paquete mensual en un clic'],
  },
]

/** Tarjeta del bento de funciones: texto arriba y una mini pantalla de ejemplo. */
function Bento({
  icono: I,
  titulo,
  texto,
  visual,
  className = '',
  horizontal = false,
}: {
  icono: typeof Receipt
  titulo: string
  texto: string
  visual: React.ReactNode
  className?: string
  horizontal?: boolean
}) {
  return (
    <div
      className={`tarjeta group flex gap-6 overflow-hidden p-6 transition hover:shadow-panel ${
        horizontal ? 'flex-col sm:flex-row sm:items-center' : 'flex-col'
      } ${className}`}
    >
      <div className={horizontal ? 'sm:w-1/2' : ''}>
        <span className="grid size-10 place-items-center rounded-xl bg-acento-suave text-acento">
          <I aria-hidden className="size-5" />
        </span>
        <h3 className="mt-4 text-xl font-bold tracking-tight">{titulo}</h3>
        <p className="mt-1.5 text-texto-2">{texto}</p>
      </div>
      <div
        className={`flex flex-1 items-center rounded-2xl bg-fondo p-5 ring-1 ring-borde/70 ${horizontal ? 'sm:w-1/2 sm:py-8' : 'mt-auto'}`}
      >
        {visual}
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
      <section className="relative overflow-hidden">
        <div aria-hidden className="fondo-sitio pointer-events-none absolute inset-0" />
        <div aria-hidden className="rejilla-sitio pointer-events-none absolute inset-0" />
        <Contenedor className="relative grid items-center gap-14 pt-12 pb-20 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10 lg:pt-20 lg:pb-28">
          <div className="flex flex-col items-start gap-7">
            <Link
              href="/integraciones"
              className="inline-flex items-center gap-2 rounded-full bg-superficie/80 py-1 pr-3 pl-1 text-xs font-medium text-texto-2 shadow-suave ring-1 ring-borde backdrop-blur hover:text-texto"
            >
              <span className="rounded-full bg-acento px-2 py-0.5 text-[11px] font-semibold text-sobre-acento">Nuevo</span>
              Mercado Libre, Tienda Nube y WooCommerce conectados
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
            <h1 className="text-[2.6rem] leading-[1.05] font-extrabold tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4.1rem]">
              Tu negocio entero, <span className="texto-degradado">en un solo sistema.</span>
            </h1>
            <p className="max-w-xl text-lg text-pretty text-texto-2 sm:text-xl">
              Facturá con ARCA en segundos, controlá el stock, cobrá y sabé quién te debe. Fácil desde el primer día, aunque nunca
              hayas usado un sistema.
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link
                href="/registro"
                className="boton-lleno inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-acento px-6 font-semibold text-sobre-acento hover:bg-acento-hover"
              >
                Empezar gratis <ArrowRight aria-hidden className="size-4" />
              </Link>
              <a
                href="#como-funciona"
                className="boton-relieve inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-superficie px-6 font-semibold hover:bg-superficie-2"
              >
                <PlayCircle aria-hidden className="size-4 text-acento" /> Ver cómo funciona
              </a>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-texto-2">
              {[`${DIAS_DE_PRUEBA} días gratis`, 'Sin tarjeta', 'Sin instalar nada', 'Factura A, B y C'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CircleCheck aria-hidden className="size-4 text-ok" /> {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-2xl lg:mr-0">
            <div
              aria-hidden
              className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-acento/25 via-info/10 to-transparent blur-2xl"
            />
            <div className="relative sm:pl-24 lg:pl-28">
              <Maqueta />
            </div>
            <MaquetaCelular className="absolute -bottom-12 left-0 hidden rotate-[-4deg] sm:block" />
            <AvisoFlotante
              className="absolute -top-8 right-0 hidden sm:flex"
              icono={<ShoppingBag aria-hidden className="size-4" />}
              tono="bg-aviso-suave text-aviso"
              titulo="Venta en Mercado Libre"
              texto="Stock actualizado en todas tus tiendas"
            />
            <AvisoFlotante
              className="flotar-lento absolute right-4 -bottom-10 hidden sm:flex"
              icono={<BadgeCheck aria-hidden className="size-4" />}
              tono="bg-ok-suave text-ok"
              titulo="Factura B autorizada por ARCA"
              texto="CAE recibido en 2 segundos"
            />
          </div>
        </Contenedor>
      </section>

      {/* Integraciones */}
      <section aria-label="Integraciones" className="border-y border-borde bg-superficie py-7">
        <p className="mb-5 text-center text-sm font-medium text-texto-3">Conectado con lo que ya usás todos los días</p>
        <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <ul className="marquesina flex w-max gap-14 pr-14 text-xl font-bold tracking-tight text-texto-3">
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

      {/* Cifras del producto (datos del producto, no de clientes) */}
      <section aria-label="Vektra en números" className="py-14">
        <Contenedor>
          <dl className="grid grid-cols-2 gap-6 text-center lg:grid-cols-4">
            {[
              [`${MODULOS.length}`, 'módulos en un solo sistema'],
              [`${DIAS_DE_PRUEBA}`, 'días de prueba con todo incluido'],
              ['$ 0', 'para empezar a facturar'],
              ['24/7', 'en la nube, desde la compu o el celular'],
            ].map(([v, t]) => (
              <div key={t} className="flex flex-col gap-1">
                <dt className="order-2 text-sm text-texto-2">{t}</dt>
                <dd className="cifras text-4xl font-extrabold tracking-tight sm:text-5xl">{v}</dd>
              </div>
            ))}
          </dl>
        </Contenedor>
      </section>

      {/* Funciones en bento */}
      <section className="pb-20 sm:pb-28">
        <Contenedor className="flex flex-col gap-12">
          <TituloSeccion
            rotulo="Todo lo que necesitás"
            titulo="Dejá las planillas. Todo tu negocio se ordena solo."
            bajada="Cada venta se carga una vez y llega a donde tiene que llegar: stock, cuenta corriente, caja, libros de IVA y contabilidad."
          />
          <div className="grid gap-4 md:grid-cols-6">
            <Bento
              className="md:col-span-4"
              icono={Receipt}
              titulo="Facturá en segundos con ARCA"
              texto="Factura A, B y C, notas de crédito y FCE MiPyME con CAE. Mandala por email o WhatsApp en un toque."
              visual={<MiniFactura />}
              horizontal
            />
            <Bento
              className="md:col-span-2"
              icono={Boxes}
              titulo="Stock siempre al día"
              texto="Por depósito, con aviso cuando algo se está terminando."
              visual={<MiniStock />}
            />
            <Bento
              className="md:col-span-2"
              icono={HandCoins}
              titulo="Sabé quién te debe"
              texto="Cuentas corrientes con antigüedad de deuda y cobranzas."
              visual={<MiniCuentas />}
            />
            <Bento
              className="md:col-span-2"
              icono={ShoppingBag}
              titulo="Vendé online sin cargar dos veces"
              texto="Los pedidos entran solos y el stock se descuenta en todas las tiendas."
              visual={<MiniPedidos />}
            />
            <Bento
              className="md:col-span-2"
              icono={Calculator}
              titulo="Impuestos sin planillas"
              texto="Libro IVA Digital, retenciones e IIBB listos para presentar."
              visual={<MiniIva />}
            />
            <div className="tarjeta relative flex flex-col justify-between gap-6 overflow-hidden bg-barra p-6 text-sobre-barra md:col-span-3">
              <div aria-hidden className="absolute -top-20 -right-20 size-64 rounded-full bg-acento/40 blur-3xl" />
              <div className="relative">
                <Smartphone aria-hidden className="size-6 text-acento" />
                <h3 className="mt-3 text-xl font-bold">En la compu y en el celular</h3>
                <p className="mt-1.5 text-sobre-barra-2">
                  Consultá ventas, saldos, stock y precios desde donde estés. Los técnicos trabajan desde el teléfono, también sin
                  señal.
                </p>
              </div>
              <div className="relative flex flex-wrap gap-2 text-xs">
                {['Sin instalar', 'Copias diarias', 'Datos cifrados', 'Permisos por usuario'].map((t) => (
                  <span key={t} className="rounded-full bg-white/10 px-3 py-1 font-medium">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <Bento
              className="md:col-span-3"
              icono={Bell}
              titulo="Te avisa antes de que se te pase"
              texto="Vencimientos de impuestos, cheques a depositar y clientes atrasados."
              visual={<MiniAvisos />}
            />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {MODULOS.map(({ icono: I, titulo, ancla }) => (
              <Link
                key={titulo}
                href={`/funciones#${ancla}`}
                className="inline-flex items-center gap-2 rounded-full bg-superficie px-3.5 py-1.5 text-sm font-medium text-texto-2 shadow-suave ring-1 ring-borde hover:text-acento"
              >
                <I aria-hidden className="size-4" /> {titulo}
              </Link>
            ))}
          </div>
        </Contenedor>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="scroll-mt-20 bg-superficie py-20 sm:py-28">
        <Contenedor className="flex flex-col gap-14">
          <TituloSeccion rotulo="Empezar es simple" titulo="Facturando el mismo día" />
          <ol className="relative grid gap-10 md:grid-cols-3 md:gap-6">
            <div
              aria-hidden
              className="absolute top-7 right-[16%] left-[16%] hidden border-t-2 border-dashed border-borde-fuerte md:block"
            />
            {[
              ['Creá tu cuenta', 'Con el CUIT y un email, en dos minutos. Tenés todo el plan Pyme para probar.', UserPlus],
              ['Traé tus datos', 'Importá clientes, artículos y precios desde Excel, o pedinos que lo hagamos por vos.', Upload],
              ['Conectá ARCA y facturá', 'Cargás tu certificado una vez y emitís la primera factura con CAE.', Rocket],
            ].map(([t, d, I], n) => {
              const Icono = I as typeof Rocket
              return (
                <li key={t as string} className="relative flex flex-col items-center gap-3 text-center">
                  <span className="relative grid size-14 place-items-center rounded-2xl bg-acento text-sobre-acento shadow-panel boton-lleno">
                    <Icono aria-hidden className="size-6" />
                    <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-barra text-xs font-bold text-sobre-barra ring-2 ring-superficie">
                      {n + 1}
                    </span>
                  </span>
                  <h3 className="mt-2 text-lg font-bold">{t as string}</h3>
                  <p className="max-w-xs text-texto-2">{d as string}</p>
                </li>
              )
            })}
          </ol>
          <div className="flex justify-center">
            <Link
              href="/registro"
              className="boton-lleno inline-flex h-12 items-center gap-2 rounded-xl bg-acento px-6 font-semibold text-sobre-acento hover:bg-acento-hover"
            >
              Crear mi cuenta gratis <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </Contenedor>
      </section>

      {/* Para todo el equipo */}
      <section className="py-20 sm:py-28">
        <Contenedor className="flex flex-col gap-12">
          <TituloSeccion
            rotulo="Para todo tu equipo"
            titulo="Cada uno ve lo suyo, todos trabajan sobre lo mismo"
            bajada="Permisos por persona: el que vende no toca la caja, el contador entra a sus libros y vos lo ves todo."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {EQUIPO.map(({ icono: I, quien, titulo, puntos, app }) => (
              <div key={quien} className="tarjeta flex flex-col gap-4 p-6">
                <span className={`grid size-11 place-items-center rounded-xl text-white ${app}`}>
                  <I aria-hidden className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-texto-3">{quien}</p>
                  <h3 className="text-xl font-bold">{titulo}</h3>
                </div>
                <Lista items={puntos} />
              </div>
            ))}
          </div>
        </Contenedor>
      </section>

      {/* Rubros */}
      <section className="bg-superficie py-20 sm:py-28">
        <Contenedor className="flex flex-col gap-12">
          <TituloSeccion rotulo="Para tu rubro" titulo="Pensado para cómo trabaja tu empresa" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SOLUCIONES.map((s) => (
              <Link
                key={s.slug}
                href={`/soluciones/${s.slug}`}
                className="group flex flex-col gap-2 rounded-2xl bg-fondo p-6 ring-1 ring-borde transition hover:-translate-y-0.5 hover:bg-superficie hover:shadow-panel"
              >
                <h3 className="flex items-center justify-between gap-2 text-lg font-bold">
                  {s.menu}
                  <ArrowUpRight aria-hidden className="size-4 text-texto-3 transition group-hover:text-acento" />
                </h3>
                <p className="text-sm text-texto-2">{s.bajada}</p>
              </Link>
            ))}
          </div>
        </Contenedor>
      </section>

      {/* Planes */}
      <section className="py-20 sm:py-28">
        <Contenedor className="flex flex-col gap-12">
          <TituloSeccion
            rotulo="Precios claros"
            titulo="Empezá gratis y crecé cuando lo necesites"
            bajada="Sin permanencia: cambiás de plan o das de baja cuando quieras. Precios por mes más IVA."
          />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLANES.map((p) => (
              <div
                key={p.id}
                className={`relative flex flex-col gap-5 rounded-2xl p-6 ${
                  p.destacado ? 'bg-barra text-sobre-barra shadow-flotante ring-2 ring-acento' : 'tarjeta'
                }`}
              >
                {p.destacado && (
                  <span className="absolute -top-3 left-6 rounded-full bg-acento px-3 py-0.5 text-xs font-bold text-sobre-acento">
                    El más elegido
                  </span>
                )}
                <div>
                  <h3 className="text-lg font-bold">{p.nombre}</h3>
                  <p className={`mt-1 min-h-10 text-sm ${p.destacado ? 'text-sobre-barra-2' : 'text-texto-2'}`}>{p.lema}</p>
                </div>
                <p className="flex flex-wrap items-baseline gap-x-1">
                  <span className="cifras text-[2rem] font-extrabold tracking-tight whitespace-nowrap">
                    {p.precioMensual ? `$ ${p.precioMensual.toLocaleString('es-AR')}` : 'Gratis'}
                  </span>
                  {p.precioMensual > 0 && (
                    <span className={`text-sm ${p.destacado ? 'text-sobre-barra-2' : 'text-texto-2'}`}>/mes</span>
                  )}
                </p>
                <ul className={`flex flex-col gap-2 text-sm ${p.destacado ? 'text-sobre-barra' : 'text-texto-2'}`}>
                  {[
                    `${p.limites.usuarios} ${p.limites.usuarios === 1 ? 'usuario' : 'usuarios'}`,
                    p.limites.comprobantesMes
                      ? `${p.limites.comprobantesMes.toLocaleString('es-AR')} comprobantes por mes`
                      : 'Comprobantes sin límite',
                    ...p.beneficios.slice(0, 2),
                  ].map((b) => (
                    <li key={b} className="flex gap-2">
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-acento" /> {b}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/registro"
                  className={`mt-auto inline-flex h-11 items-center justify-center rounded-xl font-semibold ${
                    p.destacado
                      ? 'boton-lleno bg-acento text-sobre-acento hover:bg-acento-hover'
                      : 'boton-relieve bg-superficie hover:bg-superficie-2'
                  }`}
                >
                  {p.precioMensual ? 'Probar gratis' : 'Empezar gratis'}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-texto-2">
            ¿Necesitás tiendas online o contratos y equipos?{' '}
            <Link href="/precios" className="font-semibold text-acento hover:underline">
              Mirá las aplicaciones y la comparación completa
            </Link>
          </p>
        </Contenedor>
      </section>

      {/* Preguntas */}
      <section className="bg-superficie py-20 sm:py-28">
        <Contenedor className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="flex flex-col items-start gap-4">
            <Rotulo>Preguntas frecuentes</Rotulo>
            <h2 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">Lo que más nos consultan</h2>
            <p className="text-texto-2">¿Te quedó alguna duda? Te respondemos y te mostramos el sistema con tus datos.</p>
            <Link
              href="/contacto"
              className="boton-relieve inline-flex h-11 items-center gap-2 rounded-xl bg-superficie px-5 font-semibold hover:bg-superficie-2"
            >
              Hablar con un asesor <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          <Preguntas preguntas={PREGUNTAS} />
        </Contenedor>
      </section>

      {/* Llamado final */}
      <section className="px-4 py-20 sm:px-6">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-barra px-6 py-16 text-center text-sobre-barra sm:py-20">
          <div
            aria-hidden
            className="absolute -top-32 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-acento/35 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:48px_48px]"
          />
          <div className="relative flex flex-col items-center gap-6">
            <h2 className="max-w-3xl text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
              Ordená tu negocio hoy. Empezá gratis.
            </h2>
            <p className="max-w-xl text-lg text-sobre-barra-2">
              {DIAS_DE_PRUEBA} días con todo el plan Pyme. Si no te convence, no pagás nada y tus datos siguen siendo tuyos.
            </p>
            <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              <Link
                href="/registro"
                className="boton-lleno inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-acento px-7 font-semibold text-sobre-acento hover:bg-acento-hover"
              >
                Crear mi cuenta gratis <ArrowRight aria-hidden className="size-4" />
              </Link>
              <Link
                href="/contacto"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-white/10 px-7 font-semibold ring-1 ring-white/15 hover:bg-white/15"
              >
                Hablar con un asesor
              </Link>
            </div>
            <p className="text-xs text-sobre-barra-2">Sin tarjeta · Sin permanencia · Soporte en castellano</p>
          </div>
        </div>
      </section>
      <BotonWhatsapp />
    </>
  )
}
