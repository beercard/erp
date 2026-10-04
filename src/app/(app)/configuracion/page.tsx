import {
  Building2,
  BookLock,
  ChevronRight,
  CreditCard,
  FileStack,
  Landmark,
  Newspaper,
  Percent,
  Palette,
  Plug,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { EnlaceAyuda } from '@/components/ayuda/EnlaceAyuda'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EncabezadoPagina, Panel } from '@/components/ui'
import { requerirEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { CATALOGOS } from '@/modulos/configuracion/catalogos'

export const metadata: Metadata = { title: 'Configuración' }

export default async function Configuracion() {
  const sesion = await requerirEmpresa()
  const puede = (p: string) => tienePermiso(sesion.permisos, p)
  const empresa = [
    {
      href: '/configuracion/suscripcion',
      titulo: 'Suscripción',
      texto: `Plan ${sesion.suscripcion.nombrePlan}: uso, aplicaciones y cambio de plan.`,
      icono: CreditCard,
      permiso: 'empresa.suscripcion',
    },
    {
      href: '/configuracion/empresa',
      titulo: 'Datos de la empresa',
      texto: 'Razón social, domicilio fiscal, Ingresos Brutos e inicio de actividades.',
      icono: Building2,
      permiso: 'empresa.datos',
    },
    {
      href: '/configuracion/factura',
      titulo: 'Logo y diseño de factura',
      texto: 'Tu logo y uno de tres diseños para las facturas, impresas, en PDF y en el enlace al cliente.',
      icono: Palette,
      permiso: 'empresa.datos',
    },
    {
      href: '/configuracion/usuarios',
      titulo: 'Usuarios y roles',
      texto: 'Quién entra al sistema y qué puede hacer cada uno.',
      icono: ShieldCheck,
      permiso: 'empresa.usuarios',
    },
    {
      href: '/configuracion/arca',
      titulo: 'ARCA y factura electrónica',
      texto: 'Certificado, ambiente de prueba o producción y percepción de IIBB.',
      icono: Landmark,
      permiso: 'empresa.datos',
    },
    {
      href: '/configuracion/retenciones',
      titulo: 'Retenciones a proveedores',
      texto: 'Retención de Ganancias (RG 830): regímenes, mínimos y escala.',
      icono: Percent,
      permiso: 'empresa.datos',
    },
    {
      href: '/configuracion/padrones',
      titulo: 'Padrones de IIBB y ARBA',
      texto: 'Alícuotas de percepción y retención por CUIT, retención de IIBB al pagar y acceso a ARBA (COT).',
      icono: FileStack,
      permiso: 'empresa.datos',
    },
    {
      href: '/configuracion/cierres',
      titulo: 'Cierre de períodos',
      texto: 'Bloquear por fecha ventas, compras y tesorería para que nadie toque lo ya cerrado.',
      icono: BookLock,
      permiso: 'empresa.bloqueos',
    },
    {
      href: '/configuracion/resumen',
      titulo: 'Resumen para el dueño',
      texto: 'Ventas, cobranzas, deuda, caja y alertas, por correo o WhatsApp cada día o cada semana.',
      icono: Newspaper,
      permiso: 'empresa.datos',
    },
    {
      href: '/configuracion/importar',
      titulo: 'Importar desde planillas',
      texto: 'Clientes, proveedores, artículos con precio y stock, y saldos iniciales desde Excel o CSV.',
      icono: Upload,
      permiso: ['maestros.terceros', 'maestros.articulos', 'empresa.datos'].find(puede) ?? 'empresa.datos',
    },
    {
      href: '/configuracion/integraciones',
      titulo: 'API e integraciones',
      texto: 'Claves de la API y webhooks para conectar otros sistemas.',
      icono: Plug,
      permiso: 'empresa.integraciones',
    },
  ].filter((e) => puede(e.permiso))

  return (
    <>
      <EncabezadoPagina
        acciones={<EnlaceAyuda guia="primeros-pasos" />}
        titulo="Configuración"
        bajada="Los datos que usan todas las pantallas: depósitos, puntos de venta, listas, condiciones y más."
      />
      {empresa.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {empresa.map((e) => (
            <Link key={e.href} href={e.href} className="group flex items-start gap-3 tarjeta p-4 hover:border-acento">
              <e.icono aria-hidden className="mt-0.5 size-5 text-acento" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{e.titulo}</span>
                <span className="block text-xs text-texto-2">{e.texto}</span>
              </span>
              <ChevronRight aria-hidden className="size-4 text-texto-3 group-hover:text-acento" />
            </Link>
          ))}
        </div>
      )}
      <Panel className="divide-y divide-borde overflow-hidden">
        {CATALOGOS.map((c) => (
          <Link
            key={c.clave}
            href={`/configuracion/${c.clave}`}
            className="group flex items-center gap-3 px-4 py-3 hover:bg-superficie-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{c.titulo}</span>
              <span className="block text-xs text-texto-2">{c.descripcion}</span>
            </span>
            <ChevronRight aria-hidden className="size-4 text-texto-3 group-hover:text-acento" />
          </Link>
        ))}
      </Panel>
    </>
  )
}
