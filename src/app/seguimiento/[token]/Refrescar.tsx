'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Vuelve a pedir la página cada tanto (el cliente la deja abierta esperando al técnico). */
export function Refrescar({ segundos }: { segundos: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => router.refresh(), segundos * 1000)
    return () => clearInterval(t)
  }, [router, segundos])
  return null
}
