/**
 * Permisos con forma "modulo.accion". Un rol puede tener comodines:
 *   "*"          todo
 *   "ventas.*"   todas las acciones de ventas
 *   "*.ver"      ver en todos los módulos
 */
export function tienePermiso(permisos: readonly string[], requerido: string): boolean {
  const [modulo, accion] = requerido.split('.')
  return permisos.some((p) => {
    if (p === '*' || p === requerido) return true
    const [m, a] = p.split('.')
    return (m === '*' && a === accion) || (m === modulo && a === '*')
  })
}

/**
 * Catálogo de permisos por módulo, para el editor de roles. Incluye los de
 * etapas futuras: un rol armado hoy ya queda listo para cuando lleguen.
 */
export const MODULOS_PERMISOS: { modulo: string; titulo: string; permisos: Record<string, string> }[] = [
  {
    modulo: 'maestros',
    titulo: 'Maestros',
    permisos: {
      'maestros.ver': 'Ver clientes, proveedores, artículos y precios',
      'maestros.terceros': 'Crear y modificar clientes y proveedores',
      'maestros.articulos': 'Crear y modificar artículos y precios',
      'maestros.configuracion': 'Configurar depósitos, puntos de venta, listas y condiciones',
    },
  },
  {
    modulo: 'ventas',
    titulo: 'Ventas',
    permisos: {
      'ventas.ver': 'Ver presupuestos, pedidos, remitos y comprobantes',
      'ventas.presupuestos': 'Hacer presupuestos',
      'ventas.pedidos': 'Cargar pedidos',
      'ventas.remitos': 'Emitir remitos',
      'ventas.facturar': 'Emitir facturas y notas de crédito y débito',
      'ventas.anular': 'Anular comprobantes',
      'ventas.cobrar': 'Cargar cobranzas',
    },
  },
  {
    modulo: 'stock',
    titulo: 'Stock',
    permisos: {
      'stock.ver': 'Ver stock y movimientos',
      'stock.ajustar': 'Ajustes y transferencias entre depósitos',
    },
  },
  {
    modulo: 'compras',
    titulo: 'Compras',
    permisos: {
      'compras.ver': 'Ver compras y cuentas de proveedores',
      'compras.cargar': 'Cargar comprobantes de compra',
      'compras.pagar': 'Hacer órdenes de pago',
    },
  },
  {
    modulo: 'tesoreria',
    titulo: 'Tesorería',
    permisos: {
      'tesoreria.ver': 'Ver caja, bancos y valores',
      'tesoreria.mover': 'Movimientos de caja y bancos',
      'tesoreria.conciliar': 'Conciliar bancos',
    },
  },
  {
    modulo: 'contratos',
    titulo: 'Contratos y equipos',
    permisos: {
      'contratos.ver': 'Ver contratos, equipos y lecturas',
      'contratos.editar': 'Crear y modificar contratos y equipos',
      'contratos.lecturas': 'Cargar lecturas de contadores',
      'contratos.facturar': 'Facturar los contratos del mes',
    },
  },
  {
    modulo: 'servicio',
    titulo: 'Servicio técnico',
    permisos: {
      'servicio.ver': 'Ver las órdenes de servicio',
      'servicio.cargar': 'Abrir, programar, revisar, cerrar y cancelar órdenes (coordinación)',
      'servicio.trabajar': 'Completar las órdenes asignadas desde el celular (técnico)',
      'servicio.facturar': 'Facturar las órdenes con cargo al cliente',
      'servicio.configurar': 'Tipos de orden y sus formularios',
    },
  },
  {
    modulo: 'informes',
    titulo: 'Informes e impuestos',
    permisos: {
      'informes.ver': 'Ver informes de gestión',
      'impuestos.libros': 'Generar libros de IVA y presentaciones',
    },
  },
  {
    modulo: 'contabilidad',
    titulo: 'Contabilidad',
    permisos: {
      'contabilidad.ver': 'Ver el plan de cuentas, los asientos y los libros contables',
      'contabilidad.asientos': 'Contabilizar, cargar asientos manuales y reclasificar',
      'contabilidad.configurar': 'Poner en marcha la contabilidad, editar el plan de cuentas y cerrar ejercicios',
    },
  },
  {
    modulo: 'empresa',
    titulo: 'Empresa',
    permisos: {
      'empresa.datos': 'Modificar los datos fiscales de la empresa',
      'empresa.usuarios': 'Administrar usuarios, invitaciones y roles',
      'empresa.suscripcion': 'Ver y cambiar el plan de la suscripción',
      'empresa.integraciones': 'Claves de la API y webhooks',
    },
  },
]

export const PERMISOS: Record<string, string> = Object.assign({}, ...MODULOS_PERMISOS.map((m) => m.permisos))
