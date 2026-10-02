import { and, inArray, isNotNull, notInArray, sql, type Column } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import * as t from '../../db/schema'
import { siguienteNumero } from '../comercial/numeracion'
import { calcularContrato, type Calculo, type ContratoCalculo } from '../contratos/calculo'

/**
 * Parque instalado y contratos de PYMEXIS (tablas Ficheros e Historico).
 * Reglas sacadas de cómo factura KOMSA:
 *
 * - Se facturan las comercializaciones 1 (excedente), 2 (abonos), 9 (full
 *   print) y 10 (digitalizaciones). El resto son equipos vendidos, en
 *   servicio técnico, comodato…: van al parque sin contrato.
 * - Equipos del mismo cliente con el mismo "grupo" se facturan juntos (las
 *   copias se suman) con los precios del equipo "principal". Sin grupo, cada
 *   equipo es su propio contrato.
 * - Moneda 001 pesos, 002 dólares. tipoalquiler 0 = abono adelantado.
 * - En Historico, facturado = 2 son filas repetidas: no cuentan.
 */

type Fila = Record<string, string>

export type ArchivosContratos = {
  modelos: Fila[]
  tipos: Fila[]
  tecnicos: Fila[]
  ficheros: Fila[]
  historico: Fila[]
  historicoFacturas: Fila[]
}

export type Validacion = {
  factura: string
  fecha: string
  cliente: string
  netoPymexis: string
  netoCalculado: string
  diferencia: string
}

const FACTURABLES = new Set([1, 2, 9, 10])
const COMERCIALIZACION: Record<number, string> = {
  1: 'contrato',
  2: 'contrato',
  9: 'contrato',
  10: 'contrato',
  3: 'leasing',
  7: 'venta',
  11: 'comodato',
  12: 'servicio_tecnico',
  13: 'donacion',
}
const MONEDA: Record<string, string> = { '001': 'PES', '002': 'DOL' }

const limpio = (v: string | undefined) => (v ?? '').trim()
const nulo = (v: string | undefined) => limpio(v) || null
const numero = (v: string | undefined) => {
  const n = Number(limpio(v))
  return Number.isFinite(n) ? n : 0
}
const entero = (v: string | undefined) => Math.max(0, Math.round(numero(v)))
const fecha = (v: string | undefined) => {
  const f = limpio(v).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(f) && f > '1901-01-01' ? f : null
}
const facturable = (r: Fila) => FACTURABLES.has(numero(r.idcomercializacion))
const esPrincipal = (r: Fila) => ['1', 'true'].includes(limpio(r.principal).toLowerCase())
/** Clave del contrato: el grupo del cliente o, sin grupo, el equipo solo. */
const claveContrato = (r: Fila) =>
  limpio(r.grupo) ? `G:${limpio(r.idcliente)}|${limpio(r.grupo).toUpperCase()}` : `F:${limpio(r.Idinternofic)}`
/**
 * Mes facturado según la fecha de la factura: hasta el 20 es el mes anterior
 * (la fecha de lectura de PYMEXIS no sirve: queda vieja si no se carga otra).
 */
function periodoDeFactura(f: string | null) {
  if (!f) return ''
  const [a, m, d] = f.split('-').map(Number)
  if (d > 20) return f.slice(0, 7)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
}
const oracion = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s)

/** El equipo que lleva los precios del grupo (si no hay principal, el que tenga precios). */
function principalDe(filas: Fila[]) {
  const peso = (r: Fila) => numero(r.cargofijo) + numero(r.excedente) * 1000 + numero(r.copiaslibres) / 1e6
  const candidatos = filas.filter(esPrincipal)
  return [...(candidatos.length ? candidatos : filas)].sort((a, b) => peso(b) - peso(a))[0]
}

function condiciones(p: Fila): ContratoCalculo {
  const cargo = numero(p.cargofijo)
  const libres = entero(p.copiaslibres)
  const excedente = numero(p.excedente)
  return {
    modalidad: cargo > 0 ? (excedente > 0 || libres > 0 ? 'abono' : 'cargo_fijo') : 'excedente',
    facturacion: limpio(p.tipoalquiler) === '0' ? 'adelantada' : 'vencida',
    moneda: MONEDA[limpio(p.idmoneda)] ?? 'PES',
    cargoFijo: cargo.toFixed(2),
    copiasLibres: libres,
    precioExcedente: excedente.toFixed(6),
    porEquipo: ['1', 'true'].includes(limpio(p.CalculoContaxequipo ?? p.calculocontaxequipo).toLowerCase()),
  }
}

/** Agrupa las filas de Historico de una misma factura y contrato, y las calcula como lo haría el ERP. */
function facturacionesHistoricas(historico: Fila[]) {
  const grupos = new Map<string, Fila[]>()
  for (const h of historico) {
    if (limpio(h.facturado) !== '1' || ['', '0'].includes(limpio(h.idimagenfccab)) || !facturable(h)) continue
    const k = `${limpio(h.idimagenfccab)}#${claveContrato(h)}`
    grupos.set(k, [...(grupos.get(k) ?? []), h])
  }
  return [...grupos].map(([k, filas]) => {
    const p = principalDe(filas)
    const c = condiciones(p)
    const cotizacion = c.moneda === 'PES' ? '1' : String(numero(p.cotizacion) || 1)
    const lecturas = filas.map((f) => ({
      equipoId: limpio(f.Idinternofic),
      serie: limpio(f.idarticulobarra),
      anterior: entero(f.contadoranterior),
      actual: entero(f.contadoractual),
      creditos: entero(f.creditos),
    }))
    return {
      factura: k.split('#')[0],
      clave: claveContrato(p),
      fecha: fecha(p.fecha) ?? '',
      periodo: periodoDeFactura(fecha(p.fecha)),
      condiciones: c,
      cotizacion,
      cliente: limpio(p.idcliente),
      filas,
      calculo: calcularContrato(c, lecturas, cotizacion),
    }
  })
}

/**
 * Compara lo que calcula el ERP con el neto de cada factura de contratos de
 * PYMEXIS (las facturas que además llevan otros renglones, como insumos,
 * no se comparan).
 */
export function validarContratos(a: Pick<ArchivosContratos, 'historico' | 'historicoFacturas'>) {
  const facturas = new Map(a.historicoFacturas.filter((f) => limpio(f.anulada) !== '1').map((f) => [limpio(f.Idimagen), f]))
  const porFactura = new Map<string, ReturnType<typeof facturacionesHistoricas>>()
  for (const h of facturacionesHistoricas(a.historico)) porFactura.set(h.factura, [...(porFactura.get(h.factura) ?? []), h])
  const diferencias: Validacion[] = []
  let exactas = 0
  // Por contrato, si su última factura coincidió: las que no, se revisan antes de facturar desde el ERP.
  const ultima = new Map<string, { fecha: string; coincide: boolean }>()
  const anotar = (hs: ReturnType<typeof facturacionesHistoricas>, coincide: boolean) => {
    for (const h of hs) if ((ultima.get(h.clave)?.fecha ?? '') <= h.fecha) ultima.set(h.clave, { fecha: h.fecha, coincide })
  }
  for (const [id, hs] of porFactura) {
    const f = facturas.get(id)
    if (!f) continue
    // En las facturas B el "Neto" de PYMEXIS incluye el IVA; las facturas en dólares, a su cotización.
    const iva = limpio(f.Letra) === 'B' ? 1.21 : 1
    const calculado = Math.round(hs.reduce((s, h) => s + Number(h.calculo.totalPesos), 0) * iva * 100) / 100
    const neto = numero(f.Neto) * (limpio(f.idmoneda) === '002' ? numero(f.cotizacion) || 1 : 1)
    if (Math.abs(calculado - neto) <= 1) {
      exactas++
      anotar(hs, true)
      continue
    }
    anotar(hs, false)
    diferencias.push({
      factura: `${limpio(f.Letra)} ${limpio(f.Sucursal).padStart(4, '0')}-${limpio(f.Numero).padStart(8, '0')}`,
      fecha: limpio(f.Fecha).slice(0, 10),
      cliente: limpio(f.Idcliente),
      netoPymexis: neto.toFixed(2),
      netoCalculado: calculado.toFixed(2),
      diferencia: (calculado - neto).toFixed(2),
    })
  }
  const aRevisar = [...ultima].filter(([, u]) => !u.coincide).map(([clave]) => clave)
  return { comparadas: exactas + diferencias.length, exactas, diferencias, aRevisar }
}

export async function importarContratos(
  tx: Transaccion,
  usuarioId: string,
  a: ArchivosContratos,
  terceroDe: Map<string, string>,
  avisos: string[],
  cantidades: Record<string, number>,
) {
  // ------------------------------------------------------------- Modelos
  const vistos = new Set<string>()
  const filasModelos = a.modelos
    .map((m) => ({
      codigo: limpio(m.idmodelo),
      nombre: limpio(m.nombre) || limpio(m.idmodelo),
      multifuncion: limpio(m.multifuncion) === '1',
    }))
    .filter((m) => m.codigo && !vistos.has(m.codigo.toUpperCase()) && vistos.add(m.codigo.toUpperCase()))
  const modeloDe = await volcarPor(tx, t.modelosEquipo, filasModelos, 'codigo')
  cantidades.modelosDeEquipo = filasModelos.length

  const tipoDe = new Map(a.tipos.map((x) => [limpio(x.idcontrato), oracion(limpio(x.nombre))]))
  const tecnicoDe = new Map(a.tecnicos.map((x) => [limpio(x.idtecnico), limpio(x.nombre)]))
  const historicas = facturacionesHistoricas(a.historico)

  // ----------------------------------------------------------- Contratos
  const activos = a.ficheros.filter((f) => limpio(f.retirado) !== '1' && facturable(f))
  const grupos = new Map<string, Fila[]>()
  for (const f of activos) grupos.set(claveContrato(f), [...(grupos.get(claveContrato(f)) ?? []), f])
  const existentes = new Map(
    (await tx.select({ codigo: t.contratos.codigoOrigen, numero: t.contratos.numero }).from(t.contratos)).map((c) => [
      c.codigo,
      c.numero,
    ]),
  )
  const filasContratos = []
  let sinCliente = 0
  let sinPrincipal = 0
  let sinPrecio = 0
  for (const [clave, filas] of grupos) {
    const p = principalDe(filas)
    if (!filas.some(esPrincipal)) sinPrincipal++
    const terceroId = terceroDe.get(limpio(p.idcliente))
    if (!terceroId) {
      sinCliente++
      continue
    }
    const c = condiciones(p)
    if (Number(c.cargoFijo) === 0 && Number(c.precioExcedente) === 0) sinPrecio++
    const desde =
      filas
        .map((f) => fecha(f.fechacontrato) ?? fecha(f.fechainstalacion))
        .filter(Boolean)
        .sort()[0] ?? null
    filasContratos.push({
      codigoOrigen: clave,
      numero: existentes.get(clave) ?? (await siguienteNumero(tx, 'contrato')),
      terceroId,
      tipo: tipoDe.get(limpio(p.idcontrato)) || 'Servicio de fotocopiado',
      ...c,
      alicuotaIva: 5,
      desde,
      estado: filas.every((f) => limpio(f.FACTURAR) === '0') ? 'suspendido' : 'activo',
      observaciones: limpio(p.grupo) ? `Grupo "${limpio(p.grupo)}" en PYMEXIS` : null,
    })
  }
  const contratoDe = await volcarPor(tx, t.contratos, filasContratos, 'codigoOrigen')
  // Los contratos importados antes cuyos equipos ya no están: finalizados.
  const vigentes = filasContratos.map((c) => c.codigoOrigen)
  if (vigentes.length) {
    await tx
      .update(t.contratos)
      .set({ estado: 'finalizado' })
      .where(and(isNotNull(t.contratos.codigoOrigen), notInArray(t.contratos.codigoOrigen, vigentes)))
  }
  cantidades.contratos = filasContratos.length
  if (sinCliente) avisos.push(`${sinCliente} contratos de clientes que no se importaron: quedaron afuera.`)
  if (sinPrincipal)
    avisos.push(`${sinPrincipal} grupos de PYMEXIS sin equipo principal: se tomaron los precios del equipo que los tenía.`)
  if (sinPrecio) avisos.push(`${sinPrecio} contratos sin cargo fijo ni precio por copia: revisarlos (no van a facturar nada).`)

  // ------------------------------------------------------------- Equipos
  const filasEquipos = a.ficheros
    .filter((f) => limpio(f.Idinternofic))
    .map((f) => {
      const retirado = limpio(f.retirado) === '1'
      const id = limpio(f.Idinternofic)
      const enContrato = !retirado && facturable(f) ? (contratoDe.get(claveContrato(f)) ?? null) : null
      // En contrato, el piso es el "contador anterior" de PYMEXIS: si la historia del equipo quedó en
      // otro contrato (cambió de grupo), no se le cobran de nuevo copias ya facturadas.
      const inicial = entero(f.copiasinicio)
      const contadorInicial = enContrato ? Math.max(inicial, entero(f.contadoranterior)) : inicial
      return {
        codigoOrigen: id,
        serie: (limpio(f.idarticulobarra) || `PYMEXIS-${id}`).toUpperCase(),
        modeloId: modeloDe.get(limpio(f.idmodelo)) ?? null,
        articuloId: null,
        terceroId: terceroDe.get(limpio(f.idcliente)) ?? null,
        contratoId: enContrato,
        comercializacion: COMERCIALIZACION[numero(f.idcomercializacion)] ?? 'venta',
        estado: retirado ? 'retirado' : 'instalado',
        fechaInstalacion: fecha(f.fechainstalacion),
        garantiaHasta: fecha(f.fechagarantia),
        fechaRetiro: retirado ? fecha(f.fecharetiro) : null,
        motivoRetiro: retirado ? nulo(f.motivoretiro) : null,
        domicilio: nulo(f.domicilio),
        localidad: nulo(f.LOCALIDAD),
        sector: nulo(f.sector),
        contacto: null,
        telefono: nulo(f.telefono),
        horario: nulo(f.horario),
        ip: nulo(f.IP),
        tecnico: tecnicoDe.get(limpio(f.idtecnico)) || null,
        contadorInicial,
        observaciones: nulo(f.Observaciones),
      }
    })
  const equipoDe = await volcarPor(tx, t.equipos, filasEquipos, 'codigoOrigen')
  cantidades.equipos = filasEquipos.length
  cantidades.equiposEnContrato = filasEquipos.filter((e) => e.contratoId).length
  const sinCliente2 = filasEquipos.filter((e) => e.estado === 'instalado' && !e.terceroId).length
  if (sinCliente2) avisos.push(`${sinCliente2} equipos instalados sin cliente importado.`)

  // ------------------------------------------------------------ Lecturas
  const lecturas = new Map<string, { equipoId: string; fecha: string; contador: number; origen: string }>()
  const agregar = (idInterno: string, f: string | null, contador: number) => {
    const equipoId = equipoDe.get(idInterno)
    if (!equipoId || !f || contador <= 0) return
    const k = `${equipoId}|${f}`
    if (!lecturas.has(k)) lecturas.set(k, { equipoId, fecha: f, contador, origen: 'pymexis' })
  }
  for (const h of a.historico) {
    if (limpio(h.facturado) === '2') continue
    agregar(limpio(h.Idinternofic), fecha(h.fechaactual), entero(h.contadoractual))
  }
  for (const f of a.ficheros) agregar(limpio(f.Idinternofic), fecha(f.fechaactual), entero(f.contadoractual))
  const filasLecturas = [...lecturas.values()]
  for (let i = 0; i < filasLecturas.length; i += 500) {
    await tx
      .insert(t.lecturas)
      .values(filasLecturas.slice(i, i + 500))
      .onConflictDoNothing()
  }
  cantidades.lecturas = filasLecturas.length

  // ---------------------------------------------- Facturado en PYMEXIS
  // Dos facturas del mismo contrato en un mes (una corrección, dos meses juntos): queda la última,
  // que es la que tiene el contador desde el que se sigue facturando.
  const porMes = new Map<string, ReturnType<typeof facturada>>()
  let historicoSinContrato = 0
  let repetidas = 0
  for (const h of historicas.sort((x, y) => x.fecha.localeCompare(y.fecha))) {
    const contratoId = contratoDe.get(h.clave)
    if (!contratoId || !h.periodo || !h.fecha) {
      historicoSinContrato++
      continue
    }
    if (porMes.has(`${contratoId}|${h.periodo}`)) repetidas++
    const detalle = h.calculo.detalle.map((d) => ({ ...d, equipoId: equipoDe.get(d.equipoId) ?? '' })).filter((d) => d.equipoId)
    porMes.set(
      `${contratoId}|${h.periodo}`,
      facturada(contratoId, h.periodo, h.fecha, h.condiciones.moneda, h.cotizacion, h.calculo, detalle, usuarioId),
    )
  }
  const filasFacturadas = [...porMes.values()]
  for (let i = 0; i < filasFacturadas.length; i += 400) {
    await tx
      .insert(t.facturacionesContrato)
      .values(filasFacturadas.slice(i, i + 400))
      .onConflictDoNothing()
  }
  cantidades.facturacionesHistoricas = filasFacturadas.length
  if (historicoSinContrato)
    avisos.push(`${historicoSinContrato} facturaciones de PYMEXIS de contratos que ya no están vigentes: no se importaron.`)
  if (repetidas) avisos.push(`${repetidas} meses con dos facturas del mismo contrato en PYMEXIS: quedó la última.`)
  return { equipoDe, contratoDe }
}

function facturada(
  contratoId: string,
  periodo: string,
  fecha: string,
  moneda: string,
  cotizacion: string,
  c: Calculo,
  detalle: Calculo['detalle'],
  usuarioId: string,
) {
  return {
    contratoId,
    periodo,
    fecha,
    equipos: c.equipos,
    copias: c.copias,
    copiasLibres: c.copiasLibres,
    copiasExcedentes: c.copiasExcedentes,
    cargo: c.cargo,
    excedente: c.excedente,
    total: c.total,
    moneda,
    cotizacion,
    detalle,
    origen: 'pymexis',
    usuarioId,
  }
}

/** Inserta o actualiza por (empresa, clave) en tandas, y devuelve clave → id. */
async function volcarPor<T extends Record<string, unknown>>(
  tx: Transaccion,
  tabla: typeof t.modelosEquipo | typeof t.contratos | typeof t.equipos,
  filas: T[],
  clave: 'codigo' | 'codigoOrigen',
) {
  const columnas = tabla as unknown as Record<string, never>
  for (let i = 0; i < filas.length; i += 400) {
    const tanda = filas.slice(i, i + 400)
    const campos = Object.keys(tanda[0]).filter((k) => k !== clave)
    const set = Object.fromEntries(campos.map((k) => [k, excluido(columnas[k] as Column)]))
    await tx
      .insert(tabla)
      .values(tanda as never)
      .onConflictDoUpdate({ target: [columnas.empresaId, columnas[clave]], set: set as never })
  }
  const claves = filas.map((f) => String(f[clave]))
  const actuales = claves.length
    ? ((await tx
        .select({ clave: columnas[clave], id: columnas.id })
        .from(tabla as never)
        .where(inArray(columnas[clave], claves))) as { clave: string; id: string }[])
    : []
  return new Map(actuales.map((f) => [String(f.clave), f.id]))
}

const excluido = (c: Column) => sql.raw(`excluded."${c.name}"`)
