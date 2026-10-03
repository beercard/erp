import { redirect } from 'next/navigation'

import { exigirAdmin } from '../admin'

/** Dirección anterior de la ficha de una empresa: lleva a la nueva. */
export default async function EmpresaAnterior({ params }: PageProps<'/plataforma/[id]'>) {
  await exigirAdmin()
  const { id } = await params
  redirect(`/plataforma/empresas/${encodeURIComponent(id)}`)
}
