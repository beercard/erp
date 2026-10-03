import type { Aplicacion } from './planes'

/**
 * Rubros que se eligen al registrarse ("¿A qué se dedica tu empresa?"): cada
 * uno suma su aplicación a la prueba gratis (el plan Inicial más lo que viene
 * a buscar). Lo que se precarga en la base está en
 * src/modulos/plataforma/rubros.ts. Coinciden con las páginas de soluciones
 * del sitio (mismo slug). No toca la base: se usa también en el navegador.
 */
export type Rubro = {
  id: string
  nombre: string
  /** Aplicaciones que suma la prueba (y que se sugieren al elegir plan). */
  aplicaciones: Aplicacion['id'][]
  /** Qué queda listo, en una línea. */
  resumen: string
}

export const RUBROS: Rubro[] = [
  {
    id: 'comercios-y-distribuidoras',
    nombre: 'Comercio o distribuidora',
    aplicaciones: [],
    resumen: 'Listas mayorista y con tarjeta, y condiciones a 15 y 60 días.',
  },
  {
    id: 'mayoristas-y-distribucion',
    nombre: 'Mayorista o distribución',
    aplicaciones: [],
    resumen: 'Lista minorista, condiciones a 15, 60 y 90 días y recordatorios de deuda activados.',
  },
  {
    id: 'servicio-tecnico',
    nombre: 'Servicio técnico',
    aplicaciones: ['servicio'],
    resumen: 'Servicio técnico activado, con tipos de orden y servicios para facturar (visita y mano de obra).',
  },
  {
    id: 'alquiler-de-equipos',
    nombre: 'Alquiler de equipos o abonos (fotocopiadoras, dispensers…)',
    aplicaciones: ['servicio', 'contratos'],
    resumen: 'Contratos y servicio técnico activados, con tipos de orden para service, instalación, retiro e insumos.',
  },
  {
    id: 'tiendas-online',
    nombre: 'Tienda online o Mercado Libre',
    aplicaciones: ['tienda'],
    resumen: 'Tiendas online activadas: conectás Mercado Libre, Tienda Nube u otra y los pedidos entran solos.',
  },
  {
    id: 'profesionales-y-servicios',
    nombre: 'Profesional o empresa de servicios',
    aplicaciones: [],
    resumen: 'Servicios para facturar (honorarios y abono mensual) y recordatorios de deuda activados.',
  },
  {
    id: 'estudios-contables',
    nombre: 'Estudio contable',
    aplicaciones: [],
    resumen: 'Servicios para facturar a tus clientes (honorarios y liquidación de sueldos) y recordatorios de deuda.',
  },
  { id: 'otro', nombre: 'Otro rubro', aplicaciones: [], resumen: 'Lo básico: depósito, lista general y condiciones de pago.' },
]

export const rubroPorId = (id: string | null | undefined) => RUBROS.find((r) => r.id === id) ?? null
