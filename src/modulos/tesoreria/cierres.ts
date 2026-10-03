import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { arqueos, cierresCaja, cuentasTesoreria, turnosCaja, usuarios } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { aImporte, D, monto } from '../../lib/dinero'
import { hoyArgentina } from '../../lib/fechas'
import { filasDe } from '../compras/compras'
import { decimal, primerError } from '../comercial/documentos'
import { MEDIOS } from '../facturacion/medios'
import { libro, saldoCuenta } from './cuentas'
import { arquear } from './movimientos'

/**
 * Cierre de caja (como el de un POS): para una caja, desde el cierre
 * anterior (o el comienzo del día) hasta ahora, cuánto se cobró y por qué
 * medio, quién cobró, qué entró y salió de la caja, cuánto efectivo debería
 * haber y cuánto se contó. La diferencia queda como arqueo con su ajuste.
 *
 * Una caja puede trabajar por turnos: se abre contando el fondo inicial, los
 * recibos que se cargan quedan en el turno y se cierra arqueando el efectivo
 * y los demás medios. Si la caja lo exige, sin turno abierto no se cobra ni
 * se paga en efectivo por ella. Con una diferencia máxima configurada, un
 * cierre que la supera lo tiene que hacer un supervisor.
 */

export { DENOMINACIONES } from './denominaciones'

/** Comienzo del día de hoy en Argentina. */
const comienzoDelDia = (ahora = new Date()) => new Date(`${hoyArgentina(ahora)}T00:00:00-03:00`)

/** Desde cuándo va el turno abierto de una caja: el último cierre o, si no hubo, el comienzo del día. */
export async function inicioTurno(tx: Transaccion, cuentaId: string, ahora = new Date()) {
  const [u] = await tx
    .select({ hasta: cierresCaja.hasta })
    .from(cierresCaja)
    .where(eq(cierresCaja.cuentaId, cuentaId))
    .orderBy(desc(cierresCaja.hasta))
    .limit(1)
  return u?.hasta ?? comienzoDelDia(ahora)
}

type Fila = { origen: string; id: string; importe: string; tipo: string; descripcion: string; creado: Date }

/** Resumen de un período para una caja. Las cobranzas son de toda la empresa; los movimientos, de la caja. */
export async function resumenTurno(
  tx: Transaccion,
  cuentaId: string,
  desde: Date,
  hasta: Date = new Date(),
  turno?: { id: string; ajusteApertura?: string | null },
) {
  // Movimientos de la caja: lo de antes del período es el saldo inicial.
  const movs = filasDe<Fila>(
    await tx.execute(
      sql`select l.origen, l.id, l.importe::text as importe, l.tipo, l.descripcion, l.creado from (${libro(cuentaId)}) l where l.creado < ${hasta.toISOString()}::timestamptz order by l.creado`,
    ),
  )
  // El ajuste del fondo al abrir el turno es parte del saldo inicial, no del turno.
  const previo = (m: Fila) => new Date(m.creado) < desde || (!!turno?.ajusteApertura && m.id === turno.ajusteApertura)
  const antes = movs.filter(previo)
  const periodo = movs.filter((m) => !previo(m))
  // Con turno, las cobranzas son las del turno; sin turno, las de toda la empresa en el período.
  const enPeriodo = (campo: 'creado' | 'anulado') =>
    turno
      ? sql`r.turno_id = ${turno.id}`
      : sql`r.${sql.raw(campo)} >= ${desde.toISOString()}::timestamptz and r.${sql.raw(campo)} < ${hasta.toISOString()}::timestamptz`
  const saldoInicial = antes.reduce((s, m) => s.plus(m.importe), new D(0))
  const ingresos = periodo.filter((m) => monto(m.importe).gt(0)).reduce((s, m) => s.plus(m.importe), new D(0))
  const egresos = periodo.filter((m) => monto(m.importe).lt(0)).reduce((s, m) => s.plus(m.importe), new D(0))

  // Cobranzas del período (recibos emitidos y anulados), por medio y por cajero.
  const valores = filasDe<{ medio: string; total: string; recibos: number }>(
    await tx.execute(sql`
      select rv.medio, sum(rv.importe)::text as total, count(distinct r.id)::int as recibos
      from recibos_valores rv join recibos r on r.id = rv.recibo_id
      where r.estado = 'emitido' and ${enPeriodo('creado')}
      group by rv.medio order by sum(rv.importe) desc`),
  )
  const cajeros = filasDe<{ usuario: string | null; total: string; recibos: number }>(
    await tx.execute(sql`
      select coalesce(u.nombre, 'Sistema (pagos online)') as usuario, sum(r.total)::text as total, count(*)::int as recibos
      from recibos r left join usuarios u on u.id = r.usuario_id
      where r.estado = 'emitido' and ${enPeriodo('creado')}
      group by 1 order by sum(r.total) desc`),
  )
  const [anulados] = filasDe<{ cantidad: number; total: string }>(
    await tx.execute(sql`
      select count(*)::int as cantidad, coalesce(sum(total), 0)::text as total from recibos r
      where r.estado = 'anulado' and ${enPeriodo('anulado')}`),
  )
  const online = filasDe<{ proveedor: string; cantidad: number; total: string }>(
    await tx.execute(sql`
      select coalesce(proveedor, 'otro') as proveedor, count(*)::int as cantidad, sum(importe)::text as total from pagos_online
      where estado = 'aprobado' and aprobado >= ${desde.toISOString()}::timestamptz and aprobado < ${hasta.toISOString()}::timestamptz
      group by 1`),
  )
  // Ventas facturadas en el período (facturas y notas de débito menos notas de crédito, en pesos).
  const [ventas] = filasDe<{ comprobantes: number; total: string }>(
    await tx.execute(sql`
      select count(*)::int as comprobantes,
        coalesce(sum(case when clase = 'nota_credito' then -1 else 1 end * round(total * cotizacion, 2)), 0)::text as total
      from comprobantes
      where estado = 'autorizado' and creado >= ${desde.toISOString()}::timestamptz and creado < ${hasta.toISOString()}::timestamptz`),
  )
  const cobrado = valores.reduce((s, v) => s.plus(v.total), new D(0))
  const recibos = cajeros.reduce((s, c) => s + c.recibos, 0)
  return {
    desde,
    hasta,
    saldoInicial: aImporte(saldoInicial),
    ingresos: aImporte(ingresos),
    egresos: aImporte(egresos.abs()),
    esperado: aImporte(saldoInicial.plus(ingresos).plus(egresos)),
    cobrado: aImporte(cobrado),
    recibos,
    promedio: recibos ? aImporte(cobrado.div(recibos)) : '0.00',
    porMedio: valores.map((v) => ({
      medio: v.medio,
      nombre: MEDIOS[v.medio as keyof typeof MEDIOS] ?? v.medio,
      total: aImporte(v.total),
      recibos: v.recibos,
    })),
    porCajero: cajeros.map((c) => ({ usuario: c.usuario ?? 'Sistema', total: aImporte(c.total), recibos: c.recibos })),
    anulados: { cantidad: anulados?.cantidad ?? 0, total: aImporte(anulados?.total ?? '0') },
    online: online.map((o) => ({ ...o, total: aImporte(o.total) })),
    ventas: { comprobantes: ventas?.comprobantes ?? 0, total: aImporte(ventas?.total ?? '0') },
    // Lo que no es una cobranza: retiros, gastos, depósitos, ajustes.
    otrosMovimientos: periodo
      .filter((m) => m.origen !== 'recibo_valor')
      .map((m) => ({
        descripcion: m.descripcion,
        tipo: m.tipo,
        importe: aImporte(m.importe),
        creado: new Date(m.creado).toISOString(),
      })),
  }
}

export type ResumenTurno = Awaited<ReturnType<typeof resumenTurno>>

const texto = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => v || null)

const conteoBilletes = z.record(z.string(), z.coerce.number().int().min(0).max(100_000)).optional()

async function caja(tx: Transaccion, cuentaId: string) {
  const [c] = await tx.select().from(cuentasTesoreria).where(eq(cuentasTesoreria.id, cuentaId))
  if (!c) return { ok: false as const, error: 'Esa caja ya no existe.' }
  if (c.tipo !== 'caja') return { ok: false as const, error: 'Los turnos y cierres se hacen sobre una caja (efectivo).' }
  return { ok: true as const, caja: c }
}

/** El turno abierto de una caja (o null). */
export async function turnoAbierto(tx: Transaccion, cuentaId: string) {
  const [t] = await tx
    .select()
    .from(turnosCaja)
    .where(and(eq(turnosCaja.cuentaId, cuentaId), eq(turnosCaja.estado, 'abierto')))
  return t ?? null
}

/** Turnos abiertos de varias cajas, o el que abrió una persona. */
export async function turnosAbiertos(tx: Transaccion, filtro: { cuentas?: string[]; usuarioId?: string }) {
  if (!filtro.cuentas?.length && !filtro.usuarioId) return []
  return tx
    .select()
    .from(turnosCaja)
    .where(
      and(
        eq(turnosCaja.estado, 'abierto'),
        filtro.cuentas?.length ? inArray(turnosCaja.cuentaId, filtro.cuentas) : undefined,
        filtro.usuarioId ? eq(turnosCaja.usuarioId, filtro.usuarioId) : undefined,
      ),
    )
}

/**
 * Turno al que va un recibo: el de la caja donde entró el efectivo o, si no
 * pasó por ninguna caja (transferencia, cheque), el que abrió quien cobra.
 */
export async function turnoDelRecibo(tx: Transaccion, cuentas: (string | null)[], usuarioId: string | null) {
  const ids = [...new Set(cuentas.filter((c): c is string => !!c))]
  const [porCaja] = await turnosAbiertos(tx, { cuentas: ids })
  if (porCaja) return porCaja.id
  if (!usuarioId) return null
  const [propio] = await turnosAbiertos(tx, { usuarioId })
  return propio?.id ?? null
}

const EsquemaApertura = z.object({
  cuentaId: z.uuid({ error: 'Elegí la caja.' }),
  contado: decimal('Escribí cuánto efectivo hay para empezar.'),
  conteo: conteoBilletes,
  nota: texto,
})

/**
 * Abre un turno: se cuenta el fondo con que arranca la caja. Si no coincide
 * con el saldo del sistema (lo que quedó del cierre anterior), queda un
 * arqueo con el ajuste y la nota.
 */
export async function abrirTurno(tx: Transaccion, usuarioId: string, entrada: unknown, ahora = new Date()) {
  const p = EsquemaApertura.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const d = p.data
  const r = await caja(tx, d.cuentaId)
  if (!r.ok) return r
  const c = r.caja
  if (!c.activa) return { ok: false as const, error: 'La caja está inactiva.' }
  await tx.execute(sql`select id from cuentas_tesoreria where id = ${c.id} for update`)
  if (await turnoAbierto(tx, c.id)) return { ok: false as const, error: 'La caja ya está abierta.' }
  const esperado = await saldoHoy(tx, c.id, ahora)
  const diferencia = monto(d.contado).minus(esperado)
  let arqueoAperturaId: string | null = null
  if (!diferencia.isZero()) {
    const a = await arquear(tx, usuarioId, {
      cuentaId: c.id,
      fecha: hoyArgentina(ahora),
      contado: aImporte(d.contado),
      observaciones: `Apertura de caja${d.nota ? `: ${d.nota}` : ''}`,
    })
    if (!a.ok) return a
    arqueoAperturaId = a.id
  }
  const [t] = await tx
    .insert(turnosCaja)
    .values({
      cuentaId: c.id,
      abierto: ahora,
      usuarioId,
      fondoEsperado: esperado,
      fondoContado: aImporte(d.contado),
      conteoApertura: d.conteo ?? null,
      arqueoAperturaId,
      nota: d.nota,
    })
    .returning()
  await auditar(tx, {
    usuarioId,
    accion: 'alta',
    entidad: 'turno_caja',
    entidadId: t.id,
    despues: { cuentaId: c.id, fondoEsperado: esperado, fondoContado: d.contado },
  })
  return { ok: true as const, id: t.id, diferencia: aImporte(diferencia) }
}

/** Movimiento de ajuste del arqueo de apertura (cuenta como saldo inicial del turno). */
async function ajusteApertura(tx: Transaccion, arqueoId: string | null) {
  if (!arqueoId) return null
  const [a] = await tx.select({ m: arqueos.movimientoAjusteId }).from(arqueos).where(eq(arqueos.id, arqueoId))
  return a?.m ?? null
}

/** Período y resumen del turno en curso de una caja (con turno abierto o desde el último cierre). */
export async function turnoEnCurso(tx: Transaccion, cuentaId: string, ahora = new Date()) {
  const turno = await turnoAbierto(tx, cuentaId)
  const desde = turno?.abierto ?? (await inicioTurno(tx, cuentaId, ahora))
  const resumen = await resumenTurno(
    tx,
    cuentaId,
    desde,
    ahora,
    turno ? { id: turno.id, ajusteApertura: await ajusteApertura(tx, turno.arqueoAperturaId) } : undefined,
  )
  return { turno, desde, resumen }
}

/** Medios que se arquean aparte del efectivo (lo que rinde el cajero: cupones, comprobantes, cheques). */
export const arqueables = (r: ResumenTurno) => r.porMedio.filter((m) => m.medio !== 'efectivo')

const EsquemaCierre = z.object({
  cuentaId: z.uuid({ error: 'Elegí la caja.' }),
  contado: decimal('Escribí cuánto efectivo contaste.'),
  conteo: conteoBilletes,
  /** Lo que rindió el cajero de cada medio que no es efectivo. Si falta, se toma lo esperado. */
  medios: z.record(z.string(), decimal('Importe inválido.')).optional(),
  observaciones: texto,
})

export type ResultadoCierre =
  { ok: true; id: string; diferencia: string } | { ok: false; error: string; requiereSupervisor?: boolean }

/**
 * Cierra el turno de la caja: guarda el resumen, lo contado (efectivo y
 * demás medios) y, si el efectivo no coincide, el arqueo con su ajuste.
 */
export async function cerrarCaja(
  tx: Transaccion,
  usuarioId: string,
  entrada: unknown,
  ahora = new Date(),
  opciones: { supervisor?: boolean } = {},
): Promise<ResultadoCierre> {
  const p = EsquemaCierre.safeParse(entrada)
  if (!p.success) return { ok: false, error: primerError(p.error) }
  const d = p.data
  const rc = await caja(tx, d.cuentaId)
  if (!rc.ok) return rc
  const c = rc.caja
  // Bloquea la caja mientras se cierra: dos cierres a la vez no pueden pisarse.
  await tx.execute(sql`select id from cuentas_tesoreria where id = ${c.id} for update`)
  const { turno, desde, resumen: r } = await turnoEnCurso(tx, c.id, ahora)
  if (c.exigeTurno && !turno) return { ok: false, error: 'La caja no está abierta: no hay turno para cerrar.' }
  const diferencia = monto(d.contado).minus(r.esperado)
  const medios = arqueables(r).map((m) => {
    const contado = d.medios?.[m.medio] ?? m.total
    return {
      medio: m.medio,
      nombre: m.nombre,
      esperado: m.total,
      contado: aImporte(contado),
      diferencia: aImporte(monto(contado).minus(m.total)),
    }
  })

  // Tope de diferencia: más que eso lo cierra un supervisor.
  const maxima = c.diferenciaMaxima != null ? monto(c.diferenciaMaxima) : null
  const pasada = maxima != null && (diferencia.abs().gt(maxima) || medios.some((m) => monto(m.diferencia).abs().gt(maxima)))
  if (pasada && !opciones.supervisor) {
    return {
      ok: false,
      requiereSupervisor: true,
      error: `La diferencia supera los $ ${aImporte(maxima)} permitidos: revisá el conteo o pedile a un supervisor que cierre la caja.`,
    }
  }

  let arqueoId: string | null = null
  if (!diferencia.isZero()) {
    const a = await arquear(tx, usuarioId, {
      cuentaId: c.id,
      fecha: hoyArgentina(ahora),
      contado: aImporte(monto(await saldoHoy(tx, c.id, ahora)).plus(diferencia)),
      observaciones: `Cierre de caja${d.observaciones ? `: ${d.observaciones}` : ''}`,
    })
    if (!a.ok) return a
    arqueoId = a.id
  }
  const [cierre] = await tx
    .insert(cierresCaja)
    .values({
      cuentaId: c.id,
      desde,
      hasta: ahora,
      saldoInicial: r.saldoInicial,
      ingresos: r.ingresos,
      egresos: r.egresos,
      esperado: r.esperado,
      contado: aImporte(d.contado),
      diferencia: aImporte(diferencia),
      conteo: d.conteo ?? null,
      resumen: JSON.parse(JSON.stringify(r)),
      arqueoId,
      observaciones: d.observaciones,
      usuarioId,
      turnoId: turno?.id ?? null,
      medios: medios.length ? medios : null,
      aprobadoPor: pasada ? usuarioId : null,
    })
    .returning()
  if (turno) {
    await tx.update(turnosCaja).set({ estado: 'cerrado', cierreId: cierre.id, cerrado: ahora }).where(eq(turnosCaja.id, turno.id))
  }
  await auditar(tx, {
    usuarioId,
    accion: 'alta',
    entidad: 'cierre_caja',
    entidadId: cierre.id,
    despues: { cuentaId: c.id, contado: d.contado, diferencia: aImporte(diferencia), medios, supervisor: pasada || undefined },
  })
  return { ok: true, id: cierre.id, diferencia: aImporte(diferencia) }
}

const EsquemaConfiguracion = z.object({
  exigeTurno: z.boolean(),
  diferenciaMaxima: decimal('Diferencia máxima inválida.')
    .nullable()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v : null)),
  correos: z
    .array(z.email({ error: 'Hay un correo inválido.' }))
    .max(10)
    .default([]),
  telefonos: z
    .array(z.string().transform((v) => v.replace(/\D/g, '')))
    .max(10)
    .default([])
    .refine((l) => l.every((t) => t.length >= 10 && t.length <= 15), { error: 'Hay un celular inválido (con código de área).' }),
})

/** Turnos obligatorios, diferencia máxima y a quién se manda el reporte de cada cierre. */
export async function configurarCaja(tx: Transaccion, usuarioId: string, cuentaId: string, entrada: unknown) {
  const p = EsquemaConfiguracion.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const r = await caja(tx, cuentaId)
  if (!r.ok) return r
  const d = p.data
  const aviso = d.correos.length || d.telefonos.length ? { correos: d.correos, telefonos: d.telefonos } : null
  await tx
    .update(cuentasTesoreria)
    .set({
      exigeTurno: d.exigeTurno,
      diferenciaMaxima: d.diferenciaMaxima ? aImporte(d.diferenciaMaxima) : null,
      avisoCierre: aviso,
    })
    .where(eq(cuentasTesoreria.id, cuentaId))
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'cuenta_tesoreria', entidadId: cuentaId, despues: d })
  return { ok: true as const }
}

/** Saldo de la caja a la fecha (el que compara el arqueo), para que el ajuste sea exactamente la diferencia del turno. */
const saldoHoy = (tx: Transaccion, cuentaId: string, ahora: Date) => saldoCuenta(tx, cuentaId, hoyArgentina(ahora))

export async function listarCierres(tx: Transaccion, filtro: { cuentaId?: string; desde?: Date } = {}) {
  return tx
    .select({
      id: cierresCaja.id,
      cuentaId: cierresCaja.cuentaId,
      caja: cuentasTesoreria.nombre,
      desde: cierresCaja.desde,
      hasta: cierresCaja.hasta,
      esperado: cierresCaja.esperado,
      contado: cierresCaja.contado,
      diferencia: cierresCaja.diferencia,
      usuario: usuarios.nombre,
      resumen: cierresCaja.resumen,
    })
    .from(cierresCaja)
    .innerJoin(cuentasTesoreria, eq(cuentasTesoreria.id, cierresCaja.cuentaId))
    .leftJoin(usuarios, eq(usuarios.id, cierresCaja.usuarioId))
    .where(
      and(
        filtro.cuentaId ? eq(cierresCaja.cuentaId, filtro.cuentaId) : undefined,
        filtro.desde ? gte(cierresCaja.hasta, filtro.desde) : undefined,
      ),
    )
    .orderBy(desc(cierresCaja.hasta))
    .limit(200)
}

export async function obtenerCierre(tx: Transaccion, id: string) {
  const [c] = await tx
    .select({ cierre: cierresCaja, caja: cuentasTesoreria.nombre, usuario: usuarios.nombre })
    .from(cierresCaja)
    .innerJoin(cuentasTesoreria, eq(cuentasTesoreria.id, cierresCaja.cuentaId))
    .leftJoin(usuarios, eq(usuarios.id, cierresCaja.usuarioId))
    .where(eq(cierresCaja.id, id))
  if (!c) return null
  const [turno] = c.cierre.turnoId
    ? await tx
        .select({
          abierto: turnosCaja.abierto,
          fondoEsperado: turnosCaja.fondoEsperado,
          fondoContado: turnosCaja.fondoContado,
          nota: turnosCaja.nota,
          abrio: usuarios.nombre,
        })
        .from(turnosCaja)
        .leftJoin(usuarios, eq(usuarios.id, turnosCaja.usuarioId))
        .where(eq(turnosCaja.id, c.cierre.turnoId))
    : []
  const [supervisor] = c.cierre.aprobadoPor
    ? await tx.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, c.cierre.aprobadoPor))
    : []
  return {
    ...c.cierre,
    caja: c.caja,
    usuario: c.usuario,
    resumen: c.cierre.resumen as unknown as ResumenTurno,
    turno: turno ?? null,
    supervisor: supervisor?.nombre ?? null,
  }
}

export type Cierre = NonNullable<Awaited<ReturnType<typeof obtenerCierre>>>

/** Las cajas (efectivo) activas de la empresa. */
export async function cajas(tx: Transaccion) {
  return tx
    .select({
      id: cuentasTesoreria.id,
      nombre: cuentasTesoreria.nombre,
      exigeTurno: cuentasTesoreria.exigeTurno,
      diferenciaMaxima: cuentasTesoreria.diferenciaMaxima,
      avisoCierre: cuentasTesoreria.avisoCierre,
    })
    .from(cuentasTesoreria)
    .where(and(eq(cuentasTesoreria.tipo, 'caja'), eq(cuentasTesoreria.activa, true)))
}
