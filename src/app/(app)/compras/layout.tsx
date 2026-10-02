import { exigirFuncion } from '@/lib/auth/servidor'

/** La sección solo existe si el plan incluye la función. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirFuncion('compras')
  return children
}
