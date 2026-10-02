'use client'

import { useEffect, useState } from 'react'

import { cuentasParaValores } from '@/app/(app)/tesoreria/acciones'

type Cuenta = Awaited<ReturnType<typeof cuentasParaValores>>[number]

/** Tipos de cuenta que tienen sentido para cada medio. */
const TIPOS_POR_MEDIO: Record<string, string[]> = {
  efectivo: ['caja'],
  transferencia: ['banco', 'billetera'],
  mercado_pago: ['billetera', 'banco'],
  tarjeta_credito: ['cupones', 'billetera'],
  tarjeta_debito: ['cupones', 'billetera', 'banco'],
  cheque_propio: ['banco'],
  echeq_propio: ['banco'],
  tarjeta: ['tarjeta'],
  otro: ['caja', 'banco', 'billetera', 'cupones', 'tarjeta', 'inversion'],
}

/** Las cuentas activas, una sola vez por pantalla. */
export function useCuentas() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  useEffect(() => {
    let vigente = true
    cuentasParaValores()
      .then((c) => vigente && setCuentas(c))
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [])
  return cuentas
}

/** Por qué cuenta entra o sale un valor. Vacío: la predeterminada del medio. */
export function SelectorCuenta({
  cuentas,
  medio,
  moneda,
  valor,
  onChange,
  etiqueta,
}: {
  cuentas: Cuenta[]
  medio: string
  moneda: string
  valor: string
  onChange: (cuentaId: string) => void
  etiqueta: string
}) {
  const tipos = TIPOS_POR_MEDIO[medio]
  if (!tipos || !cuentas.length) return null
  const posibles = cuentas.filter((c) => c.moneda === moneda && tipos.includes(c.tipo))
  const predeterminada = cuentas.find((c) => c.mediosPredeterminados.includes(medio))
  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      aria-label={etiqueta}
      className="h-9 min-w-40 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento"
    >
      <option value="">{predeterminada ? predeterminada.nombre : 'Sin cuenta'}</option>
      {posibles
        .filter((c) => c.id !== predeterminada?.id)
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
    </select>
  )
}
