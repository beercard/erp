/**
 * Centro de ayuda: guías paso a paso para que cada empresa configure sola sus
 * conexiones (ARCA, ARBA, cobros, WhatsApp, tiendas, API) y su equipo. El
 * contenido sigue lo que piden las pantallas del sistema: si cambia una
 * pantalla, se actualiza su guía acá.
 */

export type Paso = {
  titulo: string
  /** Párrafos o viñetas (las que empiezan con "- " van como lista). */
  texto: string[]
  /** Comando o texto para copiar tal cual. */
  codigo?: string
  /** Advertencia destacada. */
  ojo?: string
}

export type Guia = {
  id: string
  titulo: string
  resumen: string
  categoria: Categoria
  /** Minutos estimados. */
  minutos: number
  /** Quién puede hacerlo (rol o permiso, en palabras). */
  quien: string
  /** Pantalla del sistema donde se hace. */
  pantalla?: { href: string; texto: string }
  antes: string[]
  pasos: Paso[]
  problemas?: { sintoma: string; solucion: string }[]
  relacionadas?: string[]
}

export const CATEGORIAS = {
  inicio: 'Primeros pasos',
  fiscal: 'ARCA, ARBA e impuestos',
  cobros: 'Cobros y suscripción',
  canales: 'WhatsApp y tiendas online',
  equipo: 'Usuarios, permisos y clientes',
  integraciones: 'API y automatizaciones',
} as const
export type Categoria = keyof typeof CATEGORIAS

export const GUIAS: Guia[] = [
  // ------------------------------------------------------------ Primeros pasos
  {
    id: 'primeros-pasos',
    titulo: 'Puesta en marcha de la empresa',
    resumen: 'El orden recomendado para dejar el sistema listo para facturar en una tarde.',
    categoria: 'inicio',
    minutos: 60,
    quien: 'El dueño o quien administre la empresa',
    pantalla: { href: '/configuracion', texto: 'Ir a Configuración' },
    antes: [
      'Clave fiscal de ARCA nivel 3 del titular (o de quien tenga la representación).',
      'Constancia de inscripción a mano, para copiar los datos tal cual figuran en ARCA.',
      'Si venís de otro sistema: el listado de clientes, artículos y saldos.',
    ],
    pasos: [
      {
        titulo: 'Revisá los datos de la empresa',
        texto: [
          'Configuración → Datos de la empresa. Razón social, condición frente al IVA, Ingresos Brutos, inicio de actividades y domicilio fiscal tienen que coincidir con los de ARCA: salen impresos en cada factura.',
        ],
      },
      {
        titulo: 'Subí tu logo y elegí el diseño de factura',
        texto: ['Configuración → Logo y diseño de factura. Ver la guía "Logo y diseño de factura".'],
      },
      {
        titulo: 'Dá de alta el punto de venta en ARCA y en el sistema',
        texto: ['Ver la guía "Punto de venta para factura electrónica". Usá uno nuevo, exclusivo para este sistema.'],
      },
      {
        titulo: 'Conectá ARCA',
        texto: [
          'Ver la guía "Conectar ARCA (factura electrónica)". Empezá en homologación (prueba), emití una factura de prueba y recién después pasá a producción.',
        ],
      },
      {
        titulo: 'Cargá clientes y artículos',
        texto: [
          'Desde Maestros → Clientes y proveedores y Artículos y precios. Con el servicio de padrón activo, al cargar un CUIT el sistema completa los datos solo. Si venís de otro sistema o de Excel, importalos en bloque: ver la guía "Importar desde planillas".',
        ],
      },
      {
        titulo: 'Invitá a tu equipo y a tu contador',
        texto: ['Ver la guía "Usuarios, roles y permisos". Cada persona con su propio usuario: nunca compartas claves.'],
      },
      {
        titulo: 'Emití la primera factura real',
        texto: [
          'Una factura chica a un cliente de confianza. Verificala en ARCA → Mis Comprobantes → Emitidos. Si está, todo funciona.',
        ],
      },
    ],
    relacionadas: ['arca', 'importar', 'punto-de-venta', 'usuarios', 'diseno-factura'],
  },
  {
    id: 'importar',
    titulo: 'Importar desde planillas',
    resumen:
      'Clientes, proveedores, artículos con precio y stock, y saldos iniciales desde Excel o CSV, sin cargarlos uno por uno.',
    categoria: 'inicio',
    minutos: 30,
    quien: 'Quien pueda cargar clientes o artículos (los saldos, quien administre la empresa)',
    pantalla: { href: '/configuracion/importar', texto: 'Ir a Importar desde planillas' },
    antes: [
      'Los listados exportados del sistema anterior, en Excel (.xlsx) o CSV. Hasta 2.000 filas y 5 MB por archivo.',
      'Los saldos de cuentas corrientes a una fecha de corte (por ejemplo, el último día del mes anterior).',
    ],
    pasos: [
      {
        titulo: 'Descargá la planilla modelo',
        texto: [
          'Cada sección tiene la suya, con un ejemplo y una hoja que explica cada columna. Podés usar tu propia planilla: lo que cuenta es el nombre de la columna en la primera fila (sin importar mayúsculas ni acentos).',
        ],
      },
      {
        titulo: 'Primero clientes y proveedores',
        texto: [
          'Se buscan por CUIT o DNI: si ya existen, se actualizan con lo que traiga la planilla y lo vacío no se toca. Así podés importar dos veces sin duplicar.',
          '- La condición frente al IVA admite "RI", "Monotributo", "Exento" o "Consumidor final".',
          '- La columna tipo dice si es cliente, proveedor o ambos.',
        ],
      },
      {
        titulo: 'Después los artículos',
        texto: [
          'Se buscan por código. El precio va a la lista general con vigencia desde hoy; los rubros y marcas que no existan se crean. El stock inicial entra solo en los artículos nuevos, en el primer depósito.',
        ],
      },
      {
        titulo: 'Por último los saldos iniciales',
        texto: [
          'Una fila por cliente o proveedor con lo que se debe a la fecha de corte. Positivo es deuda; negativo, saldo a favor. Entra como saldo inicial: aparece en la cuenta corriente y se cancela con cobranzas y pagos, pero no va al Libro IVA ni a la contabilidad.',
        ],
        ojo: 'Cada cliente o proveedor admite un solo saldo importado, para que importar dos veces no duplique la deuda. Revisá bien la vista previa antes de confirmar.',
      },
      {
        titulo: 'Revisá y confirmá',
        texto: [
          'Al subir el archivo ves cuántas altas y actualizaciones habrá y qué filas tienen errores (con el número de fila de la planilla). Nada se guarda hasta que tocás "Importar". Las filas con errores se saltean: corregilas y subí solo esas.',
        ],
      },
    ],
    problemas: [
      {
        sintoma: 'Todas las filas dicen "Falta la razón social" o "Falta el código"',
        solucion: 'La primera fila tiene que tener los títulos de las columnas. Compará con la planilla modelo.',
      },
      {
        sintoma: 'Un saldo dice que no existe el cliente o proveedor',
        solucion: 'Importá antes clientes y proveedores, o revisá que el CUIT sea el mismo.',
      },
    ],
    relacionadas: ['primeros-pasos'],
  },
  {
    id: 'seguridad',
    titulo: 'Seguridad de la cuenta y cómo evitar engaños',
    resumen: 'Buenas prácticas para que nadie entre a tu empresa ni te robe claves con un correo falso.',
    categoria: 'inicio',
    minutos: 5,
    quien: 'Todos los usuarios',
    antes: [],
    pasos: [
      {
        titulo: 'Entrá siempre por la dirección de tu empresa',
        texto: [
          'Tu empresa tiene una dirección propia (por ejemplo, tuempresa.erp.vektra.digital). Guardala en favoritos y entrá siempre desde ahí.',
          'Antes de escribir tu clave, mirá que la dirección termine exactamente en erp.vektra.digital y tenga el candado del navegador.',
        ],
      },
      {
        titulo: 'Nunca te vamos a pedir tu clave',
        texto: [
          'Ni por email, ni por teléfono, ni por WhatsApp. Tampoco el certificado de ARCA, la CIT de ARBA ni los tokens de Mercado Pago o Meta.',
          'Si recibís un pedido así, aunque parezca nuestro, no respondas y avisanos.',
        ],
      },
      {
        titulo: 'Un usuario por persona, con el rol justo',
        texto: [
          '- Cada empleado con su usuario: así queda registrado quién hizo qué.',
          '- Dale a cada uno solo los permisos que necesita.',
          '- Cuando alguien deja la empresa, quitale el acceso ese mismo día (Configuración → Usuarios y roles).',
        ],
      },
      {
        titulo: 'Cuidá las credenciales de las conexiones',
        texto: [
          'El certificado de ARCA, las claves de la API y los tokens de Mercado Pago o WhatsApp dan acceso a tu operación. Cargalos solo en el sistema, no los mandes por chat o email y, si sospechás que se filtraron, revocalos y generá nuevos.',
        ],
      },
    ],
  },
  {
    id: 'diseno-factura',
    titulo: 'Logo y diseño de factura',
    resumen: 'Tu marca en las facturas impresas, en PDF y en el enlace que reciben tus clientes.',
    categoria: 'inicio',
    minutos: 5,
    quien: 'Quien tenga permiso sobre los datos de la empresa',
    pantalla: { href: '/configuracion/factura', texto: 'Ir a Logo y diseño de factura' },
    antes: ['El logo en PNG (mejor con fondo transparente), JPG o WebP, de hasta 500 KB, preferentemente horizontal.'],
    pasos: [
      { titulo: 'Subí el logo', texto: ['Elegí el archivo y tocá "Subir". Se ve la vista previa al instante.'] },
      {
        titulo: 'Elegí uno de los tres diseños',
        texto: [
          '- Clásico: cuadros con borde, en blanco y negro. El más tradicional.',
          '- Moderno: franja y tabla con el color de tu marca, logo grande.',
          '- Compacto: letra más chica y sin cuadros, ideal para facturas con muchos renglones.',
        ],
      },
      {
        titulo: 'Elegí el color y guardá',
        texto: ['El color se usa en el diseño Moderno. Los datos que exige ARCA (CAE, QR, leyendas) van igual en los tres.'],
      },
    ],
    problemas: [
      { sintoma: '"El logo pesa más de 500 KB"', solucion: 'Achicalo con cualquier editor (con 600 px de ancho alcanza).' },
      {
        sintoma: '"El logo tiene que ser PNG, JPG o WebP"',
        solucion: 'Los SVG y PDF no se aceptan: exportalo como PNG.',
      },
    ],
  },

  // -------------------------------------------------------------- Fiscal
  {
    id: 'punto-de-venta',
    titulo: 'Punto de venta para factura electrónica',
    resumen: 'Dar de alta en ARCA un punto de venta de Web Services y cargarlo en el sistema.',
    categoria: 'fiscal',
    minutos: 10,
    quien: 'El titular con clave fiscal nivel 3, y en el sistema quien configure los maestros',
    pantalla: { href: '/configuracion/puntos-venta', texto: 'Ir a Puntos de venta' },
    antes: ['Clave fiscal nivel 3.', 'Decidir un número de punto de venta que no uses en otro sistema o en la web de ARCA.'],
    pasos: [
      {
        titulo: 'Entrá a ARCA',
        texto: [
          'Con tu clave fiscal, abrí el servicio "Administración de puntos de venta y domicilios". Si no aparece, sumalo desde el Administrador de Relaciones de Clave Fiscal.',
        ],
      },
      {
        titulo: 'Agregá el punto de venta',
        texto: [
          'Elegí la empresa, "A/B/M de Puntos de venta" → "Agregar".',
          '- Número: el que elegiste (por ejemplo, 5).',
          '- Sistema: el de facturación electrónica por Web Services. Para responsables inscriptos figura como "RECE para aplicativo y web services"; para monotributistas, "Factura electrónica - Monotributo - Web Services".',
          '- Domicilio: el del local desde donde vendés.',
        ],
        ojo: 'Usá un punto de venta exclusivo para este sistema. Si emitís con el mismo número desde otro lado, la numeración se desordena y ARCA rechaza comprobantes.',
      },
      {
        titulo: 'Cargalo en el sistema',
        texto: [
          'Configuración → Puntos de venta → nuevo. Mismo número que en ARCA, un nombre para reconocerlo y tipo "Factura electrónica (WSFE)" (o "Factura de crédito electrónica MiPyME" si es para FCE).',
        ],
      },
    ],
    problemas: [
      {
        sintoma: 'ARCA rechaza la factura por el punto de venta',
        solucion:
          'Revisá que el número coincida y que en ARCA esté dado de alta como Web Services (no como "Factuweb" o comprobantes en línea).',
      },
      {
        sintoma: 'No me deja agregar más puntos de venta',
        solucion: 'Cada plan tiene un máximo. Lo ves y lo cambiás en Configuración → Suscripción.',
      },
    ],
    relacionadas: ['arca'],
  },
  {
    id: 'arca',
    titulo: 'Conectar ARCA (factura electrónica)',
    resumen: 'Generar el certificado digital, autorizar el servicio de factura electrónica y conectarlo al sistema.',
    categoria: 'fiscal',
    minutos: 30,
    quien: 'El titular con clave fiscal nivel 3, y en el sistema quien tenga permiso sobre los datos de la empresa',
    pantalla: { href: '/configuracion/arca', texto: 'Ir a ARCA y factura electrónica' },
    antes: [
      'Clave fiscal nivel 3.',
      'El punto de venta dado de alta (ver "Punto de venta para factura electrónica").',
      'No hace falta instalar nada: la clave privada la genera y la guarda cifrada el sistema.',
    ],
    pasos: [
      {
        titulo: 'Generá el pedido de certificado en el sistema',
        texto: [
          'Configuración → ARCA y factura electrónica → "Generar el pedido de certificado". El sistema crea la clave privada (queda cifrada, nunca sale del servidor) y el pedido (CSR) con tu razón social y CUIT.',
          'Copialo con "Copiar" o bajalo con "Descargar (.csr)".',
        ],
        ojo: '¿Preferís usar tu propia clave? En la misma pantalla, "Avanzado" muestra los comandos de OpenSSL; en ese caso subís el .crt junto con tu .key.',
      },
      {
        titulo: 'Para probar: certificado de homologación',
        texto: [
          'En ARCA abrí "WSASS - Autogestión Certificados Homologación" (si no está, agregalo desde el Administrador de Relaciones).',
          '- "Nuevo certificado": nombre erp, pegá el pedido y descargá el .crt.',
          '- "Crear autorización a servicio": el certificado erp con el servicio wsfe.',
        ],
      },
      {
        titulo: 'Para facturar de verdad: certificado de producción',
        texto: [
          'En ARCA abrí "Administración de Certificados Digitales" (si no está, agregalo desde el Administrador de Relaciones).',
          '- Elegí el CUIT, "Agregar alias": alias erp, subí el pedido (.csr) y descargá el certificado (.crt).',
          '- Después, en "Administrador de Relaciones de Clave Fiscal" → "Nueva relación" → buscá ARCA → Web Services → "Facturación Electrónica" (wsfe). Como representante elegí el certificado (alias erp) y confirmá.',
        ],
        ojo: 'El certificado de homologación no sirve en producción ni al revés. Podés pedir los dos con el mismo pedido: el sistema lo guarda.',
      },
      {
        titulo: 'Subilo al sistema',
        texto: [
          'Configuración → ARCA y factura electrónica: subí el .crt (sin clave), elegí el ambiente (homologación o producción) y tocá "Guardar certificado". El sistema busca la clave del pedido y controla que sea del CUIT de la empresa y la fecha de vencimiento.',
        ],
      },
      {
        titulo: 'Probá la conexión',
        texto: [
          'Tocá "Probar la conexión con ARCA". Si dice "Conectado", emití una factura de prueba en homologación. Cuando todo esté bien, cargá el certificado de producción y tocá "Pasar a producción".',
        ],
      },
      {
        titulo: 'Configurá el régimen de comprobantes A y percepciones (si corresponde)',
        texto: [
          '- Comprobantes A (RG 5762/2025): común, con leyenda "Operación sujeta a retención" o "Pago en CBU informada" (en ese caso, cargá la CBU de 22 dígitos).',
          '- Percepción de Ingresos Brutos: provincia, alícuota general y mínimo. Confirmalos con tu contador antes de activarla.',
        ],
      },
    ],
    problemas: [
      {
        sintoma: '"La clave privada no corresponde a este certificado"',
        solucion:
          'El .crt se pidió con otro pedido. Subí en ARCA el último pedido generado en el sistema y descargá el certificado de nuevo.',
      },
      {
        sintoma: '"El certificado es del CUIT X, no de esta empresa"',
        solucion:
          'Generaste el CSR con otro CUIT. Copiá el comando desde la pantalla de ARCA del sistema, que ya trae el CUIT correcto.',
      },
      {
        sintoma: '"ARCA dice que ya hay un ticket vigente…"',
        solucion:
          'El mismo certificado se usó desde otro sistema en las últimas horas. Esperá a que venza (hasta 12 horas) o usá un certificado exclusivo para este sistema.',
      },
      {
        sintoma: '"No se pudo conectar" con error de autorización',
        solucion: 'Falta la relación con el servicio wsfe para ese certificado. Revisá el paso 3 o 4 según el ambiente.',
      },
      {
        sintoma: 'El certificado vence pronto',
        solucion:
          'El sistema avisa 30 días antes. Generá un CSR nuevo (pasos 2 y 4), descargá el nuevo .crt y subilo: las relaciones con los servicios se mantienen si usás el mismo alias.',
      },
    ],
    relacionadas: ['punto-de-venta', 'padron-arca'],
  },
  {
    id: 'padron-arca',
    titulo: 'Completar clientes con el padrón de ARCA',
    resumen: 'Que el sistema traiga razón social, condición de IVA y domicilio con solo escribir el CUIT.',
    categoria: 'fiscal',
    minutos: 5,
    quien: 'El titular con clave fiscal nivel 3',
    pantalla: { href: '/terceros', texto: 'Ir a Clientes y proveedores' },
    antes: ['ARCA ya conectada en producción (ver "Conectar ARCA").'],
    pasos: [
      {
        titulo: 'Autorizá el servicio de padrón',
        texto: [
          'En ARCA → "Administrador de Relaciones de Clave Fiscal" → "Nueva relación" → ARCA → Web Services → el servicio de consulta de constancia de inscripción (ws_sr_constancia_inscripcion). Como representante, el mismo certificado (alias erp).',
        ],
      },
      {
        titulo: 'Usalo',
        texto: [
          'Al cargar un cliente o proveedor, escribí el CUIT y tocá "Completar desde ARCA". También lo usan la facturación masiva y la API para dar de alta clientes nuevos.',
        ],
      },
    ],
    problemas: [
      {
        sintoma: '"El certificado de ARCA no tiene autorizado el servicio de padrón"',
        solucion: 'Falta el paso 1, o se hizo con otro certificado.',
      },
    ],
  },
  {
    id: 'mis-comprobantes',
    titulo: 'Importar compras desde Mis Comprobantes',
    resumen: 'Traer las facturas que te emitieron tus proveedores y cruzarlas con lo cargado.',
    categoria: 'fiscal',
    minutos: 10,
    quien: 'Administración o el contador',
    pantalla: { href: '/compras/importar', texto: 'Ir a Mis Comprobantes de ARCA' },
    antes: ['Plan con Compras.', 'Clave fiscal con acceso a "Mis Comprobantes".'],
    pasos: [
      {
        titulo: 'Bajá el archivo de ARCA',
        texto: [
          'En ARCA → Mis Comprobantes → Recibidos, elegí las fechas del mes y descargalo en Excel o CSV (el ZIP tal como baja también sirve).',
        ],
      },
      {
        titulo: 'Compará',
        texto: [
          'Compras → Importar: subí el archivo y tocá "Comparar con lo cargado". Vas a ver qué comprobantes faltan cargar y cuáles no coinciden.',
        ],
      },
      { titulo: 'Registrá lo que falta', texto: ['Con un clic se cargan los que faltan, listos para revisar e imputar.'] },
    ],
    relacionadas: ['contador'],
  },
  {
    id: 'arba',
    titulo: 'ARBA: alícuotas, padrones de IIBB y COT',
    resumen: 'Conectar ARBA con la CIT, importar padrones provinciales y pedir el COT de los remitos.',
    categoria: 'fiscal',
    minutos: 20,
    quien: 'Quien tenga permiso sobre los datos de la empresa',
    pantalla: { href: '/configuracion/padrones', texto: 'Ir a Padrones de IIBB y ARBA' },
    antes: [
      'CIT (Clave de Identificación Tributaria) de ARBA de la empresa.',
      'Para el COT: número de planta y puerta registrados en ARBA, y el nomenclador COT de tus artículos.',
    ],
    pasos: [
      {
        titulo: 'Cargá el acceso a ARBA',
        texto: [
          'En "Acceso a ARBA": usuario (el CUIT, 11 dígitos), la CIT, el ambiente y, si emitís COT, planta (hasta 6 dígitos) y puerta (hasta 3). Guardá.',
          'Con eso aparece "Consultar alícuotas en ARBA", que trae la alícuota del mes de todos tus clientes y proveedores.',
        ],
        ojo: 'Probá primero en el ambiente de prueba de ARBA: sus formatos cambian y conviene confirmar que todo responde bien.',
      },
      {
        titulo: 'Importá los padrones de otras provincias',
        texto: [
          'En "Importar un padrón" elegí el formato (ARBA, AGIP u otra provincia), subí el archivo descomprimido (.txt) y tocá "Importar". Solo se guardan los CUIT de tus clientes y proveedores.',
          'ARBA publica percepción y retención en dos archivos: subilos uno después del otro.',
        ],
      },
      {
        titulo: 'Si sos agente de retención',
        texto: [
          'En "Retención de IIBB al pagar" marcá la casilla, elegí la provincia, la base mínima y el porcentaje para quien no figura en el padrón.',
        ],
      },
      {
        titulo: 'COT de los remitos',
        texto: [
          'Cargá en cada artículo el "Nomenclador COT" y la "Unidad COT". Después, en cada remito: patente, día y hora de salida, y "Pedir COT". Si ARBA no responde, podés descargar el archivo y subirlo a mano en su web.',
        ],
      },
    ],
    problemas: [
      { sintoma: '"Falta la CIT"', solucion: 'Cargala en "Acceso a ARBA". Se pide en la web de ARBA con tu clave.' },
      {
        sintoma: '"ARBA rechazó el remito"',
        solucion:
          'El mensaje indica el campo. Lo más común: nomenclador o unidad COT faltantes en un artículo, o patente mal escrita.',
      },
    ],
  },
  {
    id: 'contador',
    titulo: 'Trabajar con tu contador',
    resumen: 'Darle acceso, mandarle el paquete del mes y que cierre los períodos.',
    categoria: 'fiscal',
    minutos: 10,
    quien: 'El dueño o quien administre los usuarios',
    pantalla: { href: '/impuestos/vencimientos', texto: 'Ir a Vencimientos' },
    antes: ['El email de tu contador.'],
    pasos: [
      {
        titulo: 'Invitalo con el rol Contador',
        texto: [
          'Configuración → Usuarios y roles → Invitar, rol "Contador". Ve todo lo contable e impositivo y puede cerrar períodos para que nadie toque lo ya presentado.',
        ],
      },
      {
        titulo: 'Configurá los vencimientos y el paquete del mes',
        texto: [
          'Impuestos → Vencimientos: email del contador, email para los avisos y con cuántos días de anticipación avisar. Marcá "Mandar el paquete al contador cuando se marca presentado el Libro IVA".',
        ],
      },
      {
        titulo: 'Cada mes',
        texto: [
          'Importá Mis Comprobantes, revisá la posición de IVA y bajá o mandá el paquete desde Impuestos → IVA. El contador marca presentado y cierra el período.',
        ],
      },
    ],
    relacionadas: ['mis-comprobantes', 'usuarios'],
  },

  // ------------------------------------------------------------------ Cobros
  {
    id: 'mercado-pago',
    titulo: 'Cobrar con Mercado Pago (links de pago)',
    resumen: 'Mandar links de pago por factura o saldo y que el recibo se emita solo al acreditarse.',
    categoria: 'cobros',
    minutos: 15,
    quien: 'Quien tenga el permiso "Conectar Mercado Pago, Payway, GoCuotas y Clover"',
    pantalla: { href: '/cobros-online/configuracion', texto: 'Ir a Medios de pago online' },
    antes: ['Cuenta de Mercado Pago de la empresa (vendedor), con la identidad validada.'],
    pasos: [
      {
        titulo: 'Creá una aplicación en Mercado Pago Developers',
        texto: [
          'Entrá a mercadopago.com.ar/developers con la cuenta de la empresa → "Tus integraciones" → "Crear aplicación". Elegí pagos online (Checkout Pro).',
        ],
      },
      {
        titulo: 'Copiá el Access Token de producción',
        texto: [
          'En la aplicación → "Credenciales de producción". Si te pide activarlas, completá el rubro y el sitio web. Copiá el Access Token (empieza con APP_USR-).',
        ],
        ojo: 'El Access Token permite operar tu cuenta: pegalo solo en el sistema y no lo compartas.',
      },
      {
        titulo: 'Conectalo en el sistema',
        texto: [
          'Facturación → Links de pago → Medios de pago → Mercado Pago: pegá el Access Token, elegí con qué medio quedan los recibos y en qué cuenta entra la plata. Marcá "Disponible para pagar" y tocá "Conectar".',
        ],
      },
      {
        titulo: 'Opcional: clave secreta de las notificaciones',
        texto: [
          'En la aplicación de Mercado Pago → Webhooks, Mercado Pago genera una "clave secreta". Si la cargás, el sistema además verifica la firma de cada aviso. Sin ella también funciona: cada aviso se confirma consultando el pago a Mercado Pago.',
        ],
      },
      {
        titulo: 'Probá',
        texto: [
          'Generá un link de pago chico para una factura, pagalo y revisá que el recibo se emita solo e imputado. Podés usar "Modo de prueba" con credenciales de prueba antes de pasar a producción.',
        ],
      },
    ],
    problemas: [
      {
        sintoma: 'Pagaron y el recibo no aparece',
        solucion:
          'El sistema revisa los pagos pendientes en cada vuelta de la tarea periódica. Si en una hora no aparece, revisá que el Access Token sea de producción y de la cuenta que cobró.',
      },
    ],
    relacionadas: ['otras-pasarelas', 'suscripcion'],
  },
  {
    id: 'otras-pasarelas',
    titulo: 'Payway, GoCuotas y Clover',
    resumen: 'Conectar otras pasarelas para los links de pago.',
    categoria: 'cobros',
    minutos: 15,
    quien: 'Quien tenga el permiso de conectar medios de pago',
    pantalla: { href: '/cobros-online/configuracion', texto: 'Ir a Medios de pago online' },
    antes: ['La cuenta comercial de la pasarela habilitada para ventas online.'],
    pasos: [
      {
        titulo: 'Payway',
        texto: [
          'Pedí a Payway las credenciales de e-commerce y cargá: número de comercio (site), clave pública y clave privada. El pago se confirma cuando el cliente vuelve o en la revisión periódica.',
        ],
      },
      {
        titulo: 'GoCuotas',
        texto: ['Cargá el email del comercio en GoCuotas y la contraseña de la API que te da GoCuotas.'],
      },
      {
        titulo: 'Clover',
        texto: [
          'Cargá el Merchant ID y el token privado de ecommerce. Al conectar, el sistema muestra la "Dirección del webhook para Clover": copiala, configurala en el panel de Clover y pegá en el sistema el "signing secret" que te da Clover (es obligatorio).',
        ],
      },
      {
        titulo: 'Común a todas',
        texto: [
          'Elegí con qué medio quedan los recibos y en qué cuenta entra la plata. Usá "Modo de prueba" para probar antes de cobrar de verdad.',
        ],
      },
    ],
    relacionadas: ['mercado-pago'],
  },
  {
    id: 'facturacion-automatica',
    titulo: 'Facturas recurrentes y facturación masiva',
    resumen: 'Abonos que se facturan solos cada mes y muchas facturas de una vez desde una planilla.',
    categoria: 'cobros',
    minutos: 10,
    quien: 'Quien pueda emitir facturas',
    pantalla: { href: '/facturas/recurrentes', texto: 'Ir a Facturas recurrentes' },
    antes: ['ARCA conectada en producción.', 'Clientes con email cargado, para que les lleguen las facturas.'],
    pasos: [
      {
        titulo: 'Factura recurrente',
        texto: [
          'Facturación → Facturas recurrentes → "Nueva recurrente". Cliente, frecuencia, fecha de la próxima (día 1 a 28), renglones sin IVA y si se autoriza y se manda sola.',
          'Escribí {periodo} en la descripción y sale el mes facturado: "Abono {periodo}" → "Abono octubre 2026".',
          'Se arma el día indicado desde las 7 de la mañana. Si algo falla, queda en borrador y la recurrente muestra "Con error".',
        ],
      },
      {
        titulo: 'Facturación masiva',
        texto: [
          'Facturación → Facturación masiva → "Bajar la planilla modelo". Completala (una fila por renglón; mismo número en "factura" = misma factura), subila y revisá lo leído: las filas con problemas se marcan con su número.',
          'Elegí el punto de venta, si se autorizan y si se mandan por email, y tocá "Armar". Después "Autorizar" y mirá el avance; si cerrás la página, sigue sola.',
        ],
      },
    ],
    problemas: [
      {
        sintoma: 'Una factura quedó con error en el lote',
        solucion:
          'Abrila desde el lote, corregí lo que indica el mensaje (por ejemplo, datos del cliente) y volvé a tocar "Autorizar".',
      },
    ],
    relacionadas: ['api'],
  },
  {
    id: 'suscripcion',
    titulo: 'Tu suscripción: plan, pago y baja',
    resumen: 'Cambiar de plan, pagar con débito automático de Mercado Pago o darte de baja.',
    categoria: 'cobros',
    minutos: 5,
    quien: 'El dueño o quien administre la suscripción',
    pantalla: { href: '/configuracion/suscripcion', texto: 'Ir a Suscripción' },
    antes: [],
    pasos: [
      {
        titulo: 'Cambiar de plan o sumar aplicaciones',
        texto: [
          'En "Cambiar la suscripción" elegí el plan, las aplicaciones, los usuarios adicionales y la forma de pago (mensual o anual, que paga 10 meses). Durante la prueba seguís con el plan Inicial: el plan elegido se activa con el primer pago. Si ya pagás con débito automático y mantenés el ciclo, el cambio es inmediato y el débito pasa al importe nuevo.',
        ],
      },
      {
        titulo: 'Pagar con débito automático',
        texto: [
          'Tocá "Pagar con Mercado Pago" y autorizá el débito con tarjeta o dinero en cuenta. Se renueva solo y te llega la factura de cada pago por email.',
        ],
      },
      {
        titulo: 'Darte de baja',
        texto: [
          'Abajo de todo, "Dar de baja la suscripción". Se cancela el débito en el acto, el sistema sigue funcionando hasta el fin del período pagado y después queda en consulta: ves y exportás todo durante 12 meses. Hasta esa fecha podés deshacerla.',
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ Canales
  {
    id: 'whatsapp',
    titulo: 'Conectar WhatsApp Business',
    resumen: 'Atender a tus clientes por WhatsApp desde el sistema, mandar comprobantes y activar el agente.',
    categoria: 'canales',
    minutos: 45,
    quien: 'Quien tenga el permiso de configurar WhatsApp',
    pantalla: { href: '/whatsapp/configuracion', texto: 'Ir a la configuración de WhatsApp' },
    antes: [
      'Una cuenta de Meta Business (business.facebook.com) de la empresa.',
      'Un número de teléfono que no esté usándose en la aplicación de WhatsApp (o darlo de baja ahí antes).',
      'Un medio de pago cargado en Meta, para las conversaciones que inicia la empresa.',
    ],
    pasos: [
      {
        titulo: 'Creá la aplicación en Meta for Developers',
        texto: ['En developers.facebook.com → "Mis apps" → "Crear app", de tipo Negocios, y agregale el producto WhatsApp.'],
      },
      {
        titulo: 'Agregá tu número y copiá el "Phone number ID"',
        texto: ['WhatsApp → Configuración de la API: agregá y verificá el número. Copiá el "Phone number ID" (solo números).'],
      },
      {
        titulo: 'Creá un token permanente',
        texto: [
          'En Business Manager → Usuarios del sistema: creá uno, asignale la app y generá un token con los permisos whatsapp_business_messaging y whatsapp_business_management.',
        ],
        ojo: 'Los tokens temporales de la pantalla de prueba vencen en 24 horas: usá siempre el del usuario del sistema.',
      },
      { titulo: 'Copiá el "App secret"', texto: ['Configuración de la app → Básica → "Clave secreta de la app".'] },
      {
        titulo: 'Conectá en el sistema',
        texto: [
          'Pegá Phone number ID, App secret y token, y tocá "Conectar". El sistema prueba los datos con Meta y te muestra la "Dirección del webhook" y el "Token de verificación".',
        ],
      },
      {
        titulo: 'Configurá el webhook en Meta',
        texto: [
          'En la app de Meta → WhatsApp → Configuración → Webhook: pegá la dirección y el token de verificación del sistema, verificá y suscribite al campo "messages".',
        ],
      },
      {
        titulo: 'Opcional: plantilla, agente y facturas por WhatsApp',
        texto: [
          '- Plantilla: para escribirle a alguien que no te habló en las últimas 24 horas, creá en Meta una plantilla aprobada con un solo parámetro {{1}} y poné su nombre e idioma (es_AR).',
          '- Agente de atención: contesta saldo, facturas, links de pago, pedidos y estado de servicios, y deriva a una persona lo demás. Podés darle indicaciones (horarios, qué no prometer).',
          '- Registro de facturas por WhatsApp: autorizá qué celulares de tu equipo pueden mandar facturas de proveedores; quedan como borrador para revisar.',
        ],
      },
    ],
    problemas: [
      {
        sintoma: '"Meta no aceptó el número o el token"',
        solucion:
          'Revisá que el token sea del usuario del sistema, con los dos permisos, y que la app esté asignada a ese usuario.',
      },
      {
        sintoma: 'Los mensajes de los clientes no llegan',
        solucion: 'Falta suscribir el webhook al campo "messages", o la dirección/token de verificación no coinciden.',
      },
      {
        sintoma: '"Pasaron más de 24 horas desde el último mensaje"',
        solucion: 'WhatsApp solo permite escribir libremente dentro de las 24 horas. Configurá una plantilla aprobada.',
      },
    ],
  },
  {
    id: 'tiendas',
    titulo: 'Conectar tiendas online',
    resumen: 'Mercado Libre, Tienda Nube, WooCommerce, Shopify, Magento y PrestaShop: pedidos, stock y precios.',
    categoria: 'canales',
    minutos: 15,
    quien: 'Quien tenga el permiso de configurar tiendas',
    pantalla: { href: '/tiendas', texto: 'Ir a Tiendas online' },
    antes: [
      'La aplicación Tiendas online contratada (Configuración → Suscripción).',
      'Usuario administrador de la tienda.',
      'Los artículos del sistema con el mismo código (SKU) que en la tienda.',
    ],
    pasos: [
      {
        titulo: 'Mercado Libre, Tienda Nube y Shopify',
        texto: [
          'Tocá "Conectar…", iniciá sesión en la plataforma y autorizá. En Shopify escribí antes la dirección mitienda.myshopify.com. No hay claves para copiar.',
        ],
      },
      {
        titulo: 'WooCommerce',
        texto: [
          'Escribí la dirección de la tienda (https://…) y tocá "Conectar WooCommerce": WordPress te pide aprobar el acceso. Requisitos: https, enlaces permanentes activados y WooCommerce 5.8 o superior.',
        ],
      },
      {
        titulo: 'Magento',
        texto: [
          'En Magento → Sistema → Integraciones, creá una con acceso a Catálogo, Inventario y Ventas, activala y copiá el Access Token. En 2.4.4 o superior, habilitá "Allow OAuth Access Tokens to be used as standalone Bearer tokens" (Tiendas → Configuración → Servicios → OAuth). Pegá dirección y token en el sistema.',
        ],
      },
      {
        titulo: 'PrestaShop',
        texto: [
          'En Parámetros avanzados → Webservice, activalo y creá una clave con permisos sobre products, combinations, stock_availables, orders, order_states, customers, addresses y currencies. Pegá dirección y clave en el sistema.',
          'En Magento y PrestaShop los pedidos se traen cada 15 minutos.',
        ],
      },
      {
        titulo: 'Configurá cada tienda',
        texto: [
          'En la tienda conectada elegí qué hacer: traer los pedidos pagados, facturarlos solos (con la cuenta donde entra el cobro y el punto de venta), mandar el stock (de qué depósito) y los precios (de qué lista).',
        ],
      },
    ],
    problemas: [
      { sintoma: 'Chip "Hay que reconectar"', solucion: 'La plataforma revocó el acceso: tocá conectar de nuevo.' },
      {
        sintoma: '"Disponible cuando el administrador habilite la aplicación"',
        solucion: 'Esa plataforma todavía no está habilitada en el servidor: escribinos.',
      },
      {
        sintoma: 'Un pedido entra sin artículo',
        solucion: 'El SKU de la tienda no coincide con el código del artículo en el sistema.',
      },
    ],
  },

  // ------------------------------------------------------------------ Equipo
  {
    id: 'usuarios',
    titulo: 'Usuarios, roles y permisos',
    resumen: 'Invitar a tu equipo, darle a cada uno lo justo y quitar accesos.',
    categoria: 'equipo',
    minutos: 10,
    quien: 'Quien tenga el permiso de administrar usuarios',
    pantalla: { href: '/configuracion/usuarios', texto: 'Ir a Usuarios y roles' },
    antes: ['El email de cada persona.'],
    pasos: [
      {
        titulo: 'Invitá',
        texto: [
          'Escribí el email, elegí el rol y tocá "Invitar". El sistema te da un enlace de un solo uso: mandáselo por el medio que prefieras. La persona elige su propia clave.',
        ],
      },
      {
        titulo: 'Elegí el rol',
        texto: [
          '- Dueño: todo.',
          '- Administración: facturación, cobranzas, compras, tesorería.',
          '- Ventas: presupuestos, pedidos, facturas y clientes.',
          '- Depósito: stock y remitos.',
          '- Contador: lo contable e impositivo, y el cierre de períodos.',
          '- Técnico: sus órdenes de servicio.',
          '- Solo lectura: consulta.',
          'El detalle exacto de cada rol se ve en su editor. En el plan Empresa podés crear roles propios con los permisos que quieras.',
        ],
      },
      {
        titulo: 'Limitá qué clientes ve cada uno (opcional)',
        texto: ['Con "Grupos de clientes", un vendedor ve solo su cartera.'],
      },
      {
        titulo: 'Quitá accesos a tiempo',
        texto: ['"Quitar acceso" deja a la persona afuera en el acto, sin borrar lo que hizo. Se puede devolver cuando quieras.'],
      },
    ],
    problemas: [
      { sintoma: '"La invitación venció o ya se usó"', solucion: 'Cancelala y generá una nueva.' },
      {
        sintoma: 'No me deja invitar más usuarios',
        solucion: 'Llegaste al máximo del plan. Sumá usuarios adicionales en Configuración → Suscripción.',
      },
    ],
    relacionadas: ['seguridad', 'contador'],
  },
  {
    id: 'portal-clientes',
    titulo: 'Portal de clientes',
    resumen: 'Que tus clientes vean sus servicios, pidan asistencia, carguen contadores y consulten su cuenta.',
    categoria: 'equipo',
    minutos: 10,
    quien: 'Quien configure el servicio técnico',
    pantalla: { href: '/servicio/configuracion', texto: 'Ir a la configuración del servicio técnico' },
    antes: ['La aplicación Servicio técnico contratada.'],
    pasos: [
      {
        titulo: 'Habilitá el portal',
        texto: [
          'En "Portal de clientes" marcá "Habilitar el portal" y qué pueden hacer: pedir servicio, cargar contadores, ver su cuenta. Elegí el color de tu marca.',
        ],
      },
      {
        titulo: 'Invitá a cada cliente',
        texto: [
          'En "Usuarios del portal" buscá el cliente, escribí el email y el nombre de la persona. Le llega una invitación para elegir su clave; también podés mandarle el enlace vos.',
        ],
      },
      {
        titulo: 'Compartí la dirección',
        texto: ['La pantalla muestra la dirección del portal de tu empresa: ponela en tu web o en tus correos.'],
      },
    ],
  },
  {
    id: 'formulario-web',
    titulo: 'Formulario de contacto para tu sitio web',
    resumen: 'Que las consultas de tu web entren solas al embudo de ventas.',
    categoria: 'equipo',
    minutos: 10,
    quien: 'Quien configure el CRM',
    pantalla: { href: '/crm/configuracion', texto: 'Ir a la configuración del CRM' },
    antes: ['Acceso para editar tu sitio web (o a quien lo administre).'],
    pasos: [
      {
        titulo: 'Creá el formulario',
        texto: ['En "Formulario para tu sitio web" tocá "Crear el formulario".'],
      },
      {
        titulo: 'Pegalo en tu web',
        texto: [
          'Tocá "Ver el código para pegar en tu sitio", copialo y pegalo en la página de contacto. Campos: nombre (obligatorio), empresa, email, teléfono, interés y mensaje.',
        ],
      },
      {
        titulo: 'Elegí cómo se reparten',
        texto: ['Sin asignar o en forma rotativa entre los vendedores que elijas, con resumen diario por email.'],
      },
    ],
    problemas: [
      {
        sintoma: 'Recibo consultas falsas',
        solucion:
          'El formulario ya trae un campo trampa y un tope por hora. Si siguen, usá "Cambiar la dirección" y pegá el código nuevo.',
      },
    ],
  },

  // ------------------------------------------------------------ Integraciones
  {
    id: 'api',
    titulo: 'API y webhooks',
    resumen: 'Conectar tus otros sistemas: facturar por API, consultar datos y recibir avisos.',
    categoria: 'integraciones',
    minutos: 20,
    quien: 'Quien tenga el permiso de integraciones (plan Empresa)',
    pantalla: { href: '/configuracion/integraciones', texto: 'Ir a API e integraciones' },
    antes: ['Plan Empresa.', 'Alguien que programe la integración del otro lado.'],
    pasos: [
      {
        titulo: 'Creá una clave',
        texto: [
          'En "Claves de la API": un nombre que diga para qué es y el acceso (solo lectura o lectura y escritura). La clave se muestra una sola vez: copiala y guardala en el otro sistema.',
        ],
        ojo: 'Una clave por sistema conectado. Si una se filtra, revocala sin afectar a las demás.',
      },
      {
        titulo: 'Usala',
        texto: ['Cada pedido lleva el encabezado:'],
        codigo: 'Authorization: Bearer erp_…',
      },
      {
        titulo: 'Facturar por API',
        texto: [
          'POST /api/v1/facturas con el cliente (CUIT o DNI; si no existe se da de alta) y los renglones (precio sin IVA e IVA en porcentaje). Responde con el CAE, el número y el enlace para el cliente.',
          'Mandá siempre "referencia" (tu número de venta): si repetís el pedido, devuelve la misma factura y no factura dos veces.',
          'Para muchas facturas, POST /api/v1/lotes (hasta 500) y seguí el avance con GET /api/v1/lotes/<id>.',
        ],
        codigo:
          '{\n  "referencia": "VENTA-1001",\n  "cliente": { "documento": "30999176522", "email": "pagos@cliente.com" },\n  "concepto": 2,\n  "renglones": [{ "descripcion": "Abono octubre", "cantidad": 1, "precioUnitario": 25000, "iva": 21 }]\n}',
      },
      {
        titulo: 'Webhooks',
        texto: [
          'Agregá la dirección https de tu sistema y elegí los eventos. Cada aviso va firmado en el encabezado X-ERP-Firma con el secreto que se muestra al crearlo; verificá la firma antes de procesarlo. Si tu sistema no responde, se reintenta hasta 8 veces.',
          'Para facturación y cobranzas:',
          '- comprobante.autorizado: ARCA autorizó una factura o nota. Trae número, CAE, total, cliente y la "referencia" que mandaste al crearla por la API.',
          '- cobranza.registrada: se emitió un recibo (también los de cobros online), con sus medios de pago y a qué facturas se aplicó.',
          '- comprobante.saldado: una factura quedó sin deuda. Es el aviso para marcar un pedido como pagado en tu sistema.',
          '- cobranza.anulada: se anuló un recibo y la deuda que cancelaba vuelve.',
          'Los avisos salen solo si la operación se guardó: si algo falla y se revierte, no llega nada.',
        ],
      },
    ],
    problemas: [
      { sintoma: '401', solucion: 'Falta el encabezado Authorization o la clave fue revocada.' },
      { sintoma: '403 "solo lectura"', solucion: 'Para crear facturas la clave tiene que ser de lectura y escritura.' },
      {
        sintoma: '422 con "Quedó en borrador"',
        solucion: 'ARCA rechazó la factura: el mensaje dice por qué. La factura queda en el sistema para corregirla.',
      },
    ],
    relacionadas: ['facturacion-automatica'],
  },
]

export const guiaPorId = (id: string) => GUIAS.find((g) => g.id === id) ?? null

/** Búsqueda simple sin tildes en título, resumen y pasos. */
export function buscarGuias(q: string) {
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const t = n(q.trim())
  if (!t) return GUIAS
  return GUIAS.filter((g) => n([g.titulo, g.resumen, ...g.pasos.flatMap((p) => [p.titulo, ...p.texto])].join(' ')).includes(t))
}
