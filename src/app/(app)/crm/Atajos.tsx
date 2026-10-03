'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Atajos del CRM: "/" busca y "n" crea una oportunidad (fuera de los campos de texto). */
export function Atajos({ nueva }: { nueva?: string }) {
  const router = useRouter()
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable], [role=dialog]')) return
      if (e.key === '/') {
        const q = document.querySelector<HTMLInputElement>('main input[name=q]')
        if (q) {
          e.preventDefault()
          q.focus()
          q.select()
        }
      }
      if (e.key === 'n' && nueva) {
        e.preventDefault()
        router.push(nueva)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [nueva, router])
  return null
}
