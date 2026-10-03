import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { MarcoAcceso } from '@/components/MarcoAcceso'
import { sesionActual } from '@/lib/auth/servidor'
import { DIAS_DE_PRUEBA } from '@/lib/planes'

import { FormularioRegistro } from './FormularioRegistro'

export const metadata: Metadata = {
  title: `Probar gratis ${DIAS_DE_PRUEBA} días`,
  description: `Creá tu cuenta de Vektra ERP y probala ${DIAS_DE_PRUEBA} días con lo que necesita tu rubro, sin tarjeta.`,
  alternates: { canonical: '/registro' },
  robots: { index: true, follow: true },
}

export default async function PaginaRegistro() {
  if (await sesionActual()) redirect('/empresas')
  return (
    <MarcoAcceso ancho="md">
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Probá gratis {DIAS_DE_PRUEBA} días</h1>
      <p className="mt-1 mb-6 text-sm text-texto-2">
        Facturación electrónica, stock, compras, cuentas corrientes y bancos. Al terminar elegís un plan, o seguís gratis
        facturando hasta 20 comprobantes por mes.
      </p>
      <FormularioRegistro />
      <p className="mt-4 text-center text-xs text-texto-3">
        Vektra nunca te va a pedir la contraseña por correo, WhatsApp ni teléfono. Ingresá siempre escribiendo la dirección en el
        navegador.
      </p>
      <p className="mt-6 text-center text-sm text-texto-2">
        ¿Ya tenés cuenta?{' '}
        <Link href="/ingresar" className="text-acento hover:underline">
          Ingresá
        </Link>
      </p>
    </MarcoAcceso>
  )
}
