/** Páginas por rubro (SEO): cada una apunta a una búsqueda concreta. */
export type Solucion = {
  slug: string
  menu: string
  titulo: string
  descripcion: string
  h1: string
  bajada: string
  dolores: string[]
  funciones: { titulo: string; texto: string }[]
  preguntas: { p: string; r: string }[]
}

export const SOLUCIONES: Solucion[] = [
  {
    slug: 'comercios-y-distribuidoras',
    menu: 'Comercios y distribuidoras',
    titulo: 'Sistema de gestión para comercios y distribuidoras',
    descripcion:
      'Facturación electrónica ARCA, stock por depósito, listas de precios, cuentas corrientes, compras y pagos con retenciones. ERP en la nube para pymes argentinas.',
    h1: 'El sistema de gestión para comercios y distribuidoras',
    bajada:
      'Presupuestá, vendé, entregá y facturá desde el mismo lugar. El stock se mueve solo con cada remito y la cuenta corriente de cada cliente está siempre al día.',
    dolores: [
      'Precios en varias planillas que nunca coinciden',
      'Stock que figura pero no está (o al revés)',
      'Facturar en un sistema y cobrar en otro',
      'No saber cuánto te deben ni a quién',
    ],
    funciones: [
      {
        titulo: 'Listas de precios derivadas',
        texto: 'Una lista base y las demás con recargo o descuento: actualizás una y cambian todas.',
      },
      {
        titulo: 'Stock por depósito',
        texto: 'Remitos con entregas parciales, transferencias, ajustes y el historial de cada movimiento.',
      },
      {
        titulo: 'Facturación electrónica',
        texto: 'Facturas A, B y C, notas de crédito y débito y Factura de Crédito MiPyME con CAE de ARCA.',
      },
      { titulo: 'Cuentas corrientes', texto: 'Cobranzas con cheques, ECHEQ y transferencias, y la deuda vencida a la vista.' },
      {
        titulo: 'Compras y pagos',
        texto: 'Comprobantes desde Mis Comprobantes de ARCA y órdenes de pago con la retención de Ganancias calculada.',
      },
      { titulo: 'Informes', texto: 'Ventas por cliente, artículo y vendedor, márgenes y posición de IVA del mes.' },
    ],
    preguntas: [
      {
        p: '¿Puedo tener varios depósitos y sucursales?',
        r: 'Sí. Cada depósito tiene su stock y los puntos de venta se asignan a cada sucursal. Las transferencias entre depósitos quedan registradas.',
      },
      {
        p: '¿Sirve para vender en cuotas con recargo?',
        r: 'Sí: armás una lista derivada (por ejemplo, "Tarjeta 6 cuotas" = lista general + 30 %) y se usa como cualquier otra.',
      },
      {
        p: '¿Puedo pasar mis clientes y artículos desde Excel?',
        r: 'Sí. Se importan clientes, proveedores, artículos, precios y saldos iniciales.',
      },
    ],
  },
  {
    slug: 'servicio-tecnico',
    menu: 'Servicio técnico',
    titulo: 'Software para servicio técnico y mantenimiento',
    descripcion:
      'Órdenes de trabajo, agenda de técnicos, app para el celular con fotos y firma, preventivos, portal de clientes y facturación de las visitas, en un solo sistema.',
    h1: 'Servicio técnico organizado, del pedido a la factura',
    bajada:
      'Coordinás la agenda, el técnico trabaja desde el celular (también sin señal) y la orden cerrada se factura sin volver a cargar nada.',
    dolores: [
      'Órdenes en papel o en WhatsApp que se pierden',
      'No saber dónde está cada técnico ni cuánto tarda',
      'Visitas hechas que nunca se facturan',
      'Clientes que llaman para preguntar "¿cuándo vienen?"',
    ],
    funciones: [
      { titulo: 'Agenda y despacho', texto: 'Calendario por técnico, asistente que busca el primer hueco libre y hoja de ruta.' },
      {
        titulo: 'App del técnico',
        texto: 'Formularios con fotos, firma y condiciones; funciona sin señal y se sincroniza al volver.',
      },
      {
        titulo: 'Preventivos y SLA',
        texto: 'Mantenimientos por fecha o por contador, con alertas antes de vencer el tiempo de respuesta.',
      },
      {
        titulo: 'Portal y seguimiento',
        texto: 'El cliente pide visitas, ve sus órdenes y sigue al técnico con un enlace.',
      },
      {
        titulo: 'Jornadas y zonas',
        texto: 'Fichada con GPS, kilómetros, visitas detectadas y aviso si un técnico sale de su zona.',
      },
      { titulo: 'Facturación integrada', texto: 'Las órdenes con cargo se facturan desde el mismo sistema, con su stock.' },
    ],
    preguntas: [
      {
        p: '¿El técnico necesita instalar una app?',
        r: 'No hace falta pasar por las tiendas: se abre desde el navegador del celular (Android o iPhone) y se puede instalar como aplicación.',
      },
      {
        p: '¿Puedo traer el historial de otro sistema de servicio técnico?',
        r: 'Sí. Importamos clientes, equipos y órdenes con su historia; la migración se prueba primero sin grabar nada.',
      },
      {
        p: '¿Cómo se entera el cliente?',
        r: 'Recibe el aviso de la visita con un enlace para seguirla, y una encuesta corta al cerrar la orden.',
      },
    ],
  },
  {
    slug: 'tiendas-online',
    menu: 'Tiendas online y Mercado Libre',
    titulo: 'ERP conectado con Mercado Libre, Tienda Nube y WooCommerce',
    descripcion:
      'Stock y precios sincronizados con tus tiendas y los pedidos pagados entrando solos al ERP, listos para remitir y facturar con ARCA.',
    h1: 'Vendé en todos lados con un solo stock',
    bajada:
      'Conectá Mercado Libre, Tienda Nube o WooCommerce en un minuto. El stock y los precios se actualizan solos y cada venta pagada entra como pedido.',
    dolores: [
      'Vender algo que ya no tenés',
      'Cargar a mano cada venta para facturarla',
      'Actualizar precios en tres lugares distintos',
      'Perder el control de qué se despachó',
    ],
    funciones: [
      {
        titulo: 'Conexión en un clic',
        texto: 'Autorizás con tu cuenta de vendedor o aprobás desde tu tienda: no hay claves que copiar.',
      },
      { titulo: 'Stock único', texto: 'Cada venta, compra o ajuste se refleja en todas las tiendas.' },
      { titulo: 'Precios con IVA', texto: 'Elegís una lista y la tienda recibe el precio final, solo cuando cambia.' },
      {
        titulo: 'Pedidos automáticos',
        texto: 'Las ventas pagadas entran como pedidos, con el cliente creado si es nuevo.',
      },
      { titulo: 'Vínculo por SKU', texto: 'Si el SKU es el código del artículo, se vincula solo. Si no, lo elegís una vez.' },
      { titulo: 'Facturación ARCA', texto: 'Del pedido al remito y a la factura electrónica, sin volver a cargar nada.' },
    ],
    preguntas: [
      {
        p: '¿Qué plataformas se pueden conectar?',
        r: 'Mercado Libre, Tienda Nube, WooCommerce, Shopify, Magento y PrestaShop. Para otras tiendas está la API del sistema.',
      },
      {
        p: '¿Tiene costo aparte?',
        r: 'Es una aplicación que se suma a cualquier plan pago desde el Inicial; podés conectar varias tiendas.',
      },
      {
        p: '¿Qué pasa si cancelan una venta?',
        r: 'Si se cancela en la tienda antes de entregarla, el pedido del sistema se cancela solo.',
      },
    ],
  },
  {
    slug: 'alquiler-de-equipos',
    menu: 'Alquiler de equipos y contratos',
    titulo: 'Sistema para alquiler de fotocopiadoras e impresoras',
    descripcion:
      'Contratos por copias o abonos, lecturas de contadores, facturación mensual automática, parque instalado y servicio técnico en un solo ERP.',
    h1: 'Contratos, contadores y facturación mensual, sin planillas',
    bajada:
      'Cargá las lecturas (o importalas), y el sistema calcula excedentes, arma las facturas del mes y deja todo listo para emitir con ARCA.',
    dolores: [
      'Lecturas de contadores en planillas sueltas',
      'Excedentes calculados a mano cada mes',
      'Equipos instalados que nadie sabe dónde están',
      'Visitas técnicas que no se cruzan con el contrato',
    ],
    funciones: [
      {
        titulo: 'Contratos flexibles',
        texto: 'Abono, excedente o cargo fijo; por contrato o por equipo; en pesos o dólares.',
      },
      { titulo: 'Lecturas', texto: 'Carga manual, desde el portal del cliente o importadas de la herramienta de monitoreo.' },
      { titulo: 'Facturación del mes', texto: 'Un proceso arma todas las facturas con su detalle y las emite juntas.' },
      { titulo: 'Parque instalado', texto: 'Cada equipo con su cliente, ubicación, historia de servicio y contador.' },
      { titulo: 'Preventivos por copias', texto: 'El mantenimiento se programa cuando el contador llega al umbral.' },
      { titulo: 'Servicio técnico', texto: 'Órdenes, agenda y app del técnico, unidas al contrato y al equipo.' },
    ],
    preguntas: [
      {
        p: '¿Puedo migrar desde PYMEXIS?',
        r: 'Sí. Importamos clientes, artículos, contratos, equipos y el historial de lecturas.',
      },
      {
        p: '¿Cómo se toman las lecturas?',
        r: 'A mano, desde el portal de clientes o importando el archivo de la herramienta de monitoreo de equipos.',
      },
      {
        p: '¿Se puede facturar en dólares?',
        r: 'Sí: el contrato se define en la moneda que quieras y se factura con la cotización del día.',
      },
    ],
  },
  {
    slug: 'estudios-contables',
    menu: 'Estudios contables',
    titulo: 'Sistema para estudios contables y sus clientes pymes',
    descripcion:
      'Entrá a todas las empresas de tus clientes con un usuario: Libro IVA Digital, SICORE, IIBB, contabilidad con asientos automáticos y paquete mensual para el contador.',
    h1: 'Todos tus clientes en un solo usuario',
    bajada:
      'Tus clientes facturan y cargan sus compras; vos entrás a cada empresa con el rol Contador y encontrás los libros, las presentaciones y los asientos listos.',
    dolores: [
      'Pedir planillas a cada cliente todos los meses',
      'Recargar comprobantes que ya están en ARCA',
      'Asientos que se hacen al cierre, a las apuradas',
      'Vencimientos que se pasan',
    ],
    funciones: [
      { titulo: 'Rol Contador', texto: 'Acceso a libros, impuestos y contabilidad, sin tocar la operación del cliente.' },
      { titulo: 'Libro IVA Digital', texto: 'Ventas y compras con controles antes de presentar, y cruce con Mis Comprobantes.' },
      { titulo: 'Retenciones y percepciones', texto: 'SICORE, IIBB y la posición de IVA del mes, con arrastre de saldos.' },
      { titulo: 'Contabilidad automática', texto: 'Cada operación genera su asiento; libro diario, mayor y balances.' },
      { titulo: 'Vencimientos', texto: 'Calendario impositivo de cada empresa con avisos por email.' },
      { titulo: 'Paquete mensual', texto: 'Todo lo del mes en un archivo para descargar.' },
    ],
    preguntas: [
      {
        p: '¿Tengo que pagar por cada cliente?',
        r: 'No: cada empresa tiene su propia suscripción y vos entrás con tu usuario a todas las que te invitan (ocupás uno de sus usuarios).',
      },
      {
        p: '¿Puedo usar solo la parte impositiva?',
        r: 'Sí. El rol Contador ve libros, impuestos y contabilidad; la operación la sigue haciendo el cliente.',
      },
      {
        p: '¿Los asientos se pueden corregir?',
        r: 'Sí: se reclasifican o se cargan asientos manuales, y el cierre de ejercicio deja todo bloqueado.',
      },
    ],
  },
]

export const solucionPorSlug = (slug: string) => SOLUCIONES.find((s) => s.slug === slug) ?? null
