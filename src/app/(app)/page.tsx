import { and, count, eq, gte, inArray, sql } from 'drizzle-orm'
import {
  Boxes,
  Circle,
  CircleCheck,
  ClipboardList,
  FileInput,
  FilePlus,
  HandCoins,
  Receipt,
  Smartphone,
  Truck,
  UserPlus,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
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

/** Las tareas de todos los días, en botones grandes. Cada uno aparece solo si quien entra puede hacerlo. */
const TAREAS: { href: string; texto: string; ayuda: string; icono: LucideIcon; permiso: string }[] = [
  { href: '/facturas/nueva', texto: 'Facturar', ayuda: 'Factura A, B o C con CAE', icono: Receipt, permiso: 'ventas.facturar' },
  {
    href: '/cobranzas/nueva',
    texto: 'Cobrar',
    ayuda: 'Registrar un pago de un cliente',
    icono: Wallet,
    permiso: 'ventas.cobrar',
  },
  {
    href: '/presupuestos/nuevo',
    texto: 'Presupuestar',
    ayuda: 'Armar y mandar un presupuesto',
    icono: FilePlus,
    permiso: 'ventas.presupuestos',
  },
  {
    href: '/pedidos/nuevo',
    texto: 'Cargar un pedido',
    ayuda: 'Lo que pidió un cliente',
    icono: ClipboardList,
    permiso: 'ventas.pedidos',
  },
  { href: '/remitos/nuevo', texto: 'Entregar', ayuda: 'Remito que descuenta stock', icono: Truck, permiso: 'ventas.remitos' },
  { href: '/stock', texto: 'Ver el stock', ayuda: 'Cuánto hay de cada artículo', icono: Boxes, permiso: 'stock.ver' },
  {
    href: '/compras/nueva',
    texto: 'Cargar una compra',
    ayuda: 'Factura de un proveedor',
    icono: FileInput,
    permiso: 'compras.cargar',
  },
  {
    href: '/pagos/nuevo',
    texto: 'Pagar a un proveedor',
    ayuda: 'Con las retenciones calculadas',
    icono: HandCoins,
    permiso: 'compras.pagar',
  },
  {
    href: '/servicio/nueva',
    texto: 'Nueva orden de servicio',
    ayuda: 'Un pedido de visita técnica',
    icono: Wrench,
    permiso: 'servicio.cargar',
  },
  { href: '/tecnico', texto: 'Mi agenda', ayuda: 'Mis visitas de hoy', icono: Smartphone, permiso: 'servicio.trabajar' },
]

function saludo(ahora = new Date()) {
  const hora = Number(
    new Intl.DateTimeFormat('es-AR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' }).format(
      ahora,
    ),
  )
  return hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'
}

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
  // Los primeros pasos son tarea de quien configura la empresa, y desaparecen al completarlos.
  const verPasos = tienePermiso(sesion.permisos, 'empresa.datos') && hechos < pasos.length
  const tareas = TAREAS.filter((t) => tienePermiso(sesion.permisos, t.permiso)).slice(0, 8)

  const cifras = [
    { valor: datos.clientes, texto: 'clientes activos', href: '/terceros?tipo=clientes', permiso: 'maestros.ver' },
    { valor: datos.proveedores, texto: 'proveedores', href: '/terceros?tipo=proveedores', permiso: 'maestros.ver' },
    { valor: datos.articulos, texto: 'artículos', href: '/articulos', permiso: 'maestros.ver' },
    { valor: datos.pedidosAbiertos, texto: 'pedidos por entregar', href: '/pedidos', permiso: 'ventas.ver' },
    {
      valor: datos.presupuestosEnviados,
      texto: 'presupuestos esperando respuesta',
      href: '/presupuestos',
      permiso: 'ventas.ver',
    },
    { valor: datos.cambios, texto: 'cambios en los últimos 7 días' },
  ].filter((c) => !c.permiso || tienePermiso(sesion.permisos, c.permiso))

  return (
    <>
      <EncabezadoPagina
        titulo={`${saludo()}, ${sesion.usuario.nombre.split(' ')[0]}`}
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

      {tareas.length > 0 && (
        <section aria-labelledby="tareas" className="mb-6">
          <h2 id="tareas" className="mb-3 text-sm font-semibold text-texto-2">
            ¿Qué querés hacer?
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tareas.map(({ href, texto, ayuda, icono: Icono }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col items-start gap-2 rounded-lg border border-borde bg-superficie p-4 transition hover:border-acento/60 hover:shadow-[var(--sombra)] sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-acento-suave text-acento transition group-hover:bg-acento group-hover:text-sobre-acento">
                  <Icono aria-hidden className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{texto}</span>
                  <span className="line-clamp-2 block text-xs text-texto-2 sm:truncate">{ayuda}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

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

      <div className={`mt-6 grid gap-6 ${verPasos ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : 'lg:grid-cols-[340px]'}`}>
        {verPasos && (
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
        )}
        <div className="flex h-fit flex-col gap-6">
          <WidgetCotizacion
            vigente={datos.dolar}
            hoy={hoyArgentina()}
            puedeCargar={tienePermiso(sesion.permisos, 'maestros.configuracion')}
          />
        </div>
      </div>
    </>
  )
}
