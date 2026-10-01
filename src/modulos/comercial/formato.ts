/** Formato de número de comprobante: 0004-00012345. */
export function formatearNumero(puntoVenta: number, numero: number): string {
  return `${String(puntoVenta).padStart(4, '0')}-${String(numero).padStart(8, '0')}`
}
