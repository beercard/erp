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

/** Catálogo de permisos que existen, para la pantalla de roles. */
export const PERMISOS = {
  'maestros.ver': 'Ver clientes, proveedores y artículos',
  'maestros.terceros': 'Crear y modificar clientes y proveedores',
  'maestros.articulos': 'Crear y modificar artículos y precios',
  'maestros.configuracion': 'Configurar depósitos, puntos de venta, listas y condiciones',
  'empresa.usuarios': 'Administrar los usuarios y roles de la empresa',
  'empresa.datos': 'Modificar los datos fiscales de la empresa',
} as const
