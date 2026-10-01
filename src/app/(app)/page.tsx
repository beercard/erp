import { and, count, eq, gte, inArray, sql } from 'drizzle-orm'
import { Boxes, ClipboardList, FilePlus, Package, UserPlus, Users } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonEnlace, Chip, EncabezadoPagina, Panel, Tecla } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { articulos, auditoria, pedidos, presupuestos, terceros } from '@/db/schema'
import { requerirEmpresa } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { cotizacionVigente } from '@/modulos/comercial/cotizacion'

import { WidgetCotizacion } from './WidgetCotizacion'

export const metadata: Metadata = { title: 'Inicio' }

const ETAPAS = [
  { n: 0, nombre: 'Cimientos', detalle: 'Empresas, usuarios, permisos, auditoría y maestros', estado: 'listo' },
  { n: 1, nombre: 'Comercial', detalle: 'Presupuestos, pedidos, remitos y stock', estado: 'listo' },
  { n: 2, nombre: 'Facturación', detalle: 'Factura electrónica ARCA, cuentas corrientes y cobranzas', estado: 'en curso' },
  { n: 3, nombre: 'Compras y pagos', detalle: 'Mis Comprobantes, órdenes de pago y retenciones', estado: 'próxima' },
  { n: 4, nombre: 'Tesorería', detalle: 'Caja, bancos, conciliación, cheques y ECHEQ', estado: 'pendiente' },
  { n: 5, nombre: 'Contratos', detalle: 'Equipos, contadores y facturación por copias', estado: 'pendiente' },
] as const

export default async function Inicio() {
  const sesion = await requerirEmpresa()
  const datos = await conEmpresa(sesion.empresa.id, async (tx) => {
    const [clientes] = await tx
      .select({ n: count() })
      .from(terceros)
      .where(and(eq(terceros.esCliente, true), eq(terceros.activo, true)))
    const [proveedores] = await tx
      .select({ n: count() })
      .from(terceros)
      .where(and(eq(terceros.esProveedor, true), eq(terceros.activo, true)))
    const [arts] = await tx.select({ n: count() }).from(articulos).where(eq(articulos.activo, true))
    const [semana] = await tx
      .select({ n: count() })
      .from(auditoria)
      .where(and(gte(auditoria.fecha, sql`now() - interval '7 days'`), sql`${auditoria.accion} <> 'ingreso'`))
    const [abiertos] = await tx
      .select({ n: count() })
      .from(pedidos)
      .where(inArray(pedidos.estado, ['pendiente', 'parcial']))
    const [enviados] = await tx.select({ n: count() }).from(presupuestos).where(eq(presupuestos.estado, 'enviado'))
    return {
      clientes: clientes.n,
      proveedores: proveedores.n,
      articulos: arts.n,
      cambios: semana.n,
      pedidosAbiertos: abiertos.n,
      presupuestosEnviados: enviados.n,
      dolar: await cotizacionVigente(tx, 'DOL'),
    }
  })

  const cifras = [
    { valor: datos.clientes, texto: 'clientes activos', href: '/terceros?tipo=clientes' },
    { valor: datos.proveedores, texto: 'proveedores', href: '/terceros?tipo=proveedores' },
    { valor: datos.articulos, texto: 'artículos', href: '/articulos' },
    { valor: datos.pedidosAbiertos, texto: 'pedidos por entregar', href: '/pedidos' },
    { valor: datos.presupuestosEnviados, texto: 'presupuestos esperando respuesta', href: '/presupuestos' },
    { valor: datos.cambios, texto: 'cambios en los últimos 7 días' },
  ]

  return (
    <>
      <EncabezadoPagina
        titulo={`Buen día, ${sesion.usuario.nombre.split(' ')[0]}`}
        bajada={
          <>
            Buscá cualquier cliente, artículo o acción con <Tecla>Ctrl</Tecla> <Tecla>K</Tecla>.
          </>
        }
        acciones={
          <BotonEnlace href="/terceros/nuevo" variante="primario">
            <UserPlus aria-hidden className="size-4" />
            Nuevo cliente
          </BotonEnlace>
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-borde bg-borde lg:grid-cols-6">
        {cifras.map((c) => {
          const contenido = (
            <>
              <span className="cifras block text-2xl font-medium">{c.valor.toLocaleString('es-AR')}</span>
              <span className="mt-1 block text-xs text-texto-2">{c.texto}</span>
            </>
          )
          return c.href ? (
            <Link key={c.texto} href={c.href} className="bg-superficie px-4 py-4 transition-colors hover:bg-superficie-2">
              {contenido}
            </Link>
          ) : (
            <div key={c.texto} className="bg-superficie px-4 py-4">
              {contenido}
            </div>
          )
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel>
          <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Plan de implementación</h2>
          <ol className="divide-y divide-borde">
            {ETAPAS.map((e) => (
              <li key={e.n} className="flex items-start gap-3 px-4 py-3">
                <span className="cifras mt-0.5 w-5 shrink-0 text-xs text-texto-3">{e.n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{e.nombre}</span>
                  <span className="block text-xs text-texto-2">{e.detalle}</span>
                </span>
                <Chip
                  tono={
                    e.estado === 'listo' ? 'ok' : e.estado === 'en curso' ? 'acento' : e.estado === 'próxima' ? 'info' : 'neutro'
                  }
                >
                  {e.estado}
                </Chip>
              </li>
            ))}
          </ol>
        </Panel>
        <div className="flex h-fit flex-col gap-6">
          <WidgetCotizacion
            vigente={datos.dolar}
            hoy={hoyArgentina()}
            puedeCargar={tienePermiso(sesion.permisos, 'maestros.configuracion')}
          />
          <Panel className="p-4">
            <h2 className="text-sm font-semibold">Accesos rápidos</h2>
            <div className="mt-3 flex flex-col gap-2">
              <BotonEnlace href="/presupuestos/nuevo" className="justify-start">
                <FilePlus aria-hidden className="size-4" /> Nuevo presupuesto
              </BotonEnlace>
              <BotonEnlace href="/pedidos" className="justify-start">
                <ClipboardList aria-hidden className="size-4" /> Pedidos por entregar
              </BotonEnlace>
              <BotonEnlace href="/stock" className="justify-start">
                <Boxes aria-hidden className="size-4" /> Stock
              </BotonEnlace>
              <BotonEnlace href="/terceros" className="justify-start">
                <Users aria-hidden className="size-4" /> Clientes y proveedores
              </BotonEnlace>
              <BotonEnlace href="/articulos" className="justify-start">
                <Package aria-hidden className="size-4" /> Artículos y precios
              </BotonEnlace>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
