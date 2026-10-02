import { and, asc, eq, gte, inArray, isNotNull, lte, ne, sql, type SQL } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import {
  articulos,
  chequesRechazados,
  compras,
  comprasItems,
  comprasTributos,
  comprobantes,
  comprobantesTributos,
  cuentasTesoreria,
  movimientosTesoreria,
  pagos,
  pagosValores,
  recibos,
  recibosValores,
  retenciones,
  terceros,
} from '../../db/schema'
import { hoyArgentina } from '../../lib/fechas'
import { filasDe } from '../compras/compras'
import { registrarAsiento, revertirAsiento, type Linea, type Origen } from './asientos'
import { configuracionContableDe, mapaDeCuentas, sincronizarTesoreria } from './plan'

/**
 * Asientos automáticos: cada operación desde la fecha de inicio de la
 * contabilidad genera su asiento, y cada anulación su contraasiento. Es
 * idempotente (una operación tiene un solo asiento vigente): se corre al
 * abrir la contabilidad, desde la tarea programada o a mano, y solo hace lo
 * que falta.
 *
 *   Factura / ND:   Deudores  a  Ventas, IVA débito, percepciones a depositar
 *   Compra:         Mercaderías o gasto, IVA crédito, percepciones sufridas  a  Proveedores
 *   Cobranza:       Caja/banco/valores/retenciones sufridas  a  Deudores
 *   Pago:           Proveedores  a  Caja/banco/cheques/retenciones a depositar
 *   Cheque propio diferido, al vencer:  Cheques diferidos  a  Banco
 *   Tesorería:      la caja o banco contra la cuenta del concepto (o la otra cuenta)
 *   Notas de crédito: al revés.
 */

type Resultado = {
  generados: number
  revertidos: number
  pendientesCerrado: number
  errores: { origen: Origen; id: string; descripcion: string; error: string }[]
}

class FaltaCuenta extends Error {}

const SIN_ASIENTO = (origen: Origen, columna: SQL | unknown) =>
  sql`not exists (select 1 from asientos a where a.origen = ${origen} and a.origen_id = ${columna} and a.revierte_id is null and a.estado = 'registrado')`
const CON_ASIENTO_SIN_REVERSA = (origen: Origen, columna: SQL | unknown) =>
  sql`exists (select 1 from asientos a where a.origen = ${origen} and a.origen_id = ${columna} and a.revierte_id is null and a.estado = 'registrado')
      and not exists (select 1 from asientos a where a.origen = ${origen} and a.origen_id = ${columna} and a.revierte_id is not null)`

const fechaDe = (d: Date) => hoyArgentina(d)
const masUnDia = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Arma las líneas en centavos y, si los redondeos de la cotización dejan unos centavos, los lleva a "Diferencias de redondeo". */
class Partida {
  lineas: { cuentaId: string; d: number; h: number; detalle?: string | null; terceroId?: string | null }[] = []
  constructor(private cuenta: (clave: string) => string) {}
  debe(clave: string, importe: number, detalle?: string | null, terceroId?: string | null) {
    return this.mover(clave, Math.round(importe * 100), 0, detalle, terceroId)
  }
  haber(clave: string, importe: number, detalle?: string | null, terceroId?: string | null) {
    return this.mover(clave, 0, Math.round(importe * 100), detalle, terceroId)
  }
  private mover(clave: string, d: number, h: number, detalle?: string | null, terceroId?: string | null) {
    // Un importe negativo va al otro lado.
    if (d < 0) [d, h] = [0, -d]
    if (h < 0) [d, h] = [-h, 0]
    if (d || h) this.lineas.push({ cuentaId: this.cuenta(clave), d, h, detalle, terceroId })
    return this
  }
  /** Las notas de crédito: todo al revés. */
  invertir() {
    this.lineas = this.lineas.map((l) => ({ ...l, d: l.h, h: l.d }))
    return this
  }
  cerrar(): Linea[] {
    const dif = this.lineas.reduce((s, l) => s + l.d - l.h, 0)
    if (dif !== 0) {
      if (Math.abs(dif) > Math.max(5, this.lineas.length * 2))
        throw new Error(`Los importes no cierran por ${(dif / 100).toFixed(2)}.`)
      this.lineas.push({ cuentaId: this.cuenta('redondeo'), d: dif < 0 ? -dif : 0, h: dif > 0 ? dif : 0, detalle: 'Redondeo' })
    }
    return this.lineas.map((l) => ({
      cuentaId: l.cuentaId,
      debe: l.d / 100,
      haber: l.h / 100,
      detalle: l.detalle,
      terceroId: l.terceroId,
    }))
  }
}

const n = (v: string | number | null | undefined) => Number(v ?? 0)
const nro = (letra: string, pv: number, numero: number | null) =>
  `${letra} ${String(pv).padStart(5, '0')}-${String(numero ?? 0).padStart(8, '0')}`

/** Tributos de venta (códigos de ARCA) → cuenta. */
const cuentaTributoVenta = (t: number) =>
  [2, 5, 7].includes(t)
    ? 'percepciones_iibb_a_depositar'
    : [6, 13].includes(t)
      ? 'percepciones_iva_a_depositar'
      : 'otros_impuestos_a_depositar'

const cuentaTributoCompra: Record<string, string> = {
  percepcion_iva: 'percepciones_iva_sufridas',
  percepcion_iibb: 'percepciones_iibb_sufridas',
  percepcion_ganancias: 'percepciones_ganancias_sufridas',
  impuestos_internos: 'impuestos_tasas',
  impuesto_municipal: 'impuestos_tasas',
}

const RETENCION_SUFRIDA: Record<string, string> = {
  retencion_iibb: 'retenciones_iibb_sufridas',
  retencion_ganancias: 'retenciones_ganancias_sufridas',
  retencion_iva: 'retenciones_iva_sufridas',
  retencion_suss: 'retenciones_suss_sufridas',
}

export async function contabilizar(
  tx: Transaccion,
  usuarioId: string | null,
  hasta = hoyArgentina(),
  limite = 500,
): Promise<Resultado> {
  const r: Resultado = { generados: 0, revertidos: 0, pendientesCerrado: 0, errores: [] }
  const config = await configuracionContableDe(tx)
  if (!config) return r
  await sincronizarTesoreria(tx)
  const mapa = await mapaDeCuentas(tx)
  const cuenta = (clave: string) => {
    const id = mapa.get(clave)
    if (!id) throw new FaltaCuenta(`Falta asignar la cuenta para "${clave}" en el plan de cuentas.`)
    return id
  }
  const cuentaO = (clave: string, defecto: string) => (mapa.has(clave) ? clave : defecto)
  const desde = config.cerradoHasta && config.cerradoHasta >= config.inicio ? masUnDia(config.cerradoHasta) : config.inicio

  const asentar = async (origen: Origen, id: string, descripcion: string, fecha: string, armar: (p: Partida) => void) => {
    try {
      const p = new Partida(cuenta)
      armar(p)
      const a = await registrarAsiento(tx, usuarioId, {
        fecha,
        concepto: descripcion,
        origen,
        origenId: id,
        automatico: true,
        lineas: p.cerrar(),
      })
      if (a.ok) r.generados++
      else r.errores.push({ origen, id, descripcion, error: a.error })
    } catch (e) {
      r.errores.push({ origen, id, descripcion, error: (e as Error).message })
    }
  }
  const revertir = async (origen: Origen, id: string, descripcion: string, cuando: Date | null) => {
    const fecha = cuando ? fechaDe(cuando) : hoyArgentina()
    const a = await tx.execute(
      sql`select id from asientos where origen = ${origen} and origen_id = ${id} and revierte_id is null and estado = 'registrado' limit 1`,
    )
    const fila = filasDe<{ id: string }>(a)[0]
    if (!fila) return
    const res = await revertirAsiento(tx, usuarioId, fila.id, fecha < desde ? desde : fecha, `Anulación: ${descripcion}`)
    if (res.ok) r.revertidos++
    else r.errores.push({ origen, id, descripcion: `Anulación: ${descripcion}`, error: res.error })
    // Las reclasificaciones de ese asiento (gasto a imputar → cuenta del proveedor) también se anulan.
    const reclasificaciones = filasDe<{ id: string }>(
      await tx.execute(
        sql`select id from asientos a where origen = 'manual' and origen_id = ${fila.id} and revierte_id is null and estado = 'registrado' and not exists (select 1 from asientos b where b.revierte_id = a.id)`,
      ),
    )
    for (const x of reclasificaciones) {
      const rr = await revertirAsiento(tx, usuarioId, x.id, fecha < desde ? desde : fecha)
      if (!rr.ok)
        r.errores.push({ origen, id, descripcion: `Anulación de la reclasificación de ${descripcion}`, error: rr.error })
    }
  }
  // Lo de un período ya cerrado sin asiento no se toca: se informa.
  const contarCerrados = async (q: Promise<{ n: number }[]>) => {
    r.pendientesCerrado += (await q)[0]?.n ?? 0
  }

  // ------------------------------------------------------------ Ventas
  const ventas = await tx
    .select({ c: comprobantes, cliente: terceros.razonSocial })
    .from(comprobantes)
    .innerJoin(terceros, eq(terceros.id, comprobantes.terceroId))
    .where(
      and(
        eq(comprobantes.estado, 'autorizado'),
        ne(comprobantes.origen, 'pymexis'),
        gte(comprobantes.fecha, desde),
        lte(comprobantes.fecha, hasta),
        SIN_ASIENTO('venta', comprobantes.id),
      ),
    )
    .orderBy(asc(comprobantes.fecha), asc(comprobantes.numero))
    .limit(limite)
  if (ventas.length) {
    const ids = ventas.map((v) => v.c.id)
    const [tribs, rechazos] = await Promise.all([
      tx.select().from(comprobantesTributos).where(inArray(comprobantesTributos.comprobanteId, ids)),
      tx.select().from(chequesRechazados).where(inArray(chequesRechazados.notaDebitoClienteId, ids)),
    ])
    for (const { c, cliente } of ventas) {
      const cot = n(c.cotizacion)
      const desc = `${c.clase === 'nota_credito' ? 'NC' : c.clase === 'nota_debito' ? 'ND' : 'Factura'} ${nro(c.letra, c.puntoVenta, c.numero)} · ${cliente}`
      const rechazo = rechazos.find((x) => x.notaDebitoClienteId === c.id)
      await asentar('venta', c.id, desc, c.fecha, (p) => {
        p.debe('deudores', n(c.total) * cot, null, c.terceroId)
        if (rechazo) {
          // ND interna por cheque rechazado: recupera el cheque y los gastos.
          p.haber('cheques_rechazados', (n(c.total) - n(rechazo.gastos)) * cot)
          p.haber('gastos_bancarios', n(rechazo.gastos) * cot, 'Recupero de gastos del cheque rechazado')
        } else {
          p.haber(c.concepto === 2 ? 'ventas_servicios' : 'ventas_productos', (n(c.neto) + n(c.noGravado) + n(c.exento)) * cot)
          p.haber('iva_debito', n(c.iva) * cot)
          for (const t of tribs.filter((x) => x.comprobanteId === c.id))
            p.haber(cuentaTributoVenta(t.tributo), n(t.importe) * cot, t.descripcion)
        }
        if (c.clase === 'nota_credito') p.invertir()
      })
    }
  }
  await contarCerrados(
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(comprobantes)
      .where(
        and(
          eq(comprobantes.estado, 'autorizado'),
          ne(comprobantes.origen, 'pymexis'),
          gte(comprobantes.fecha, config.inicio),
          sql`${comprobantes.fecha} < ${desde}`,
          SIN_ASIENTO('venta', comprobantes.id),
        ),
      ),
  )

  // ------------------------------------------------------------ Compras
  const cs = await tx
    .select({ c: compras, proveedor: terceros.razonSocial })
    .from(compras)
    .innerJoin(terceros, eq(terceros.id, compras.terceroId))
    .where(
      and(gte(compras.fecha, desde), lte(compras.fecha, hasta), ne(compras.origen, 'pymexis'), SIN_ASIENTO('compra', compras.id)),
    )
    .orderBy(asc(compras.fecha))
    .limit(limite)
  if (cs.length) {
    const ids = cs.map((x) => x.c.id)
    const [items, tribs, rechazos] = await Promise.all([
      tx
        .select({ compraId: comprasItems.compraId, neto: comprasItems.neto, stock: articulos.llevaStock })
        .from(comprasItems)
        .leftJoin(articulos, eq(articulos.id, comprasItems.articuloId))
        .where(inArray(comprasItems.compraId, ids)),
      tx.select().from(comprasTributos).where(inArray(comprasTributos.compraId, ids)),
      tx.select().from(chequesRechazados).where(inArray(chequesRechazados.notaDebitoProveedorId, ids)),
    ])
    for (const { c, proveedor } of cs) {
      // Una compra anulada antes de contabilizarse no lleva asiento.
      if (c.estado !== 'registrado') continue
      const cot = n(c.cotizacion)
      const desc = `${c.clase === 'nota_credito' ? 'NC' : c.clase === 'nota_debito' ? 'ND' : 'Factura'} ${nro(c.letra, c.puntoVenta, c.numero)} · ${proveedor}`
      const gasto = cuentaO(`proveedor:${c.terceroId}`, 'gastos_a_imputar')
      const rechazo = rechazos.find((x) => x.notaDebitoProveedorId === c.id)
      await asentar('compra', c.id, desc, c.fecha, (p) => {
        const base = n(c.neto) + n(c.noGravado) + n(c.exento)
        if (rechazo) p.debe('cheques_rechazados', base * cot, 'Cheque rechazado devuelto por el proveedor')
        else {
          const delCbte = items.filter((i) => i.compraId === c.id)
          const netoItems = delCbte.reduce((s, i) => s + n(i.neto), 0)
          const conStock = delCbte.filter((i) => i.stock).reduce((s, i) => s + n(i.neto), 0)
          // La parte de artículos con stock va a Mercaderías; el resto, al gasto.
          const aMercaderias = netoItems > 0 ? (base * conStock) / netoItems : 0
          p.debe('mercaderias', aMercaderias * cot)
          p.debe(gasto, (base - aMercaderias) * cot)
        }
        p.debe('iva_credito', n(c.iva) * cot)
        for (const t of tribs.filter((x) => x.compraId === c.id)) p.debe(cuentaTributoCompra[t.tipo] ?? gasto, n(t.importe) * cot)
        p.haber('proveedores', n(c.total) * cot, null, c.terceroId)
        if (c.clase === 'nota_credito') p.invertir()
      })
    }
  }
  for (const { c, proveedor } of await tx
    .select({ c: compras, proveedor: terceros.razonSocial })
    .from(compras)
    .innerJoin(terceros, eq(terceros.id, compras.terceroId))
    .where(and(eq(compras.estado, 'anulado'), CON_ASIENTO_SIN_REVERSA('compra', compras.id)))
    .limit(limite))
    await revertir('compra', c.id, `${nro(c.letra, c.puntoVenta, c.numero)} · ${proveedor}`, c.anulado)

  // ------------------------------------------------------------ Cobranzas
  const rs = await tx
    .select({ r: recibos, cliente: terceros.razonSocial })
    .from(recibos)
    .innerJoin(terceros, eq(terceros.id, recibos.terceroId))
    .where(
      and(
        eq(recibos.estado, 'emitido'),
        gte(recibos.fecha, desde),
        lte(recibos.fecha, hasta),
        SIN_ASIENTO('cobranza', recibos.id),
      ),
    )
    .orderBy(asc(recibos.fecha))
    .limit(limite)
  if (rs.length) {
    const valores = await tx
      .select()
      .from(recibosValores)
      .where(
        inArray(
          recibosValores.reciboId,
          rs.map((x) => x.r.id),
        ),
      )
    for (const { r: rec, cliente } of rs) {
      await asentar(
        'cobranza',
        rec.id,
        `Recibo ${String(rec.puntoVenta).padStart(5, '0')}-${String(rec.numero).padStart(8, '0')} · ${cliente}`,
        rec.fecha,
        (p) => {
          let total = 0
          for (const v of valores.filter((x) => x.reciboId === rec.id)) {
            const clave = RETENCION_SUFRIDA[v.medio]
              ? RETENCION_SUFRIDA[v.medio]
              : v.medio === 'cheque' || v.medio === 'echeq'
                ? 'valores_a_depositar'
                : v.cuentaId
                  ? `tesoreria:${v.cuentaId}`
                  : v.medio === 'efectivo'
                    ? 'caja'
                    : v.medio === 'transferencia'
                      ? 'bancos'
                      : v.medio === 'otro'
                        ? 'otros_creditos'
                        : 'cupones'
            p.debe(
              clave,
              n(v.importe),
              v.medio === 'cheque' || v.medio === 'echeq'
                ? `Cheque ${v.banco ?? ''} ${v.numeroValor ?? ''}`.trim()
                : v.numeroValor,
            )
            total += n(v.importe)
          }
          p.haber('deudores', total, null, rec.terceroId)
        },
      )
    }
  }
  for (const { r: rec, cliente } of await tx
    .select({ r: recibos, cliente: terceros.razonSocial })
    .from(recibos)
    .innerJoin(terceros, eq(terceros.id, recibos.terceroId))
    .where(and(eq(recibos.estado, 'anulado'), CON_ASIENTO_SIN_REVERSA('cobranza', recibos.id)))
    .limit(limite))
    await revertir('cobranza', rec.id, `Recibo ${rec.numero} · ${cliente}`, rec.anulado)

  // ------------------------------------------------------------ Pagos
  const ps = await tx
    .select({ p: pagos, proveedor: terceros.razonSocial })
    .from(pagos)
    .innerJoin(terceros, eq(terceros.id, pagos.terceroId))
    .where(and(eq(pagos.estado, 'emitido'), gte(pagos.fecha, desde), lte(pagos.fecha, hasta), SIN_ASIENTO('pago', pagos.id)))
    .orderBy(asc(pagos.fecha))
    .limit(limite)
  if (ps.length) {
    const ids = ps.map((x) => x.p.id)
    const [valores, rets] = await Promise.all([
      tx.select().from(pagosValores).where(inArray(pagosValores.pagoId, ids)),
      tx.select().from(retenciones).where(inArray(retenciones.pagoId, ids)),
    ])
    for (const { p: pago, proveedor } of ps) {
      const cot = n(pago.cotizacion)
      await asentar('pago', pago.id, `Orden de pago ${pago.numero} · ${proveedor}`, pago.fecha, (p) => {
        let total = 0
        for (const v of valores.filter((x) => x.pagoId === pago.id)) {
          const propio = v.medio === 'cheque_propio' || v.medio === 'echeq_propio'
          const diferido = propio && !!v.fechaPago && v.fechaPago > pago.fecha
          const clave =
            v.medio === 'cheque_tercero'
              ? 'valores_a_depositar'
              : diferido
                ? 'cheques_diferidos'
                : v.cuentaId
                  ? `tesoreria:${v.cuentaId}`
                  : v.medio === 'efectivo'
                    ? 'caja'
                    : v.medio === 'tarjeta'
                      ? 'tarjetas'
                      : v.medio === 'otro'
                        ? 'otras_deudas'
                        : 'bancos'
          const importe = n(v.importe) * cot
          p.haber(clave, importe, propio ? `Cheque ${v.numeroValor ?? ''}${diferido ? ` al ${v.fechaPago}` : ''}`.trim() : null)
          total += importe
        }
        for (const t of rets.filter((x) => x.pagoId === pago.id)) {
          p.haber(`retenciones_${t.impuesto}_a_depositar`, n(t.importe), `Certificado ${t.numero}`)
          total += n(t.importe)
        }
        p.debe('proveedores', total, null, pago.terceroId)
      })
    }
  }
  for (const { p: pago, proveedor } of await tx
    .select({ p: pagos, proveedor: terceros.razonSocial })
    .from(pagos)
    .innerJoin(terceros, eq(terceros.id, pagos.terceroId))
    .where(and(eq(pagos.estado, 'anulado'), CON_ASIENTO_SIN_REVERSA('pago', pagos.id)))
    .limit(limite))
    await revertir('pago', pago.id, `Orden de pago ${pago.numero} · ${proveedor}`, pago.anulado)

  // ------------------------------------------------------------ Cheques propios diferidos al vencer
  const diferidos = await tx
    .select({ v: pagosValores, numero: pagos.numero })
    .from(pagosValores)
    .innerJoin(pagos, eq(pagos.id, pagosValores.pagoId))
    .where(
      and(
        inArray(pagosValores.medio, ['cheque_propio', 'echeq_propio']),
        eq(pagos.estado, 'emitido'),
        isNotNull(pagosValores.fechaPago),
        sql`${pagosValores.fechaPago} > ${pagos.fecha}`,
        gte(pagosValores.fechaPago, desde),
        lte(pagosValores.fechaPago, hasta),
        SIN_ASIENTO('cheque_propio', pagosValores.id),
      ),
    )
    .limit(limite)
  for (const { v, numero } of diferidos)
    await asentar(
      'cheque_propio',
      v.id,
      `Débito del cheque ${v.numeroValor ?? ''} (orden de pago ${numero})`.replace(/\s+/g, ' '),
      v.fechaPago!,
      (p) => {
        p.debe('cheques_diferidos', n(v.importe))
        p.haber(v.cuentaId ? `tesoreria:${v.cuentaId}` : 'bancos', n(v.importe))
      },
    )

  for (const { v, numero } of await tx
    .select({ v: pagosValores, numero: pagos.numero })
    .from(pagosValores)
    .innerJoin(pagos, eq(pagos.id, pagosValores.pagoId))
    .where(and(eq(pagos.estado, 'anulado'), CON_ASIENTO_SIN_REVERSA('cheque_propio', pagosValores.id)))
    .limit(limite))
    await revertir('cheque_propio', v.id, `Débito del cheque ${v.numeroValor ?? ''} (orden de pago ${numero})`, null)

  // ------------------------------------------------------------ Tesorería
  const grupo = sql`coalesce(${movimientosTesoreria.transferenciaId}, ${movimientosTesoreria.id})`
  const movs = await tx
    .select()
    .from(movimientosTesoreria)
    .where(
      and(
        eq(movimientosTesoreria.estado, 'vigente'),
        gte(movimientosTesoreria.fecha, desde),
        lte(movimientosTesoreria.fecha, hasta),
        SIN_ASIENTO('tesoreria', grupo),
      ),
    )
    .orderBy(asc(movimientosTesoreria.fecha))
    .limit(limite)
  // Las transferencias completas, aunque el límite haya cortado alguna pata.
  const transferencias = [...new Set(movs.map((m) => m.transferenciaId).filter((x): x is string => !!x))]
  const patas = transferencias.length
    ? await tx
        .select()
        .from(movimientosTesoreria)
        .where(and(eq(movimientosTesoreria.estado, 'vigente'), inArray(movimientosTesoreria.transferenciaId, transferencias)))
    : []
  const grupos = new Map<string, typeof movs>()
  for (const m of [...movs.filter((x) => !x.transferenciaId), ...patas])
    grupos.set(m.transferenciaId ?? m.id, [...(grupos.get(m.transferenciaId ?? m.id) ?? []), m])
  const extranjeras = new Set(
    (await tx.select({ id: cuentasTesoreria.id }).from(cuentasTesoreria).where(ne(cuentasTesoreria.moneda, 'PES'))).map(
      (c) => c.id,
    ),
  )
  for (const [id, lista] of grupos) {
    const primero = lista[0]
    if (lista.some((m) => extranjeras.has(m.cuentaId))) {
      // Sin cotización en el movimiento no hay importe en pesos: lo asienta el contador.
      r.errores.push({
        origen: 'tesoreria',
        id,
        descripcion: `${primero.concepto ?? primero.tipo} (${primero.fecha})`,
        error: 'Es de una cuenta en moneda extranjera: hacé el asiento a mano con la cotización del día.',
      })
      continue
    }
    const desc =
      lista.length > 1
        ? primero.tipo === 'acreditacion'
          ? `Acreditación: ${primero.concepto ?? ''}`
          : `Transferencia: ${primero.detalle ?? primero.concepto ?? ''}`
        : `${primero.concepto ?? primero.tipo}${primero.detalle ? ` · ${primero.detalle}` : ''}`
    await asentar('tesoreria', id, desc.trim(), primero.fecha, (p) => {
      for (const m of lista) {
        const importe = n(m.importe)
        const caja = `tesoreria:${m.cuentaId}`
        if (importe > 0) p.debe(caja, importe, m.detalle)
        else p.haber(caja, -importe, m.detalle)
        // En una transferencia o acreditación las patas se compensan entre sí; lo demás, contra su contrapartida.
        if (lista.length > 1 && m.tipo !== 'comision') continue
        const contra =
          m.tipo === 'saldo_inicial'
            ? 'saldos_iniciales'
            : m.tipo === 'deposito_cheque'
              ? 'valores_a_depositar'
              : m.tipo === 'rechazo_cheque'
                ? 'cheques_rechazados'
                : m.tipo === 'comision'
                  ? 'gastos_bancarios'
                  : m.tipo === 'ajuste_arqueo'
                    ? importe > 0
                      ? 'sobrantes'
                      : 'faltantes'
                    : m.concepto && mapa.has(`concepto:${m.concepto.toLowerCase()}`)
                      ? `concepto:${m.concepto.toLowerCase()}`
                      : importe > 0
                        ? 'otros_ingresos'
                        : 'gastos_a_imputar'
        if (importe > 0) p.haber(contra, importe, m.concepto)
        else p.debe(contra, -importe, m.concepto)
      }
      // Transferencia en la que llegó menos de lo que salió: la diferencia es comisión.
      if (lista.length > 1) {
        const dif = lista.filter((m) => m.tipo !== 'comision').reduce((s, m) => s + Math.round(n(m.importe) * 100), 0) / 100
        if (dif < 0) p.debe('gastos_bancarios', -dif, 'Diferencia de la transferencia')
        else if (dif > 0) p.haber('otros_ingresos', dif, 'Diferencia de la transferencia')
      }
    })
  }
  for (const m of await tx
    .selectDistinctOn([grupo], { id: grupo, anulado: movimientosTesoreria.anulado, concepto: movimientosTesoreria.concepto })
    .from(movimientosTesoreria)
    .where(and(eq(movimientosTesoreria.estado, 'anulado'), CON_ASIENTO_SIN_REVERSA('tesoreria', grupo)))
    .limit(limite))
    await revertir('tesoreria', String(m.id), m.concepto ?? 'Movimiento de tesorería', m.anulado)

  // ------------------------------------------------------------ Cheques de terceros rechazados que estaban en cartera
  const rechazadosEnCartera = await tx
    .select({
      cr: chequesRechazados,
      importe: recibosValores.importe,
      numero: recibosValores.numeroValor,
      banco: recibosValores.banco,
    })
    .from(chequesRechazados)
    .innerJoin(recibosValores, eq(recibosValores.id, chequesRechazados.chequeId))
    .where(
      and(
        gte(chequesRechazados.fecha, desde),
        lte(chequesRechazados.fecha, hasta),
        SIN_ASIENTO('cheque_rechazado', chequesRechazados.id),
        // Depositado: lo hace el movimiento del banco. Entregado a un proveedor: lo hace su nota de débito.
        sql`not exists (select 1 from movimientos_tesoreria m where m.cheque_id = ${chequesRechazados.chequeId} and m.tipo = 'rechazo_cheque')`,
        sql`not exists (select 1 from pagos_valores pv join pagos pg on pg.id = pv.pago_id where pv.recibo_valor_id = ${chequesRechazados.chequeId} and pg.estado = 'emitido')`,
      ),
    )
    .limit(limite)
  for (const { cr, importe, numero, banco } of rechazadosEnCartera)
    await asentar(
      'cheque_rechazado',
      cr.id,
      `Cheque ${banco ?? ''} ${numero ?? ''} rechazado (estaba en cartera)`.replace(/\s+/g, ' '),
      cr.fecha,
      (p) => {
        p.debe('cheques_rechazados', n(importe))
        p.haber('valores_a_depositar', n(importe))
      },
    )

  return r
}

/** Cuántas operaciones esperan asiento (para avisar en la pantalla). */
export async function pendientesDeContabilizar(tx: Transaccion, hasta = hoyArgentina()) {
  const config = await configuracionContableDe(tx)
  if (!config) return null
  const desde = config.inicio
  const contar = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0
  const [ventas, comprasN, cobranzas, pagosN] = await Promise.all([
    contar(
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(comprobantes)
        .where(
          and(
            eq(comprobantes.estado, 'autorizado'),
            ne(comprobantes.origen, 'pymexis'),
            gte(comprobantes.fecha, desde),
            lte(comprobantes.fecha, hasta),
            SIN_ASIENTO('venta', comprobantes.id),
          ),
        ),
    ),
    contar(
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(compras)
        .where(
          and(
            eq(compras.estado, 'registrado'),
            ne(compras.origen, 'pymexis'),
            gte(compras.fecha, desde),
            lte(compras.fecha, hasta),
            SIN_ASIENTO('compra', compras.id),
          ),
        ),
    ),
    contar(
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(recibos)
        .where(
          and(
            eq(recibos.estado, 'emitido'),
            gte(recibos.fecha, desde),
            lte(recibos.fecha, hasta),
            SIN_ASIENTO('cobranza', recibos.id),
          ),
        ),
    ),
    contar(
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(pagos)
        .where(and(eq(pagos.estado, 'emitido'), gte(pagos.fecha, desde), lte(pagos.fecha, hasta), SIN_ASIENTO('pago', pagos.id))),
    ),
  ])
  return { ventas, compras: comprasN, cobranzas, pagos: pagosN, total: ventas + comprasN + cobranzas + pagosN }
}
