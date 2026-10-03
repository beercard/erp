import type { Transaccion } from '../../db/conexion'
import { articulos, cobranzaConfiguracion, condicionesPago, listasPrecios, tiposOrden } from '../../db/schema'

/**
 * Lo típico de cada rubro que queda cargado al dar de alta la empresa: listas
 * de precios, condiciones de pago, servicios para facturar, tipos de orden y
 * la cobranza automática. Todo se edita después; se suma a lo básico que se
 * crea siempre (depósito, lista general, contado y 30 días).
 */

type Preparar = (tx: Transaccion) => Promise<void>

const servicios = (tx: Transaccion, filas: { codigo: string; nombre: string; unidad?: string }[]) =>
  tx
    .insert(articulos)
    .values(filas.map((f) => ({ ...f, tipo: 'servicio', unidad: f.unidad ?? 'unidad', llevaStock: false, alicuotaIva: 5 })))

const condiciones = (tx: Transaccion, filas: { nombre: string; dias: number }[]) => tx.insert(condicionesPago).values(filas)

/** Listas derivadas de la general (que ya existe con código 001). */
async function listasDerivadas(tx: Transaccion, filas: { codigo: string; nombre: string; porcentaje: string }[]) {
  const [general] = await tx.select({ id: listasPrecios.id }).from(listasPrecios).limit(1)
  if (!general) return
  await tx.insert(listasPrecios).values(filas.map((f) => ({ ...f, moneda: 'PES', listaBaseId: general.id })))
}

const recordatoriosDeDeuda = (tx: Transaccion) => tx.insert(cobranzaConfiguracion).values({ recordatorios: true })

type TipoOrden = {
  codigo: string
  nombre: string
  clase: 'correctivo' | 'preventivo' | 'instalacion' | 'retiro' | 'insumos'
  duracion: number
  plazoHoras: number
  portal: boolean
  color: string
}
const tipos = (tx: Transaccion, filas: TipoOrden[]) => tx.insert(tiposOrden).values(filas)

const REPARACION: TipoOrden = {
  codigo: 'REP',
  nombre: 'Reparación',
  clase: 'correctivo',
  duracion: 90,
  plazoHoras: 48,
  portal: true,
  color: '#dc2626',
}
const PREVENTIVO: TipoOrden = {
  codigo: 'PRE',
  nombre: 'Mantenimiento preventivo',
  clase: 'preventivo',
  duracion: 60,
  plazoHoras: 168,
  portal: false,
  color: '#16a34a',
}
const INSTALACION: TipoOrden = {
  codigo: 'INS',
  nombre: 'Instalación',
  clase: 'instalacion',
  duracion: 120,
  plazoHoras: 72,
  portal: true,
  color: '#2563eb',
}

/** Lo que se precarga para cada rubro (los rubros están en src/lib/rubros.ts). */
export const PREPARAR_RUBRO: Record<string, Preparar> = {
  'comercios-y-distribuidoras': async (tx) => {
    await listasDerivadas(tx, [
      { codigo: '002', nombre: 'Mayorista', porcentaje: '-10' },
      { codigo: '003', nombre: 'Tarjeta en cuotas', porcentaje: '15' },
    ])
    await condiciones(tx, [
      { nombre: 'Cuenta corriente 15 días', dias: 15 },
      { nombre: 'Cuenta corriente 60 días', dias: 60 },
    ])
  },
  'mayoristas-y-distribucion': async (tx) => {
    await listasDerivadas(tx, [{ codigo: '002', nombre: 'Minorista', porcentaje: '25' }])
    await condiciones(tx, [
      { nombre: 'Cuenta corriente 15 días', dias: 15 },
      { nombre: 'Cuenta corriente 60 días', dias: 60 },
      { nombre: 'Cuenta corriente 90 días', dias: 90 },
    ])
    await recordatoriosDeDeuda(tx)
  },
  'servicio-tecnico': async (tx) => {
    await tipos(tx, [
      REPARACION,
      { ...REPARACION, codigo: 'DIA', nombre: 'Visita de diagnóstico', duracion: 60, plazoHoras: 24, color: '#f59e0b' },
      PREVENTIVO,
      INSTALACION,
    ])
    await servicios(tx, [
      { codigo: 'VIS', nombre: 'Visita técnica' },
      { codigo: 'MO', nombre: 'Hora de mano de obra', unidad: 'hora' },
    ])
  },
  'alquiler-de-equipos': async (tx) => {
    await tipos(tx, [
      { ...REPARACION, nombre: 'Service correctivo' },
      PREVENTIVO,
      INSTALACION,
      {
        codigo: 'RET',
        nombre: 'Retiro de equipo',
        clase: 'retiro',
        duracion: 60,
        plazoHoras: 72,
        portal: false,
        color: '#6b7280',
      },
      {
        codigo: 'INU',
        nombre: 'Entrega de insumos',
        clase: 'insumos',
        duracion: 30,
        plazoHoras: 48,
        portal: true,
        color: '#9333ea',
      },
    ])
    await servicios(tx, [{ codigo: 'ABO', nombre: 'Abono mensual' }])
    await recordatoriosDeDeuda(tx)
  },
  'profesionales-y-servicios': async (tx) => {
    await servicios(tx, [
      { codigo: 'HON', nombre: 'Honorarios profesionales' },
      { codigo: 'ABO', nombre: 'Abono mensual' },
    ])
    await recordatoriosDeDeuda(tx)
  },
  'estudios-contables': async (tx) => {
    await servicios(tx, [
      { codigo: 'HON', nombre: 'Honorarios mensuales' },
      { codigo: 'SUE', nombre: 'Liquidación de sueldos' },
    ])
    await recordatoriosDeDeuda(tx)
  },
}
