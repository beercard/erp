'use client'

import { useEffect } from 'react'

/**
 * Al llegar al ingreso (también después de cerrar sesión) se borra lo que la
 * app del técnico guardó para trabajar sin señal: órdenes, domicilios y
 * fotos no tienen que quedar en un celular compartido.
 */
export function LimpiarCache() {
  useEffect(() => {
    if (!('caches' in window)) return
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith('tecnico-')).map((k) => caches.delete(k))))
      .catch(() => undefined)
  }, [])
  return null
}
