import { exigirFuncion } from '@/lib/auth/servidor'

/** La sección solo existe si el plan incluye la aplicación Tiendas online. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirFuncion('tienda')
  return children
}
