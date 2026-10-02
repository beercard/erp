import { aImporte, D, monto } from '../../lib/dinero'

/**
 * Facturación mensual de un contrato por copias. Cálculo puro: los datos los
 * junta src/modulos/contratos/facturacion.ts. Reproduce lo que hace PYMEXIS
 * (validado contra su tabla Historico):
 *
 *   copias = Σ (contador actual − contador anterior − créditos) de los equipos
 *   abono:      cargo fijo + máx(0, copias − copias libres) × precio excedente
 *   excedente:  copias × precio excedente
 *   cargo fijo: cargo fijo
 *
 * Con "por equipo", el cargo fijo y las copias libres se multiplican por los
 * equipos activos. En dólares, cada precio se pasa a pesos al dólar del día.
 */

export type ContratoCalculo = {
  modalidad: 'abono' | 'excedente' | 'cargo_fijo'
  facturacion: 'adelantada' | 'vencida'
  moneda: string
  cargoFijo: string
  copiasLibres: number
  precioExcedente: string
  porEquipo: boolean
}

export type EquipoLectura = { equipoId: string; serie: string; anterior: number; actual: number; creditos: number }

export type Calculo = {
  equipos: number
  copias: number
  copiasLibres: number
  copiasExcedentes: number
  /** En la moneda del contrato. */
  cargo: string
  excedente: string
  total: string
  /** En pesos (lo que va a la factura). */
  cargoPesos: string
  precioExcedentePesos: string
  excedentePesos: string
  totalPesos: string
  detalle: (EquipoLectura & { copias: number })[]
  avisos: string[]
}

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

/** "2026-01" → "Enero/2026". */
export function nombreMes(periodo: string) {
  const [a, m] = periodo.split('-').map(Number)
  return `${MESES[m - 1]}/${a}`
}

export function mesSiguiente(periodo: string) {
  const [a, m] = periodo.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}

export function calcularContrato(c: ContratoCalculo, lecturas: EquipoLectura[], cotizacion: string): Calculo {
  const avisos: string[] = []
  const detalle = lecturas.map((l) => {
    let copias = l.actual - l.anterior - l.creditos
    if (copias < 0) {
      avisos.push(
        `El equipo ${l.serie} tiene el contador actual (${l.actual}) menor que el anterior (${l.anterior}): se cuenta 0.`,
      )
      copias = 0
    }
    return { ...l, copias }
  })
  const n = lecturas.length
  const copias = detalle.reduce((s, d) => s + d.copias, 0)
  const multiplicador = c.porEquipo ? n : 1
  const cargo = c.modalidad === 'excedente' ? new D(0) : monto(c.cargoFijo).times(multiplicador)
  const libres = c.modalidad === 'abono' ? c.copiasLibres * multiplicador : 0
  const excedentes = c.modalidad === 'cargo_fijo' ? 0 : Math.max(0, copias - libres)
  const excedente = monto(c.precioExcedente).times(excedentes)
  const cot = c.moneda === 'PES' ? new D(1) : monto(cotizacion)
  // Como PYMEXIS: el precio unitario del excedente se pasa a pesos y se multiplica por las copias.
  const precioPesos = monto(c.precioExcedente).times(cot).toDecimalPlaces(4)
  const cargoPesos = cargo.times(cot)
  const excedentePesos = precioPesos.times(excedentes)
  return {
    equipos: n,
    copias,
    copiasLibres: libres,
    copiasExcedentes: excedentes,
    cargo: aImporte(cargo),
    excedente: aImporte(excedente),
    total: aImporte(cargo.plus(excedente)),
    cargoPesos: aImporte(cargoPesos),
    precioExcedentePesos: precioPesos.toFixed(4),
    excedentePesos: aImporte(excedentePesos),
    totalPesos: aImporte(cargoPesos.plus(excedentePesos)),
    detalle,
    avisos,
  }
}

/**
 * Renglones de la factura, como los arma PYMEXIS: el abono (del mes siguiente
 * si es adelantado), el excedente del mes y renglones informativos sin precio
 * con los contadores, las copias libres y el dólar usado.
 */
export function renglonesFactura(
  c: ContratoCalculo & { alicuotaIva: number; tipo: string; leyenda?: string | null },
  calculo: Calculo,
  periodo: string,
  cotizacion: string,
) {
  const items: { descripcion: string; cantidad: string; precioUnitario: string; alicuotaIva: number }[] = []
  const info = (descripcion: string) =>
    items.push({ descripcion, cantidad: '1', precioUnitario: '0', alicuotaIva: c.alicuotaIva })
  if (monto(calculo.cargoPesos).gt(0)) {
    const mes = c.facturacion === 'adelantada' ? mesSiguiente(periodo) : periodo
    items.push({
      descripcion: `${c.tipo}: abono mensual ${c.facturacion === 'adelantada' ? 'adelantado' : 'vencido'} ${nombreMes(mes)} (${calculo.equipos} ${calculo.equipos === 1 ? 'equipo' : 'equipos'})`,
      cantidad: '1',
      precioUnitario: calculo.cargoPesos,
      alicuotaIva: c.alicuotaIva,
    })
  }
  if (calculo.copiasExcedentes > 0) {
    items.push({
      descripcion: `Copias excedentes ${nombreMes(periodo)}`,
      cantidad: String(calculo.copiasExcedentes),
      precioUnitario: calculo.precioExcedentePesos,
      alicuotaIva: c.alicuotaIva,
    })
  }
  const anterior = calculo.detalle.reduce((s, d) => s + d.anterior, 0)
  const actual = calculo.detalle.reduce((s, d) => s + d.actual, 0)
  info(
    `Contador anterior: ${anterior.toLocaleString('es-AR')} · actual: ${actual.toLocaleString('es-AR')} · copias: ${calculo.copias.toLocaleString('es-AR')}`,
  )
  if (calculo.copiasLibres > 0) info(`Copias libres: ${calculo.copiasLibres.toLocaleString('es-AR')}`)
  if (c.moneda !== 'PES') info(`Dólar BNA $ ${Number(cotizacion).toLocaleString('es-AR')}`)
  if (c.leyenda) info(c.leyenda)
  return items
}
