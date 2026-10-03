import { and, count, eq, gte, inArray, sql } from 'drizzle-orm'
import {
  ArrowUpRight,
  Boxes,
  Circle,
  CircleCheck,
  ClipboardList,
  FileInput,
  FilePlus,
  FileText,
  History,
  HandCoins,
  Package,
  Receipt,
  Smartphone,
  Store,
  Truck,
  UserPlus,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { type App, COLOR_APP, COLOR_APP_LLENO } from '@/components/shell/menu'
import { BotonEnlace, Panel, Tecla } from '@/components/ui'
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
const TAREAS: { href: string; texto: string; ayuda: string; icono: LucideIcon; permiso: string; app: App }[] = [
  {
    href: '/facturas/nueva',
    texto: 'Facturar',
    ayuda: 'Factura A, B o C con CAE',
    icono: Receipt,
    permiso: 'ventas.facturar',
    app: 'facturacion',
  },
  {
    href: '/cobranzas/nueva',
    texto: 'Cobrar',
    ayuda: 'Registrar un pago de un cliente',
    icono: Wallet,
    permiso: 'ventas.cobrar',
    app: 'facturacion',
  },
  {
    href: '/presupuestos/nuevo',
    texto: 'Presupuestar',
    ayuda: 'Armar y mandar un presupuesto',
    icono: FilePlus,
    permiso: 'ventas.presupuestos',
    app: 'ventas',
  },
  {
    href: '/pedidos/nuevo',
    texto: 'Cargar un pedido',
    ayuda: 'Lo que pidió un cliente',
    icono: ClipboardList,
    permiso: 'ventas.pedidos',
    app: 'ventas',
  },
  {
    href: '/remitos/nuevo',
    texto: 'Entregar',
    ayuda: 'Remito que descuenta stock',
    icono: Truck,
    permiso: 'ventas.remitos',
    app: 'ventas',
  },
  {
    href: '/stock',
    texto: 'Ver el stock',
    ayuda: 'Cuánto hay de cada artículo',
    icono: Boxes,
    permiso: 'stock.ver',
    app: 'ventas',
  },
  {
    href: '/compras/nueva',
    texto: 'Cargar una compra',
    ayuda: 'Factura de un proveedor',
    icono: FileInput,
    permiso: 'compras.cargar',
    app: 'compras',
  },
  {
    href: '/pagos/nuevo',
    texto: 'Pagar a un proveedor',
    ayuda: 'Con las retenciones calculadas',
    icono: HandCoins,
    permiso: 'compras.pagar',
    app: 'compras',
  },
  {
    href: '/servicio/nueva',
    texto: 'Nueva orden de servicio',
    ayuda: 'Un pedido de visita técnica',
    icono: Wrench,
    permiso: 'servicio.cargar',
    app: 'servicio',
  },
  {
    href: '/tecnico',
    texto: 'Mi agenda',
    ayuda: 'Mis visitas de hoy',
    icono: Smartphone,
    permiso: 'servicio.trabajar',
    app: 'servicio',
  },
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
    {
      valor: datos.clientes,
      texto: 'clientes activos',
      href: '/terceros?tipo=clientes',
      permiso: 'maestros.ver',
      icono: Users,
      app: 'maestros' as App,
    },
    {
      valor: datos.proveedores,
      texto: 'proveedores',
      href: '/terceros?tipo=proveedores',
      permiso: 'maestros.ver',
      icono: Store,
      app: 'compras' as App,
    },
    {
      valor: datos.articulos,
      texto: 'artículos',
      href: '/articulos',
      permiso: 'maestros.ver',
      icono: Package,
      app: 'maestros' as App,
    },
    {
      valor: datos.pedidosAbiertos,
      texto: 'pedidos a entregar',
      href: '/pedidos',
      permiso: 'ventas.ver',
      icono: ClipboardList,
      app: 'ventas' as App,
    },
    {
      valor: datos.presupuestosEnviados,
      texto: 'presupuestos enviados',
      href: '/presupuestos',
      permiso: 'ventas.ver',
      icono: FileText,
      app: 'ventas' as App,
    },
    { valor: datos.cambios, texto: 'cambios en 7 días', icono: History, app: 'ajustes' as App },
  ].filter((c) => !c.permiso || tienePermiso(sesion.permisos, c.permiso))

  const hoyLargo = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date())
  const principal = tareas[0]

  return (
    <>
      <section className="tarjeta relative mb-6 overflow-hidden px-5 py-6 sm:px-7 sm:py-7">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:radial-gradient(70%_120%_at_100%_0%,var(--acento-suave),transparent_60%)]"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-texto-2 first-letter:uppercase">{hoyLargo}</p>
            <h1 className="mt-1 text-[28px] leading-tight font-bold tracking-tight">
              {saludo()}, {sesion.usuario.nombre.split(' ')[0]}
            </h1>
            <p className="mt-1.5 text-sm text-texto-2">
              <span className="sm:hidden">Tocá la lupa de arriba para buscar cualquier cliente, artículo o acción.</span>
              <span className="hidden sm:inline">
                Buscá cualquier cliente, artículo o acción con <Tecla>Ctrl</Tecla> <Tecla>K</Tecla>.
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <BotonEnlace href="/terceros/nuevo">
              <UserPlus aria-hidden />
              Nuevo cliente
            </BotonEnlace>
            {principal && (
              <BotonEnlace href={principal.href} variante="primario">
                <principal.icono aria-hidden />
                {principal.texto}
              </BotonEnlace>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="resumen" className="mb-6">
        <h2 id="resumen" className="sr-only">
          Resumen
        </h2>
        <div className="tarjeta grid grid-cols-2 overflow-hidden md:grid-cols-3 xl:grid-cols-6">
          {cifras.map((c, n) => {
            const contenido = (
              <>
                <span className="flex items-center gap-2 text-[13px] font-medium text-texto-2">
                  <span className={`grid size-6 place-items-center rounded-md ${COLOR_APP[c.app]}`}>
                    <c.icono aria-hidden className="size-3.5" />
                  </span>
                  <span className="line-clamp-2 leading-tight first-letter:uppercase">{c.texto}</span>
                </span>
                <span className="cifras mt-3 flex items-center justify-between text-[26px] leading-none font-bold tracking-tight">
                  {c.valor.toLocaleString('es-AR')}
                  {c.href && (
                    <ArrowUpRight aria-hidden className="size-4 text-texto-3 opacity-0 transition group-hover:opacity-100" />
                  )}
                </span>
              </>
            )
            // Separadores entre celdas que se acomodan a 2, 3 o 6 columnas.
            const clase = `group block border-texto/[0.07] px-4 py-4 sm:px-5 ${n % 2 ? 'border-l' : ''} ${n >= 2 ? 'border-t' : ''} md:border-l md:border-t-0 ${n % 3 === 0 ? 'md:border-l-0' : ''} ${n >= 3 ? 'md:border-t xl:border-t-0' : ''} xl:border-l ${n === 0 ? 'xl:border-l-0' : ''}`
            return c.href ? (
              <Link key={c.texto} href={c.href} className={`${clase} transition-colors hover:bg-superficie-2`}>
                {contenido}
              </Link>
            ) : (
              <div key={c.texto} className={clase}>
                {contenido}
              </div>
            )
          })}
        </div>
      </section>

      {tareas.length > 0 && (
        <section aria-labelledby="tareas" className="mb-6">
          <h2 id="tareas" className="mb-3 text-[15px] font-semibold">
            ¿Qué querés hacer?
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tareas.map(({ href, texto, ayuda, icono: Icono, app }) => (
              <Link
                key={href}
                href={href}
                className="tarjeta group flex flex-col items-start gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-panel sm:flex-row sm:items-center"
              >
                <span
                  aria-hidden
                  className={`grid size-11 shrink-0 place-items-center rounded-xl text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),inset_0_-1px_0_rgb(0_0_0/0.15)] ${COLOR_APP_LLENO[app]}`}
                >
                  <Icono className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{texto}</span>
                  <span className="line-clamp-2 block text-xs text-texto-2">{ayuda}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className={`mt-6 grid gap-6 ${verPasos ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : 'lg:grid-cols-[340px]'}`}>
        {verPasos && (
          <Panel className="h-fit">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <h2 className="text-sm font-semibold">{hechos === pasos.length ? 'Todo listo para trabajar' : 'Primeros pasos'}</h2>
              <span className="cifras text-xs text-texto-2">
                {hechos} de {pasos.length}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Avance de los primeros pasos"
              aria-valuemin={0}
              aria-valuemax={pasos.length}
              aria-valuenow={hechos}
              className="h-1 bg-superficie-2"
            >
              <div className="h-full rounded-r-full bg-acento" style={{ width: `${(hechos / pasos.length) * 100}%` }} />
            </div>
            <ol className="divide-y divide-borde">
              {pasos.map((p) => (
                <li key={p.texto}>
                  <Link href={p.href} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-superficie-2">
                    {p.hecho ? (
                      <CircleCheck aria-label="Hecho" className="size-5 shrink-0 fill-acento text-sobre-acento" />
                    ) : (
                      <Circle aria-label="Pendiente" strokeDasharray="3 3" className="size-5 shrink-0 text-texto-3" />
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
