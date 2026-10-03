import type { Metadata } from 'next'
import Link from 'next/link'

import { Contenedor, Lista, Llamado, Rotulo } from '@/components/sitio/Bloques'

export const metadata: Metadata = {
  title: 'Funciones del sistema de gestión',
  description:
    'Facturación electrónica ARCA, CRM, ventas, stock, compras, tesorería, Libro IVA Digital, SICORE, contabilidad, tiendas online y servicio técnico en un solo ERP para pymes.',
  alternates: { canonical: '/funciones' },
}

const AREAS = [
  {
    id: 'facturacion',
    rotulo: 'Facturación',
    titulo: 'Facturación electrónica con ARCA',
    texto: 'Emití en segundos, con los controles que evitan rechazos y el comprobante listo para mandar.',
    items: [
      'Facturas A, B y C, notas de crédito y débito con CAE',
      'Factura de Crédito Electrónica MiPyME',
      'Percepciones de IIBB por padrón y jurisdicción',
      'Cobranzas con efectivo, transferencias, cheques, ECHEQ y retenciones sufridas',
      'Cuentas corrientes con deuda vencida y resumen de cuenta',
    ],
  },
  {
    id: 'crm',
    rotulo: 'CRM',
    titulo: 'Embudo de ventas: de prospecto a cliente',
    texto: 'Seguí cada venta posible hasta cerrarla, sin planillas ni recordatorios en papel.',
    items: [
      'Embudo por etapas para arrastrar, con totales y pronóstico ponderado',
      'Llamadas, reuniones, emails y WhatsApp agendados, con aviso de lo vencido',
      'Alerta de oportunidades estancadas y sin próximo contacto',
      'Del prospecto al cliente y al presupuesto en un clic',
      'Motivos de pérdida, tasa de cierre y ventas por vendedor y por origen',
    ],
  },
  {
    id: 'ventas',
    rotulo: 'Ventas y stock',
    titulo: 'Del presupuesto a la entrega',
    texto: 'Cada paso usa el anterior: no se vuelve a cargar nada.',
    items: [
      'Presupuestos y pedidos con estados y vencimientos',
      'Remitos con entregas parciales que mueven el stock',
      'Stock por depósito, transferencias, ajustes y números de serie',
      'Listas de precios en pesos o dólares, con listas derivadas',
      'Búsqueda universal y atajos de teclado para cargar rápido',
    ],
  },
  {
    id: 'compras',
    rotulo: 'Compras',
    titulo: 'Compras y pagos a proveedores',
    texto: 'Traé los comprobantes desde ARCA y pagá con las retenciones calculadas.',
    items: [
      'Importación desde Mis Comprobantes de ARCA y cruce con lo cargado',
      'Órdenes de compra y recepción de mercadería',
      'Órdenes de pago con retención de Ganancias y certificado',
      'Cuentas corrientes de proveedores y vencimientos',
    ],
  },
  {
    id: 'tesoreria',
    rotulo: 'Tesorería',
    titulo: 'Cajas, bancos y valores',
    texto: 'Sabé cuánta plata hay y dónde, todos los días.',
    items: [
      'Cajas y cuentas bancarias en pesos y dólares',
      'Cheques y ECHEQ en cartera, depositados y rechazados',
      'Conciliación bancaria y arqueos de caja',
    ],
  },
  {
    id: 'impuestos',
    rotulo: 'Impuestos y contabilidad',
    titulo: 'Impuestos al día y contabilidad automática',
    texto: 'El contador encuentra todo listo, sin pedir planillas.',
    items: [
      'Libro IVA Digital de ventas y compras con controles previos',
      'Posición de IVA del mes con arrastre del saldo a favor',
      'SICORE, retenciones y percepciones de IIBB',
      'Asientos automáticos, libro diario, mayor, sumas y saldos y balances',
      'Calendario de vencimientos con avisos y paquete mensual para el contador',
    ],
  },
  {
    id: 'tiendas',
    rotulo: 'Tiendas online',
    titulo: 'Mercado Libre, Tienda Nube y WooCommerce',
    texto: 'Un solo stock para todos tus canales y los pedidos entrando solos.',
    items: [
      'Conexión en un clic, sin copiar claves',
      'Stock y precios con IVA actualizados solo cuando cambian',
      'Pedidos pagados convertidos en pedidos del sistema, con el cliente',
      'Vínculo automático por SKU y avisos al instante',
    ],
    enlace: '/soluciones/tiendas-online',
  },
  {
    id: 'servicio',
    rotulo: 'Servicio técnico',
    titulo: 'Órdenes de trabajo y técnicos en la calle',
    texto: 'Coordinación, app del técnico y facturación en el mismo sistema.',
    items: [
      'Tipos de orden con formularios propios, fotos y firma',
      'Calendario por técnico y asistente de huecos libres',
      'App del técnico que funciona sin señal',
      'Preventivos, SLA, encuestas y portal de clientes',
      'Fichada con GPS, zonas de trabajo y visitas detectadas',
    ],
    enlace: '/soluciones/servicio-tecnico',
  },
  {
    id: 'contratos',
    rotulo: 'Contratos',
    titulo: 'Contratos, equipos y lecturas',
    texto: 'Para empresas que alquilan o mantienen equipos con abono o por uso.',
    items: [
      'Contratos por abono, excedente o cargo fijo, por equipo o por contrato',
      'Lecturas de contadores manuales, desde el portal o importadas',
      'Facturación mensual de todos los contratos en un paso',
    ],
    enlace: '/soluciones/alquiler-de-equipos',
  },
  {
    id: 'empresa',
    rotulo: 'Para toda la empresa',
    titulo: 'Usuarios, permisos e integraciones',
    texto: 'Cada uno ve y hace lo que le corresponde.',
    items: [
      'Roles de sistema y roles a medida, y grupos de clientes por usuario',
      'Varias empresas con un mismo usuario (ideal para estudios contables)',
      'Auditoría de cada cambio: quién, cuándo y qué',
      'API con claves y webhooks firmados para conectar otros sistemas',
    ],
  },
]

export default function Funciones() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-borde">
        <div aria-hidden className="fondo-sitio pointer-events-none absolute inset-0" />
        <Contenedor className="relative flex flex-col items-center gap-4 py-16 text-center sm:py-20">
          <Rotulo>Funciones</Rotulo>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Todo lo que necesita tu pyme, conectado
          </h1>
          <p className="max-w-2xl text-lg text-texto-2">
            Cada módulo se apoya en los demás: lo que se carga una vez llega al stock, a la cuenta corriente, a los libros de IVA
            y a la contabilidad.
          </p>
          <nav aria-label="Áreas" className="mt-4 flex flex-wrap justify-center gap-2">
            {AREAS.map((a) => (
              <a
                key={a.id}
                href={`#${a.id}`}
                className="rounded-full border border-borde bg-superficie px-3 py-1 text-sm text-texto-2 hover:text-texto"
              >
                {a.rotulo}
              </a>
            ))}
          </nav>
        </Contenedor>
      </section>
      <Contenedor className="flex flex-col divide-y divide-borde">
        {AREAS.map((a, i) => (
          <section key={a.id} id={a.id} className="grid scroll-mt-24 gap-8 py-14 lg:grid-cols-2">
            <div className={`flex flex-col gap-3 ${i % 2 ? 'lg:order-2' : ''}`}>
              <Rotulo>{a.rotulo}</Rotulo>
              <h2 className="text-3xl font-semibold tracking-tight">{a.titulo}</h2>
              <p className="text-lg text-texto-2">{a.texto}</p>
              {a.enlace && (
                <Link href={a.enlace} className="text-sm font-medium text-acento hover:underline">
                  Conocé más →
                </Link>
              )}
            </div>
            <div className="rounded-xl border border-borde bg-superficie p-6">
              <Lista items={a.items} />
            </div>
          </section>
        ))}
      </Contenedor>
      <Llamado titulo="¿Querés verlo funcionando?" bajada="Creá tu cuenta y probalo con tus datos, o pedinos una demostración." />
    </>
  )
}
