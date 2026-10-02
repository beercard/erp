import { and, count, eq, gte, inArray, sql } from 'drizzle-orm'
import { Boxes, Circle, CircleCheck, ClipboardList, FilePlus, Package, UserPlus, Users } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonEnlace, EncabezadoPagina, Panel, Tecla } from '@/components/ui'
import { comoPlataforma, conEmpresa } from '@/db/empresa'
import {
  arcaConfiguracion,
  articulos,
  auditoria,
  comprobantes,
  empresas,
  membresias,
  pedidos,
  presupuestos,
  puntosVenta,
  terceros,
} from '@/db/schema'
import { requerirEmpresa } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { tienePermiso } from '@/lib/permisos'
import { cotizacionVigente } from '@/modulos/comercial/cotizacion'

import { WidgetCotizacion } from './WidgetCotizacion'

export const metadata: Metadata = { title: 'Inicio' }

export default async function Inicio() {
  const sesion = await requerirEmpresa()
  const datos = await conEmpresa(sesion, async (tx) => {
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
    // Para "Primeros pasos".
    const [arca] = await tx.select({ certificado: arcaConfiguracion.certificado }).from(arcaConfiguracion)
    const [puntos] = await tx
      .select({ n: count() })
      .from(puntosVenta)
      .where(and(eq(puntosVenta.activo, true), inArray(puntosVenta.tipo, ['electronico', 'fce'])))
    const [emitidos] = await tx.select({ n: count() }).from(comprobantes).where(eq(comprobantes.estado, 'autorizado'))
    return {
      arca: !!arca?.certificado,
      puntosVenta: puntos.n,
      emitidos: emitidos.n,
      clientes: clientes.n,
      proveedores: proveedores.n,
      articulos: arts.n,
      cambios: semana.n,
      pedidosAbiertos: abiertos.n,
      presupuestosEnviados: enviados.n,
      dolar: await cotizacionVigente(tx, 'DOL'),
    }
  })

  const [empresa, equipo] = await comoPlataforma(async (tx) => [
    (await tx.select().from(empresas).where(eq(empresas.id, sesion.empresa.id)))[0],
    (await tx.select({ n: count() }).from(membresias).where(eq(membresias.empresaId, sesion.empresa.id)))[0].n,
  ])
  const pasos = [
    {
      hecho: !!(empresa.domicilioFiscal && empresa.inicioActividades),
      texto: 'Completar los datos fiscales de la empresa',
      href: '/configuracion/empresa',
    },
    { hecho: datos.arca, texto: 'Conectar con ARCA (certificado de factura electrónica)', href: '/configuracion/arca' },
    { hecho: datos.puntosVenta > 0, texto: 'Dar de alta el punto de venta electrónico', href: '/configuracion/puntos-venta' },
    { hecho: datos.clientes > 0, texto: 'Cargar o importar los clientes', href: '/terceros' },
    { hecho: datos.articulos > 0, texto: 'Cargar o importar los artículos y precios', href: '/articulos' },
    { hecho: equipo > 1, texto: 'Invitar al equipo', href: '/configuracion/usuarios' },
    { hecho: datos.emitidos > 0, texto: 'Emitir la primera factura', href: '/facturas/nueva' },
  ]
  const hechos = pasos.filter((p) => p.hecho).length

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
        <Panel className="h-fit">
          <div className="flex items-center justify-between gap-3 border-b border-borde px-4 py-3">
            <h2 className="text-sm font-semibold">{hechos === pasos.length ? 'Todo listo para trabajar' : 'Primeros pasos'}</h2>
            <span className="cifras text-xs text-texto-2">
              {hechos} de {pasos.length}
            </span>
          </div>
          <ol className="divide-y divide-borde">
            {pasos.map((p) => (
              <li key={p.texto}>
                <Link href={p.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-superficie-2">
                  {p.hecho ? (
                    <CircleCheck aria-label="Hecho" className="size-4 shrink-0 text-ok" />
                  ) : (
                    <Circle aria-label="Pendiente" className="size-4 shrink-0 text-texto-3" />
                  )}
                  <span className={`text-sm ${p.hecho ? 'text-texto-2 line-through' : 'font-medium'}`}>{p.texto}</span>
                </Link>
              </li>
            ))}
          </ol>
          <p className="border-t border-borde px-4 py-3 text-xs text-texto-2">
            Plan {sesion.suscripcion.nombrePlan}.{' '}
            <Link href="/configuracion/suscripcion" className="text-acento hover:underline">
              Ver la suscripción
            </Link>
          </p>
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
