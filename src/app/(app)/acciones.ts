'use server'

import { enLaEmpresa } from '@/lib/auth/servidor'
import { buscarTodo, type Resultado } from '@/modulos/busqueda'

/** Búsqueda universal de la paleta (Ctrl + K). */
export async function buscar(texto: string): Promise<Resultado[]> {
  if (typeof texto !== 'string' || texto.length > 100) return []
  return enLaEmpresa('maestros.ver', (tx) => buscarTodo(tx, texto))
}
