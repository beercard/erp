/**
 * Planes de suscripción. Es la única fuente de verdad de qué incluye cada
 * plan: la usan la sesión (para recortar los permisos), el menú, la página
 * de precios y el panel de la plataforma. No toca la base: se puede importar
 * desde el navegador.
 *
 * Un plan habilita funciones (grupos de pantallas) y fija límites. Las
 * aplicaciones son módulos que se contratan aparte sobre un plan. Lo que el
 * plan no incluye no se borra ni se oculta del todo: se ve con un candado y
 * un enlace para mejorar el plan.
 *
 * Los precios son de lista, en pesos, por mes y sin IVA (se factura A o B
 * con el 21 %), y se ajustan cada trimestre. Cada suscripción puede guardar
 * un precio acordado, así un cambio de lista no la toca.
 */

export type Funcion =
  'facturacion' | 'comercial' | 'stock' | 'compras' | 'tesoreria' | 'informes' | 'roles' | 'api' | 'contratos' | 'tienda'

export const FUNCIONES: Record<Funcion, { nombre: string; detalle: string }> = {
  facturacion: {
    nombre: 'Facturación electrónica',
    detalle: 'Facturas, notas de crédito y débito con CAE de ARCA, cobranzas y cuentas corrientes.',
  },
  comercial: {
    nombre: 'Ventas y CRM',
    detalle: 'Embudo de oportunidades, presupuestos, pedidos y remitos con entregas parciales.',
  },
  stock: { nombre: 'Stock', detalle: 'Depósitos, ajustes, transferencias y movimientos.' },
  compras: {
    nombre: 'Compras y pagos',
    detalle: 'Comprobantes desde Mis Comprobantes de ARCA, órdenes de compra y de pago, retenciones de Ganancias.',
  },
  tesoreria: { nombre: 'Tesorería', detalle: 'Cajas, bancos, cheques y ECHEQ, arqueos y conciliación bancaria.' },
  informes: {
    nombre: 'Informes, impuestos y contabilidad',
    detalle: 'Informes de gestión, libros de IVA y presentaciones, y contabilidad con asientos automáticos.',
  },
  roles: { nombre: 'Roles a medida', detalle: 'Permisos definidos por la empresa, además de los roles de sistema.' },
  api: { nombre: 'API e integraciones', detalle: 'Acceso por API para conectar una tienda u otros sistemas.' },
  contratos: {
    nombre: 'Contratos y parque instalado',
    detalle: 'Equipos en clientes, lecturas de contadores, facturación mensual por copias o abonos y servicio técnico.',
  },
  tienda: {
    nombre: 'Tiendas online y Mercado Libre',
    detalle:
      'Mercado Libre, Tienda Nube, WooCommerce, Shopify, Magento y PrestaShop conectados: stock y precios al día y los pedidos entran solos.',
  },
}

export type PlanId = 'gratis' | 'inicial' | 'pyme' | 'empresa'

export type Limites = {
  /** Usuarios con acceso (sin contar los adicionales contratados). */
  usuarios: number
  /** Comprobantes con CAE por mes; null es sin límite. */
  comprobantesMes: number | null
  /** Puntos de venta de factura electrónica. */
  puntosVenta: number
}

export type Plan = {
  id: PlanId
  nombre: string
  lema: string
  /** Pesos por mes, sin IVA. */
  precioMensual: number
  funciones: Funcion[]
  limites: Limites
  /** Lo que no es una pantalla: soporte, capacitación, migración. */
  beneficios: string[]
  /** Se puede sumar aplicaciones (no en el gratis). */
  admiteAplicaciones: boolean
  destacado?: boolean
}

const NUCLEO: Funcion[] = ['facturacion', 'comercial', 'stock']

export const PLANES: Plan[] = [
  {
    id: 'gratis',
    nombre: 'Gratis',
    lema: 'Para facturar desde el primer día, sin pagar.',
    precioMensual: 0,
    funciones: ['facturacion'],
    limites: { usuarios: 1, comprobantesMes: 20, puntosVenta: 1 },
    beneficios: ['Ayuda en línea', 'Sin vencimiento'],
    admiteAplicaciones: false,
  },
  {
    id: 'inicial',
    nombre: 'Inicial',
    lema: 'Comercio o profesional que vende, factura y controla stock.',
    precioMensual: 39_900,
    funciones: NUCLEO,
    limites: { usuarios: 2, comprobantesMes: 300, puntosVenta: 2 },
    beneficios: ['Soporte por email en el día', 'Importación de clientes y artículos desde Excel'],
    admiteAplicaciones: true,
  },
  {
    id: 'pyme',
    nombre: 'Pyme',
    lema: 'La gestión completa: ventas, compras, pagos, bancos e impuestos.',
    precioMensual: 129_900,
    funciones: [...NUCLEO, 'compras', 'tesoreria', 'informes'],
    limites: { usuarios: 5, comprobantesMes: 1_500, puntosVenta: 5 },
    beneficios: ['Soporte por email y WhatsApp', 'Una hora de capacitación al empezar', 'Migración de saldos iniciales'],
    admiteAplicaciones: true,
    destacado: true,
  },
  {
    id: 'empresa',
    nombre: 'Empresa',
    lema: 'Más usuarios, permisos a medida e integraciones.',
    precioMensual: 259_900,
    funciones: [...NUCLEO, 'compras', 'tesoreria', 'informes', 'roles', 'api'],
    limites: { usuarios: 15, comprobantesMes: null, puntosVenta: 20 },
    beneficios: [
      'Soporte prioritario con responsable asignado',
      'Capacitación por rol',
      'Migración asistida desde el sistema anterior',
    ],
    admiteAplicaciones: true,
  },
]

export type Aplicacion = {
  id: Extract<Funcion, 'contratos' | 'tienda'>
  precioMensual: number
  /** Plan mínimo sobre el que se puede contratar. */
  desde: PlanId
  disponible: boolean
}

export const APLICACIONES: Aplicacion[] = [
  { id: 'contratos', precioMensual: 59_900, desde: 'pyme', disponible: true },
  { id: 'tienda', precioMensual: 39_900, desde: 'inicial', disponible: true },
]

/** Cada usuario por encima de los del plan. */
export const PRECIO_USUARIO_ADICIONAL = 14_900
/** En el pago anual se cobran 10 meses. */
export const MESES_COBRADOS_EN_ANUAL = 10
export const DIAS_DE_PRUEBA = 30
/** Días después del vencimiento en que se puede seguir trabajando. */
export const DIAS_DE_GRACIA = 10
/** El plan de la prueba gratis: se prueba todo lo de una pyme. */
export const PLAN_DE_PRUEBA: PlanId = 'pyme'

export const planPorId = (id: string) => PLANES.find((p) => p.id === id) ?? PLANES[0]
export const ORDEN_PLANES: PlanId[] = PLANES.map((p) => p.id)
/** El plan más barato que incluye una función. */
export const planQueIncluye = (f: Funcion) =>
  PLANES.find((p) => p.funciones.includes(f)) ?? PLANES.find((p) => APLICACIONES.some((a) => a.id === f && a.desde === p.id))

// ------------------------------------------------- Permisos según el plan

/**
 * Función que necesita cada permiso. Los que no figuran (maestros, datos de
 * la empresa, usuarios) van en todos los planes.
 */
const FUNCION_DE_PERMISO: Record<string, Funcion> = {
  'ventas.ver': 'facturacion',
  'ventas.facturar': 'facturacion',
  'ventas.anular': 'facturacion',
  'ventas.cobrar': 'facturacion',
  'ventas.pasarelas': 'facturacion',
  'ventas.presupuestos': 'comercial',
  'ventas.pedidos': 'comercial',
  'ventas.remitos': 'comercial',
  'empresa.integraciones': 'api',
}
const FUNCION_DE_MODULO: Record<string, Funcion> = {
  stock: 'stock',
  compras: 'compras',
  tesoreria: 'tesoreria',
  informes: 'informes',
  impuestos: 'informes',
  contabilidad: 'informes',
  contratos: 'contratos',
  servicio: 'contratos',
  tienda: 'tienda',
  crm: 'comercial',
  whatsapp: 'comercial',
}

export function funcionDePermiso(permiso: string): Funcion | null {
  return FUNCION_DE_PERMISO[permiso] ?? FUNCION_DE_MODULO[permiso.split('.')[0]] ?? null
}

/** Permisos que se pueden usar con la suscripción vencida: ver, y arreglar la suscripción. */
export const permisoDeLectura = (permiso: string) => permiso.endsWith('.ver') || permiso === 'empresa.suscripcion'

// ------------------------------------------------------------ Estado

export type EstadoSuscripcion = 'prueba' | 'activa' | 'impaga' | 'suspendida' | 'cancelada'

export type DatosSuscripcion = {
  plan: string
  estado: string
  aplicaciones: string[]
  usuariosAdicionales: number
  pruebaHasta: string | null
  pagadoHasta: string | null
}

export type Situacion = {
  plan: Plan
  funciones: Funcion[]
  limites: Limites
  /** Con la suscripción vencida solo se puede consultar. */
  soloLectura: boolean
  /** Para el aviso de la barra superior. */
  aviso: { tono: 'info' | 'aviso' | 'error'; texto: string } | null
  diasDePrueba: number | null
}

const dias = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000)

/** Qué puede hacer hoy una empresa según su suscripción. */
export function situacion(s: DatosSuscripcion, hoy: string): Situacion {
  const plan = planPorId(s.plan)
  const aplicaciones = plan.admiteAplicaciones ? APLICACIONES.filter((a) => s.aplicaciones.includes(a.id)).map((a) => a.id) : []
  const funciones = [...plan.funciones, ...aplicaciones]
  const limites = { ...plan.limites, usuarios: plan.limites.usuarios + s.usuariosAdicionales }
  const base = { plan, funciones, limites, diasDePrueba: null }

  if (s.estado === 'suspendida' || s.estado === 'cancelada') {
    return {
      ...base,
      soloLectura: true,
      aviso: {
        tono: 'error',
        texto: `La suscripción está ${s.estado}: se pueden consultar los datos, pero no cargar nada nuevo.`,
      },
    }
  }
  if (s.estado === 'prueba' && s.pruebaHasta) {
    const quedan = dias(hoy, s.pruebaHasta)
    if (quedan < 0) {
      return {
        ...base,
        soloLectura: true,
        aviso: { tono: 'error', texto: 'Terminó la prueba gratis. Elegí un plan para seguir cargando datos: no se pierde nada.' },
      }
    }
    return {
      ...base,
      soloLectura: false,
      diasDePrueba: quedan,
      aviso: { tono: 'info', texto: `Prueba gratis: ${quedan === 0 ? 'último día' : `quedan ${quedan} días`}.` },
    }
  }
  if (s.pagadoHasta && plan.precioMensual > 0) {
    const atraso = dias(s.pagadoHasta, hoy)
    if (atraso > DIAS_DE_GRACIA) {
      return {
        ...base,
        soloLectura: true,
        aviso: {
          tono: 'error',
          texto: 'La suscripción está impaga: se puede consultar, pero no cargar datos hasta regularizarla.',
        },
      }
    }
    if (atraso > 0) {
      return {
        ...base,
        soloLectura: false,
        aviso: {
          tono: 'aviso',
          texto: `La suscripción venció el ${s.pagadoHasta.split('-').reverse().join('/')}. Quedan ${DIAS_DE_GRACIA - atraso} días para regularizarla.`,
        },
      }
    }
  }
  return { ...base, soloLectura: false, aviso: null }
}

/** ¿Habilita la suscripción este permiso? (el rol se controla aparte) */
export function permitidoPorPlan(sit: Pick<Situacion, 'funciones' | 'soloLectura'>, permiso: string) {
  const funcion = funcionDePermiso(permiso)
  if (funcion && !sit.funciones.includes(funcion)) return false
  return !sit.soloLectura || permisoDeLectura(permiso)
}

/** Precio mensual de lista de una suscripción (sin IVA). */
export function precioDeLista(s: Pick<DatosSuscripcion, 'plan' | 'aplicaciones' | 'usuariosAdicionales'>) {
  const plan = planPorId(s.plan)
  const apps = APLICACIONES.filter((a) => s.aplicaciones.includes(a.id)).reduce((t, a) => t + a.precioMensual, 0)
  return plan.precioMensual + apps + s.usuariosAdicionales * PRECIO_USUARIO_ADICIONAL
}
