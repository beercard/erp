import { exigirFuncion } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'

import { NavCrm } from './NavCrm'

/** El CRM viene con la función "Ventas y CRM" del plan. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const sesion = await exigirFuncion('comercial')
  return (
    <>
      <NavCrm configurar={tienePermiso(sesion.permisos, 'crm.configurar')} />
      {children}
    </>
  )
}
