import type { Metadata } from 'next'

import { ListaDocumentos } from '@/components/comercial/ListaDocumentos'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { listarPresupuestos } from '@/modulos/comercial/documentos'

export const metadata: Metadata = { title: 'Presupuestos' }

const ESTADOS = [
  { valor: 'borrador', texto: 'Borradores' },
  { valor: 'enviado', texto: 'Enviados' },
  { valor: 'aceptado', texto: 'Aceptados' },
  { valor: 'rechazado', texto: 'Rechazados' },
]

export default async function Presupuestos({ searchParams }: PageProps<'/presupuestos'>) {
  const { q, estado } = await searchParams
  const sesion = await requerirEmpresa()
  const texto = typeof q === 'string' ? q : ''
  const filtroEstado = ESTADOS.some((e) => e.valor === estado) ? (estado as string) : undefined
  const filas = await enLaEmpresa('ventas.ver', (tx) => listarPresupuestos(tx, { q: texto, estado: filtroEstado }))
  return (
    <ListaDocumentos
      titulo="Presupuestos"
      ruta="/presupuestos"
      filas={filas}
      estados={ESTADOS}
      estado={filtroEstado}
      q={texto}
      puedeCrear={tienePermiso(sesion.permisos, 'ventas.presupuestos')}
      textoNuevo="Nuevo presupuesto"
    />
  )
}
