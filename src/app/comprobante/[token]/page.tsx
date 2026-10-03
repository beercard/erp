import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { leerEnlace } from '@/lib/enlaces'

import { HojaFactura } from '../../imprimir/[tipo]/[id]/HojaFactura'

export const metadata: Metadata = { title: 'Comprobante', robots: { index: false, follow: false } }

/** La factura que se manda por WhatsApp o email: enlace firmado, sin usuario. */
export default async function ComprobantePublico({ params }: PageProps<'/comprobante/[token]'>) {
  const { token } = await params
  const e = leerEnlace(decodeURIComponent(token), 'factura')
  if (!e) notFound()
  return <HojaFactura id={e.id} empresaId={e.empresaId} />
}
