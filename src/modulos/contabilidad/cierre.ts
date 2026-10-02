import { and, asc, eq, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { configuracionContable, ejercicios, presentaciones, terceros } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { hoyArgentina } from '../../lib/fechas'
import { filasDe } from '../compras/compras'
import { limitesPeriodo } from '../impuestos/libroIva'
import { posicionIva } from '../impuestos/posicionIva'
import { listarCheques } from '../tesoreria/cheques'
import { saldosCuentas } from '../tesoreria/cuentas'
import { registrarAsiento, revertirAsiento, type Linea } from './asientos'
import { contabilizar, pendientesDeContabilizar } from './automaticos'
import { asignarClave, configuracionContableDe, mapaDeCuentas, planDeCuentas } from './plan'

/**
 * Lo que el contador hacía a mano a fin de mes y de año:
 * - la liquidación de IVA, al presentar el Libro IVA;
 * - la refundición de resultados y la apertura del ejercicio siguiente;
 * - los controles de que la contabilidad cuadra con el resto del sistema;
 * - la reclasificación de "gastos a imputar" por proveedor (y que las
 *   próximas compras ya vayan a esa cuenta).
 */

const r2 = (n: number) => Math.round(n * 100) / 100 + 0
const fechaCorta = (iso: string) => iso.split('-').reverse().join('/')

/** Saldo (debe − haber) de varias cuentas a una fecha. */
async function saldos(tx: Transaccion, cuentaIds: string[], hasta: string) {
  if (!cuentaIds.length) return new Map<string, number>()
  const filas = filasDe<{ cuentaId: string; s: string }>(
    await tx.execute(sql`
      select l.cuenta_id as "cuentaId", sum(l.debe - l.haber)::text as s
      from asientos_lineas l join asientos a on a.id = l.asiento_id
      where a.estado = 'registrado' and a.fecha <= ${hasta}
        and l.cuenta_id in (${sql.join(
          cuentaIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      group by l.cuenta_id`),
  )
  return new Map(filas.map((f) => [f.cuentaId, Number(f.s)]))
}

// ---------------------------------------------------------------- Liquidación de IVA

/**
 * Asiento de liquidación de IVA de un período presentado: cancela el débito
 * y el crédito fiscal del mes, aplica los saldos a favor y los pagos a
 * cuenta, y deja el IVA a pagar o los nuevos saldos a favor. Si el período
 * se había liquidado con una presentación anterior (rectificativa), revierte
 * esa liquidación primero.
 */
export async function liquidarIva(tx: Transaccion, usuarioId: string | null, presentacionId: string) {
  const config = await configuracionContableDe(tx)
  if (!config) return { ok: false as const, error: 'La contabilidad no está en marcha.' }
  const [pr] = await tx.select().from(presentaciones).where(eq(presentaciones.id, presentacionId))
  if (!pr || pr.impuesto !== 'iva_digital' || pr.estado !== 'presentada')
    return { ok: false as const, error: 'Esa presentación del Libro IVA no está presentada.' }
  const { hasta } = limitesPeriodo(pr.periodo)
  if (hasta < config.inicio) return { ok: true as const, omitido: 'anterior a la puesta en marcha' }

  // Liquidaciones anteriores del mismo período (presentaciones reabiertas).
  const otras = await tx
    .select({ id: presentaciones.id })
    .from(presentaciones)
    .where(and(eq(presentaciones.impuesto, 'iva_digital'), eq(presentaciones.periodo, pr.periodo)))
  const previas = filasDe<{ id: string; origenId: string }>(
    await tx.execute(sql`
      select a.id, a.origen_id as "origenId" from asientos a
      where a.origen = 'liquidacion_iva' and a.revierte_id is null and a.estado = 'registrado'
        and a.origen_id in (${sql.join(
          otras.map((o) => sql`${o.id}::uuid`),
          sql`, `,
        )})
        and not exists (select 1 from asientos b where b.revierte_id = a.id)`),
  )
  if (previas.some((p) => p.origenId === presentacionId)) return { ok: true as const, omitido: 'ya liquidado' }
  for (const p of previas) {
    const r = await revertirAsiento(
      tx,
      usuarioId,
      p.id,
      hasta,
      `Anulación de la liquidación de IVA ${pr.periodo} (rectificativa)`,
    )
    if (!r.ok) return r
  }

  // Lo de las ventas y compras del mes tiene que estar asentado antes.
  await contabilizar(tx, usuarioId, hasta)
  const pos =
    (pr.resumen as { posicion?: Awaited<ReturnType<typeof posicionIva>> }).posicion ?? (await posicionIva(tx, pr.periodo))
  const m = await mapaDeCuentas(tx)
  const lineas: Linea[] = []
  const faltan: string[] = []
  const linea = (clave: string, debe: number, haber: number) => {
    if (!r2(debe) && !r2(haber)) return
    const cuentaId = m.get(clave)
    if (!cuentaId) faltan.push(clave)
    else lineas.push({ cuentaId, debe: r2(debe), haber: r2(haber) })
  }
  linea('iva_debito', pos.debito, 0)
  linea('iva_credito', 0, pos.credito)
  linea('iva_saldo_tecnico', 0, pos.anterior.tecnico)
  linea('percepciones_iva_sufridas', 0, pos.percepciones)
  linea('retenciones_iva_sufridas', 0, pos.retenciones)
  linea('iva_libre_disponibilidad', 0, pos.anterior.libre)
  linea('iva_saldo_tecnico', pos.saldoTecnicoAFavor, 0)
  linea('iva_libre_disponibilidad', pos.libreDisponibilidad, 0)
  linea('iva_a_pagar', 0, pos.aPagar)
  if (faltan.length) return { ok: false as const, error: `Faltan asignar las cuentas: ${faltan.join(', ')}.` }
  if (lineas.length < 2) return { ok: true as const, omitido: 'sin movimiento' }
  return registrarAsiento(tx, usuarioId, {
    fecha: hasta,
    concepto: `Liquidación de IVA ${pr.periodo.split('-').reverse().join('/')}${pr.transaccion ? ` (transacción ${pr.transaccion})` : ''}`,
    origen: 'liquidacion_iva',
    origenId: pr.id,
    automatico: true,
    lineas,
  })
}

/** Al presentar el Libro IVA: si la contabilidad está en marcha, la liquidación se asienta sola. */
export async function alPresentarIvaContable(tx: Transaccion, usuarioId: string, presentacionId: string) {
  if (!(await configuracionContableDe(tx))) return null
  return liquidarIva(tx, usuarioId, presentacionId)
}

// ---------------------------------------------------------------- Cierre de ejercicio

/**
 * Cierra un ejercicio: asienta lo pendiente, refunde las cuentas de
 * resultado contra "Resultado del ejercicio" al último día, abre el
 * siguiente pasando el resultado a "Resultados no asignados" y bloquea las
 * fechas del ejercicio cerrado.
 */
export async function cerrarEjercicio(tx: Transaccion, usuarioId: string, ejercicioId: string) {
  const config = await configuracionContableDe(tx)
  if (!config) return { ok: false as const, error: 'La contabilidad no está en marcha.' }
  const [e] = await tx.select().from(ejercicios).where(eq(ejercicios.id, ejercicioId)).for('update')
  if (!e) return { ok: false as const, error: 'Ese ejercicio no existe.' }
  if (e.estado === 'cerrado') return { ok: false as const, error: 'El ejercicio ya está cerrado.' }
  const [anteriorAbierto] = await tx
    .select()
    .from(ejercicios)
    .where(and(eq(ejercicios.estado, 'abierto'), sql`${ejercicios.fin} < ${e.inicio}`))
  if (anteriorAbierto) return { ok: false as const, error: 'Primero cerrá el ejercicio anterior.' }
  if (e.fin >= hoyArgentina()) return { ok: false as const, error: 'El ejercicio todavía no terminó.' }

  const pendientes = await contabilizar(tx, usuarioId, e.fin, 100000)
  if (pendientes.errores.length)
    return {
      ok: false as const,
      error: `Hay ${pendientes.errores.length} operaciones que no se pudieron asentar (la primera: ${pendientes.errores[0].descripcion}: ${pendientes.errores[0].error}).`,
    }

  const plan = await planDeCuentas(tx)
  const m = await mapaDeCuentas(tx)
  const resultadoId = m.get('resultado_ejercicio')
  const rnaId = m.get('resultados_no_asignados')
  if (!resultadoId || !rnaId)
    return { ok: false as const, error: 'Asigná las cuentas de Resultado del ejercicio y Resultados no asignados.' }
  const deResultado = plan.filter((c) => c.imputable && (c.tipo === 'ingreso' || c.tipo === 'egreso'))
  const s = await saldos(
    tx,
    deResultado.map((c) => c.id),
    e.fin,
  )
  // Refundición: cada cuenta de resultado a cero, contra Resultado del ejercicio.
  const lineas: Linea[] = []
  let neto = 0
  for (const c of deResultado) {
    const v = Math.round((s.get(c.id) ?? 0) * 100)
    if (!v) continue
    lineas.push({ cuentaId: c.id, debe: v < 0 ? -v / 100 : 0, haber: v > 0 ? v / 100 : 0 })
    neto += v
  }
  let numeroRefundicion: number | null = null
  if (lineas.length) {
    // neto > 0: más egresos que ingresos (pérdida, saldo deudor).
    lineas.push({ cuentaId: resultadoId, debe: neto > 0 ? neto / 100 : 0, haber: neto < 0 ? -neto / 100 : 0 })
    const r = await registrarAsiento(tx, usuarioId, {
      fecha: e.fin,
      concepto: `Refundición de cuentas de resultado del ejercicio ${fechaCorta(e.inicio)} al ${fechaCorta(e.fin)}`,
      origen: 'refundicion',
      origenId: e.id,
      automatico: true,
      lineas,
    })
    if (!r.ok) return r
    numeroRefundicion = r.numero
  }
  await tx.update(ejercicios).set({ estado: 'cerrado', cerrado: new Date() }).where(eq(ejercicios.id, e.id))
  if (!config.cerradoHasta || config.cerradoHasta < e.fin) await tx.update(configuracionContable).set({ cerradoHasta: e.fin })

  // Apertura: el resultado pasa a Resultados no asignados (lo distribuye la asamblea).
  const inicio = new Date(`${e.fin}T12:00:00Z`)
  inicio.setUTCDate(inicio.getUTCDate() + 1)
  const fechaApertura = inicio.toISOString().slice(0, 10)
  let numeroApertura: number | null = null
  const resultado = (await saldos(tx, [resultadoId], e.fin)).get(resultadoId) ?? 0
  const rc = Math.round(resultado * 100)
  if (rc) {
    const r = await registrarAsiento(tx, usuarioId, {
      fecha: fechaApertura,
      concepto: `Apertura: resultado del ejercicio ${fechaCorta(e.inicio)} al ${fechaCorta(e.fin)} a Resultados no asignados`,
      origen: 'apertura',
      origenId: e.id,
      automatico: true,
      lineas: [
        { cuentaId: resultadoId, debe: rc < 0 ? -rc / 100 : 0, haber: rc > 0 ? rc / 100 : 0 },
        { cuentaId: rnaId, debe: rc > 0 ? rc / 100 : 0, haber: rc < 0 ? -rc / 100 : 0 },
      ],
    })
    if (!r.ok) return r
    numeroApertura = r.numero
  }
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'ejercicio', entidadId: e.id, despues: { estado: 'cerrado' } })
  return { ok: true as const, resultado: r2(-resultado), refundicion: numeroRefundicion, apertura: numeroApertura }
}

// ---------------------------------------------------------------- Controles

export type ControlContable = { gravedad: 'error' | 'aviso'; tema: string; detalle: string; diferencia?: number }

/**
 * Lo que tiene que cuadrar entre la contabilidad y el resto del sistema.
 * Cada diferencia explica la causa probable.
 */
export async function controlesContables(tx: Transaccion, hasta = hoyArgentina()): Promise<ControlContable[]> {
  const config = await configuracionContableDe(tx)
  if (!config) return []
  const out: ControlContable[] = []
  const m = await mapaDeCuentas(tx)
  const pend = await pendientesDeContabilizar(tx, hasta)
  if (pend?.total)
    out.push({
      gravedad: 'aviso',
      tema: 'Operaciones sin asiento',
      detalle: `${pend.ventas} ventas, ${pend.compras} compras, ${pend.cobranzas} cobranzas y ${pend.pagos} pagos esperan su asiento: tocá "Contabilizar".`,
    })

  // Cajas y bancos: el saldo de la cuenta contable tiene que ser el de tesorería.
  const cajas = (await saldosCuentas(tx, hasta)).filter((c) => c.moneda === 'PES')
  const ids = cajas.map((c) => m.get(`tesoreria:${c.id}`)).filter((x): x is string => !!x)
  const s = await saldos(
    tx,
    [...ids, ...['valores_a_depositar', 'cheques_diferidos'].map((k) => m.get(k)!).filter(Boolean)],
    hasta,
  )
  for (const c of cajas) {
    const id = m.get(`tesoreria:${c.id}`)
    if (!id) continue
    const dif = r2((s.get(id) ?? 0) - Number(c.saldo))
    if (Math.abs(dif) >= 0.01)
      out.push({
        gravedad: 'error',
        tema: `Saldo de ${c.nombre}`,
        detalle: `Contabilidad ${(s.get(id) ?? 0).toFixed(2)} y tesorería ${c.saldo}. Si es el saldo con el que arrancó, cargalo como saldo inicial en tesorería o con un asiento de apertura.`,
        diferencia: dif,
      })
  }

  // Cheques de terceros en cartera = Valores a depositar.
  const cartera = (await listarCheques(tx, { estado: 'cartera' })).reduce((t, c) => t + Number(c.importe), 0)
  const vad = s.get(m.get('valores_a_depositar') ?? '') ?? 0
  if (Math.abs(r2(vad - cartera)) >= 0.01)
    out.push({
      gravedad: 'aviso',
      tema: 'Valores a depositar',
      detalle: `Contabilidad ${vad.toFixed(2)} y cheques en cartera ${cartera.toFixed(2)}. Puede haber cheques recibidos antes de la puesta en marcha o pendientes de asentar.`,
      diferencia: r2(vad - cartera),
    })

  // Cheques propios diferidos que todavía no vencieron = Cheques diferidos a pagar.
  const [dif] = filasDe<{ t: string }>(
    await tx.execute(sql`
      select coalesce(sum(pv.importe * p.cotizacion), 0)::text as t
      from pagos_valores pv join pagos p on p.id = pv.pago_id and p.estado = 'emitido'
      where pv.medio in ('cheque_propio', 'echeq_propio') and pv.fecha_pago > p.fecha and pv.fecha_pago > ${hasta}
        and p.fecha >= ${config.inicio} and p.fecha <= ${hasta}`),
  )
  const cd = -(s.get(m.get('cheques_diferidos') ?? '') ?? 0)
  if (Math.abs(r2(cd - Number(dif?.t ?? 0))) >= 0.01)
    out.push({
      gravedad: 'aviso',
      tema: 'Cheques diferidos a pagar',
      detalle: `Contabilidad ${cd.toFixed(2)} y cheques propios sin debitar ${Number(dif?.t ?? 0).toFixed(2)}.`,
      diferencia: r2(cd - Number(dif?.t ?? 0)),
    })

  // Períodos de IVA presentados sin liquidación.
  const sinLiquidar = filasDe<{ periodo: string }>(
    await tx.execute(sql`
      select p.periodo from presentaciones p
      where p.impuesto = 'iva_digital' and p.estado = 'presentada' and p.periodo >= ${config.inicio.slice(0, 7)}
        and not exists (select 1 from asientos a where a.origen = 'liquidacion_iva' and a.origen_id = p.id and a.revierte_id is null)
      order by p.periodo`),
  )
  for (const p of sinLiquidar)
    out.push({
      gravedad: 'aviso',
      tema: 'Liquidación de IVA',
      detalle: `El período ${p.periodo} está presentado pero sin asiento de liquidación.`,
    })

  // Cuentas "a imputar" con saldo: el contador las tiene que reclasificar.
  const plan = await planDeCuentas(tx)
  const aImputar = ['gastos_a_imputar', 'otros_creditos', 'otras_deudas', 'saldos_iniciales'].map((k) => [k, m.get(k)] as const)
  const sa = await saldos(
    tx,
    aImputar.map(([, id]) => id).filter((x): x is string => !!x),
    hasta,
  )
  for (const [, id] of aImputar) {
    const v = r2(sa.get(id ?? '') ?? 0)
    if (!id || !v) continue
    const c = plan.find((x) => x.id === id)!
    out.push({
      gravedad: 'aviso',
      tema: c.nombre,
      detalle: `Tiene saldo ${v > 0 ? 'deudor' : 'acreedor'} de ${Math.abs(v).toFixed(2)}: reclasificalo a la cuenta que corresponda.`,
      diferencia: v,
    })
  }

  // Claves sin cuenta asignada.
  const sinAsignar = ['deudores', 'proveedores', 'iva_debito', 'iva_credito', 'ventas_productos', 'redondeo'].filter(
    (k) => !m.has(k),
  )
  if (sinAsignar.length)
    out.push({ gravedad: 'error', tema: 'Plan de cuentas', detalle: `Faltan asignar las cuentas de: ${sinAsignar.join(', ')}.` })
  return out
}

// ---------------------------------------------------------------- Gastos a imputar por proveedor

/** Lo que quedó en "Gastos a imputar", por proveedor, desde la fecha de cierre. */
export async function gastosAImputarPorProveedor(tx: Transaccion) {
  const config = await configuracionContableDe(tx)
  const m = await mapaDeCuentas(tx)
  const cuenta = m.get('gastos_a_imputar')
  if (!config || !cuenta) return []
  return filasDe<{ terceroId: string; proveedor: string; importe: string; cantidad: number }>(
    await tx.execute(sql`
      select c.tercero_id as "terceroId", t.razon_social as proveedor,
        sum(l.debe - l.haber)::text as importe, count(distinct a.id)::int as cantidad
      from asientos_lineas l
      join asientos a on a.id = l.asiento_id and a.estado = 'registrado' and a.origen = 'compra'
      join compras c on c.id = a.origen_id
      join terceros t on t.id = c.tercero_id
      where l.cuenta_id = ${cuenta} ${config.cerradoHasta ? sql`and a.fecha > ${config.cerradoHasta}` : sql``}
        and not exists (select 1 from asientos r where r.origen = 'manual' and r.origen_id = a.id)
      group by c.tercero_id, t.razon_social
      having sum(l.debe - l.haber) <> 0
      order by sum(l.debe - l.haber) desc`),
  ).map((f) => ({ ...f, importe: Number(f.importe) }))
}

/**
 * Asigna la cuenta de gasto de un proveedor: sus próximas compras ya se
 * asientan ahí, y lo que quedó en "Gastos a imputar" (en períodos abiertos)
 * se reclasifica con un asiento por compra, con la fecha de cada una.
 */
export async function reclasificarProveedor(tx: Transaccion, usuarioId: string, terceroId: string, cuentaId: string) {
  const a = await asignarClave(tx, usuarioId, `proveedor:${terceroId}`, cuentaId)
  if (!a.ok) return a
  const config = await configuracionContableDe(tx)
  const m = await mapaDeCuentas(tx)
  const gastos = m.get('gastos_a_imputar')
  if (!config || !gastos || gastos === cuentaId) return { ok: true as const, reclasificados: 0 }
  const [p] = await tx.select({ nombre: terceros.razonSocial }).from(terceros).where(eq(terceros.id, terceroId))
  const filas = filasDe<{ asientoId: string; fecha: string; numero: number; importe: string; comprobante: string }>(
    await tx.execute(sql`
      select a.id as "asientoId", a.fecha, a.numero, sum(l.debe - l.haber)::text as importe,
        c.letra || ' ' || lpad(c.punto_venta::text, 5, '0') || '-' || lpad(coalesce(c.numero, 0)::text, 8, '0') as comprobante
      from asientos_lineas l
      join asientos a on a.id = l.asiento_id and a.estado = 'registrado' and a.origen = 'compra' and a.revierte_id is null
      join compras c on c.id = a.origen_id and c.tercero_id = ${terceroId} and c.estado = 'registrado'
      where l.cuenta_id = ${gastos} ${config.cerradoHasta ? sql`and a.fecha > ${config.cerradoHasta}` : sql``}
        and not exists (select 1 from asientos r where r.origen = 'manual' and r.origen_id = a.id)
      group by a.id, a.fecha, a.numero, c.letra, c.punto_venta, c.numero
      order by a.fecha`),
  )
  let n = 0
  for (const f of filas) {
    const v = Number(f.importe)
    if (!v) continue
    const r = await registrarAsiento(tx, usuarioId, {
      fecha: f.fecha,
      concepto: `Reclasificación del gasto de ${f.comprobante} · ${p?.nombre ?? ''} (asiento ${f.numero})`,
      origen: 'manual',
      // Apunta al asiento de la compra: así no se reclasifica dos veces.
      origenId: f.asientoId,
      lineas: [
        { cuentaId, debe: v > 0 ? v : 0, haber: v < 0 ? -v : 0 },
        { cuentaId: gastos, debe: v < 0 ? -v : 0, haber: v > 0 ? v : 0 },
      ],
    })
    if (!r.ok) return r
    n++
  }
  return { ok: true as const, reclasificados: n }
}

/** Ejercicios con su estado (para la pantalla de cierre). */
export async function listarEjercicios(tx: Transaccion) {
  return tx.select().from(ejercicios).orderBy(asc(ejercicios.inicio))
}
