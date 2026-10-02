'use client'

import { Command } from 'cmdk'
import {
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  FileInput,
  FilePlus,
  HandCoins,
  FileText,
  Landmark,
  LogOut,
  Package,
  Printer,
  Receipt,
  Scale,
  Search,
  Truck,
  UserPlus,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { buscar } from '@/app/(app)/acciones'
import { salir } from '@/app/ingresar/acciones'
import type { Resultado } from '@/modulos/busqueda'

import { Tecla } from '../ui'

/** Atajos del módulo de contratos (solo si la empresa lo tiene). */
const ACCIONES_CONTRATOS = [
  { id: 'contratos', texto: 'Ir a contratos', href: '/contratos', icono: Printer, claves: 'abono copias fotocopiadora' },
  { id: 'equipos', texto: 'Ir a equipos', href: '/equipos', icono: Printer, claves: 'parque instalado serie maquina' },
  { id: 'lecturas', texto: 'Cargar lecturas', href: '/contratos/lecturas', icono: Printer, claves: 'contadores mps copias' },
  {
    id: 'facturar-contratos',
    texto: 'Facturar contratos del mes',
    href: '/contratos/facturar',
    icono: Receipt,
    claves: 'abonos copias excedentes',
  },
  {
    id: 'servicio',
    texto: 'Ir a servicio técnico',
    href: '/servicio',
    icono: Wrench,
    claves: 'ordenes reparacion falla tecnico',
  },
  {
    id: 'nueva-orden-servicio',
    texto: 'Nueva orden de servicio',
    href: '/servicio/nueva',
    icono: Wrench,
    claves: 'falla reparacion llamado tecnico',
  },
  {
    id: 'calendario-servicio',
    texto: 'Calendario de técnicos',
    href: '/servicio/calendario',
    icono: Wrench,
    claves: 'agenda coordinacion asignar',
  },
  { id: 'mi-agenda', texto: 'Mi agenda (técnico)', href: '/tecnico', icono: Wrench, claves: 'celular ordenes del dia' },
  {
    id: 'preventivos',
    texto: 'Mantenimiento preventivo',
    href: '/servicio/preventivos',
    icono: Wrench,
    claves: 'repetitiva periodica copias',
  },
  {
    id: 'tipos-orden',
    texto: 'Tipos de orden y formularios',
    href: '/servicio/tipos',
    icono: Wrench,
    claves: 'plantilla checklist formulario',
  },
  {
    id: 'tablero-servicio',
    texto: 'Tablero de servicio técnico',
    href: '/servicio/tablero',
    icono: Wrench,
    claves: 'indicadores kpi sla nps',
  },
  {
    id: 'recordatorios',
    texto: 'Recordatorios de clientes',
    href: '/servicio/recordatorios',
    icono: Wrench,
    claves: 'seguimiento llamar',
  },
  {
    id: 'config-servicio',
    texto: 'Configuración del servicio técnico',
    href: '/servicio/configuracion',
    icono: Wrench,
    claves: 'sla avisos correo encuesta',
  },
]

const ACCIONES = [
  {
    id: 'nuevo-tercero',
    texto: 'Nuevo cliente o proveedor',
    href: '/terceros/nuevo',
    icono: UserPlus,
    claves: 'alta crear agregar',
  },
  { id: 'nuevo-presupuesto', texto: 'Nuevo presupuesto', href: '/presupuestos/nuevo', icono: FilePlus, claves: 'cotizar crear' },
  { id: 'nuevo-pedido', texto: 'Nuevo pedido', href: '/pedidos/nuevo', icono: FilePlus, claves: 'nota venta crear' },
  { id: 'nueva-factura', texto: 'Nueva factura', href: '/facturas/nueva', icono: Receipt, claves: 'facturar comprobante arca' },
  {
    id: 'nueva-cobranza',
    texto: 'Nueva cobranza',
    href: '/cobranzas/nueva',
    icono: Wallet,
    claves: 'recibo cobrar pago cliente',
  },
  { id: 'facturas', texto: 'Ir a facturas', href: '/facturas', icono: Receipt, claves: 'comprobantes notas de credito debito' },
  { id: 'cuentas', texto: 'Ir a cuentas corrientes', href: '/cuentas', icono: Wallet, claves: 'deudores saldos deuda' },
  { id: 'tesoreria', texto: 'Ir a cajas y bancos', href: '/tesoreria', icono: Landmark, claves: 'tesoreria saldos banco caja' },
  {
    id: 'movimiento',
    texto: 'Nuevo movimiento de caja o banco',
    href: '/tesoreria/movimiento',
    icono: Landmark,
    claves: 'gasto retiro transferencia deposito',
  },
  {
    id: 'cheques',
    texto: 'Ir a cheques',
    href: '/tesoreria/cheques',
    icono: Wallet,
    claves: 'cartera echeq depositar rechazado',
  },
  {
    id: 'nueva-compra',
    texto: 'Registrar compra',
    href: '/compras/nueva',
    icono: FileInput,
    claves: 'factura proveedor gasto cargar',
  },
  {
    id: 'nuevo-pago',
    texto: 'Nueva orden de pago',
    href: '/pagos/nuevo',
    icono: HandCoins,
    claves: 'pagar proveedor retencion ganancias',
  },
  {
    id: 'mis-comprobantes',
    texto: 'Mis Comprobantes de ARCA',
    href: '/compras/importar',
    icono: FileInput,
    claves: 'importar recibidos conciliar',
  },
  { id: 'compras', texto: 'Ir a compras', href: '/compras', icono: FileInput, claves: 'comprobantes proveedores iva compras' },
  {
    id: 'cuentas-proveedores',
    texto: 'Ir a cuentas de proveedores',
    href: '/cuentas-proveedores',
    icono: Scale,
    claves: 'deuda proveedores saldos',
  },
  { id: 'presupuestos', texto: 'Ir a presupuestos', href: '/presupuestos', icono: FileText, claves: 'cotizaciones' },
  { id: 'pedidos', texto: 'Ir a pedidos', href: '/pedidos', icono: ClipboardList, claves: 'notas de venta pendientes' },
  { id: 'remitos', texto: 'Ir a remitos', href: '/remitos', icono: Truck, claves: 'entregas despacho' },
  { id: 'stock', texto: 'Ir a stock', href: '/stock', icono: Boxes, claves: 'existencias inventario depositos' },
  { id: 'terceros', texto: 'Ir a clientes y proveedores', href: '/terceros', icono: Users, claves: 'listado' },
  { id: 'articulos', texto: 'Ir a artículos y precios', href: '/articulos', icono: Package, claves: 'productos lista' },
  { id: 'empresa', texto: 'Cambiar de empresa', href: '/empresas', icono: ArrowLeftRight, claves: 'empresa cuenta' },
]

/**
 * Búsqueda universal: Ctrl + K (o Cmd + K) desde cualquier pantalla. Busca
 * clientes, proveedores y artículos en el servidor y ofrece acciones.
 */
export function PaletaComandos({ funciones = [] }: { funciones?: string[] }) {
  const [abierta, setAbierta] = useState(false)
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [buscando, iniciar] = useTransition()
  const router = useRouter()
  const ultimo = useRef(0)

  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAbierta((a) => !a)
      }
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [])

  function alEscribir(valor: string) {
    setTexto(valor)
    const pedido = ++ultimo.current
    if (valor.trim().length < 2) return setResultados([])
    // Pequeña espera para no consultar por cada tecla.
    setTimeout(() => {
      if (pedido !== ultimo.current) return
      iniciar(async () => {
        const r = await buscar(valor)
        if (pedido === ultimo.current) setResultados(r)
      })
    }, 180)
  }

  const filtro = texto.toLowerCase()
  const acciones = [...ACCIONES, ...(funciones.includes('contratos') ? ACCIONES_CONTRATOS : [])].filter(
    (a) => !filtro || `${a.texto} ${a.claves}`.toLowerCase().includes(filtro),
  )
  const mostrarSalir = !filtro || 'cerrar sesion salir'.includes(filtro)

  function ir(href: string) {
    setAbierta(false)
    setTexto('')
    setResultados([])
    router.push(href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        aria-label="Buscar (Ctrl + K)"
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-borde bg-superficie-2 px-3 text-sm text-texto-3 transition-colors hover:border-texto-3"
      >
        <Search aria-hidden className="size-4" />
        <span className="flex-1 text-left">Buscar clientes, artículos o acciones…</span>
        <span className="hidden items-center gap-1 sm:flex">
          <Tecla>Ctrl</Tecla>
          <Tecla>K</Tecla>
        </span>
      </button>
      <Command.Dialog
        open={abierta}
        onOpenChange={setAbierta}
        label="Búsqueda universal"
        shouldFilter={false}
        overlayClassName="fixed inset-0 z-40 bg-black/30"
        contentClassName="fixed top-[12vh] left-1/2 z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-borde bg-superficie shadow-panel"
      >
        <div className="flex items-center gap-2 border-b border-borde px-4">
          <Search aria-hidden className="size-4 text-texto-3" />
          <Command.Input
            value={texto}
            onValueChange={alEscribir}
            placeholder="Nombre, código, CUIT o acción…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-texto-3"
          />
          {buscando && <span className="text-xs text-texto-3">Buscando…</span>}
        </div>
        <Command.List className="max-h-[50vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-texto-3">No hay resultados para “{texto}”.</Command.Empty>
          {resultados.length > 0 && (
            <Command.Group
              heading="Resultados"
              className="text-xs text-texto-3 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
            >
              {resultados.map((r) => (
                <Command.Item
                  key={`${r.tipo}-${r.id}`}
                  value={`${r.tipo}-${r.id}`}
                  onSelect={() => ir(r.href)}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-texto data-[selected=true]:bg-acento-suave"
                >
                  {r.tipo === 'tercero' ? (
                    <Users aria-hidden className="size-4 text-texto-3" />
                  ) : (
                    <Package aria-hidden className="size-4 text-texto-3" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{r.titulo}</span>
                  <span className="cifras truncate text-xs text-texto-3">{r.detalle}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {(acciones.length > 0 || mostrarSalir) && (
            <Command.Group
              heading="Acciones"
              className="text-xs text-texto-3 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
            >
              {acciones.map((a) => (
                <Command.Item
                  key={a.id}
                  value={a.id}
                  onSelect={() => ir(a.href)}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-texto data-[selected=true]:bg-acento-suave"
                >
                  <a.icono aria-hidden className="size-4 text-texto-3" />
                  {a.texto}
                </Command.Item>
              ))}
              {mostrarSalir && (
                <Command.Item
                  value="salir"
                  onSelect={() => salir()}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-texto data-[selected=true]:bg-acento-suave"
                >
                  <LogOut aria-hidden className="size-4 text-texto-3" />
                  Cerrar sesión
                </Command.Item>
              )}
            </Command.Group>
          )}
        </Command.List>
      </Command.Dialog>
    </>
  )
}
