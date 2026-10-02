/**
 * Al arrancar el servidor (ver src/instrumentation-node.ts). Lo de Node va
 * aparte para que no se empaquete para el runtime Edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { arrancar } = await import('./instrumentation-node')
  await arrancar()
}
