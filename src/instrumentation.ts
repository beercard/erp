/**
 * Al arrancar el servidor (ver src/instrumentation-node.ts). Lo de Node va
 * aparte para que no se empaquete para el runtime Edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { arrancar } = await import('./instrumentation-node')
  await arrancar()
}

/**
 * Errores del servidor (páginas, rutas y acciones): quedan agrupados en la
 * base y se avisa por correo a la plataforma (ver src/modulos/plataforma/monitoreo.ts).
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { registrarError } = await import('./modulos/plataforma/monitoreo')
  await registrarError({
    mensaje: error instanceof Error ? error.message : String(error),
    ruta: context.routePath || request.path.split('?')[0],
    tipo: `${context.routeType} ${request.method}`,
    digest: typeof error === 'object' && error !== null && 'digest' in error ? String(error.digest) : null,
  })
}
