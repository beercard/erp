import { and, asc, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { Transaccion } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import {
  cierresCaja,
  cuentasTesoreria,
  facturasRecibidas,
  obligaciones,
  recibos,
  resumenDueno,
  vencimientos,
} from '../../db/schema'
import { D, aImporte, monto } from '../../lib/dinero'
import { hoyArgentina } from '../../lib/fechas'
import { faltantes } from '../comercial/reposicion'
import { emailValido, encolarCorreo } from '../comunicaciones/correo'
import { deudoresVencidos } from '../facturacion/cobranza'
import { empresaEmisora } from '../facturacion/comprobantes'
import { listarCheques } from '../tesoreria/cheques'
import { saldosCuentas } from '../tesoreria/cuentas'
import type { Fetch } from '../whatsapp/api'
import { enviarATelefono } from '../whatsapp/whatsapp'
import { resumenVentas } from './gestion'

/**
 * Resumen para el dueño: lo que pasó (ventas y cobranzas del día o de la
 * semana), cómo está (deuda vencida, saldos de caja y banco) y lo que hay que
 * mirar (stock bajo, cheques por vencer, cierres de caja con diferencia,
 * facturas recibidas sin registrar, vencimientos impositivos). Sale por correo
 * y por WhatsApp a los destinos configurados, desde la tarea periódica.
 */

const sumarDias = (f: string, n: number) =>
  new Date(new Date(`${f}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10)
const dma = (f: string) => f.split('-').reverse().join('/')
const pesos = (v: string | number) =>
  `$ ${Number(v).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
/** 1 = lunes … 7 = domingo. */
const diaDeSemana = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay() || 7

// --------------------------------------------------------------- Configuración

export async function configuracionResumen(tx: Transaccion) {
  const [c] = await tx.select().from(resumenDueno)
  return (
    c ?? {
      id: null,
      frecuencia: 'no' as const,
      diaSemana: 1,
      correos: [] as string[],
      telefonos: [] as string[],
      ultimoEnvio: null,
    }
  )
}

const lista = (v: unknown) =>
  String(v ?? '')
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean)

const esquema = z.object({
  frecuencia: z.enum(['no', 'diario', 'semanal']),
  diaSemana: z.coerce.number().int().min(1).max(7).default(1),
  correos: z.preprocess(lista, z.array(z.string().email('Hay un correo que no es válido.')).max(5)),
  telefonos: z.preprocess(
    lista,
    z.array(z.string().regex(/^\+?\d{10,15}$/, 'Los teléfonos van con código de área, sin espacios (ej. 5491155556666).')).max(3),
  ),
})

export async function guardarConfiguracionResumen(tx: Transaccion, empresaId: string, entrada: unknown) {
  const p = esquema.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message }
  const d = p.data
  if (d.frecuencia !== 'no' && !d.correos.length && !d.telefonos.length) {
    return { ok: false as const, error: 'Indicá al menos un correo o un teléfono.' }
  }
  await tx
    .insert(resumenDueno)
    .values({ empresaId, ...d })
    .onConflictDoUpdate({ target: resumenDueno.empresaId, set: { ...d, actualizado: new Date() } })
  return { ok: true as const }
}

// ---------------------------------------------------------------------- Datos

export type DatosResumen = Awaited<ReturnType<typeof datosResumen>>

export async function datosResumen(tx: Transaccion, desde: string, hasta: string) {
  const ventas = await resumenVentas(tx, { desde, hasta })
  const [cobrado] = await tx
    .select({ total: sql<string>`coalesce(sum(${recibos.total}), 0)::text`, recibos: sql<number>`count(*)::int` })
    .from(recibos)
    .where(and(eq(recibos.estado, 'emitido'), gte(recibos.fecha, desde), lte(recibos.fecha, hasta)))
  const deudores = await deudoresVencidos(tx, hasta)
  const deuda = deudores.reduce((s, d) => s.plus(d.vencido), new D(0))
  const cuentas = (await saldosCuentas(tx, hasta)).filter((c) => c.activa && c.moneda === 'PES')
  const saldo = (tipos: string[]) =>
    aImporte(cuentas.filter((c) => tipos.includes(c.tipo)).reduce((s, c) => s.plus(c.saldo), new D(0)))
  // Alertas
  const stockBajo = await faltantes(tx)
  const enSemana = sumarDias(hasta, 7)
  const cheques = (await listarCheques(tx, { estado: 'cartera' })).filter((c) => c.fechaPago && c.fechaPago <= enSemana)
  const diferencias = await tx
    .select({ cuenta: cuentasTesoreria.nombre, diferencia: cierresCaja.diferencia, hasta: cierresCaja.hasta })
    .from(cierresCaja)
    .innerJoin(cuentasTesoreria, eq(cuentasTesoreria.id, cierresCaja.cuentaId))
    .where(
      and(
        ne(cierresCaja.diferencia, '0'),
        sql`(${cierresCaja.hasta} at time zone 'America/Argentina/Buenos_Aires')::date between ${desde}::date and ${hasta}::date`,
      ),
    )
    .orderBy(asc(cierresCaja.hasta))
  const [recibidas] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(facturasRecibidas)
    .where(eq(facturasRecibidas.estado, 'lista'))
  const proximos = await tx
    .select({ nombre: obligaciones.nombre, fecha: vencimientos.fecha })
    .from(vencimientos)
    .innerJoin(obligaciones, eq(obligaciones.id, vencimientos.obligacionId))
    .where(and(isNull(vencimientos.cumplida), lte(vencimientos.fecha, enSemana), eq(obligaciones.activa, true)))
    .orderBy(asc(vencimientos.fecha))
    .limit(5)
  return {
    desde,
    hasta,
    ventas,
    cobrado: aImporte(monto(cobrado.total)),
    recibos: cobrado.recibos,
    deudaVencida: aImporte(deuda),
    deudores: deudores.length,
    mayoresDeudores: [...deudores].sort((a, b) => Number(b.vencido) - Number(a.vencido)).slice(0, 3),
    caja: saldo(['caja']),
    bancos: saldo(['banco', 'billetera']),
    stockBajo: stockBajo.length,
    cheques: { cantidad: cheques.length, total: aImporte(cheques.reduce((s, c) => s.plus(c.importe), new D(0))) },
    diferencias,
    recibidas: recibidas.n,
    vencimientos: proximos.map((v) => ({ ...v, vencido: v.fecha < hasta })),
  }
}

export function textoResumen(empresa: string, d: DatosResumen, semanal: boolean) {
  const periodo = semanal ? `semana del ${dma(d.desde)} al ${dma(d.hasta)}` : dma(d.hasta)
  const alertas = [
    ...d.vencimientos.map((v) => `• ${v.vencido ? 'Vencido' : 'Vence'} ${v.nombre} (${dma(v.fecha)})`),
    d.cheques.cantidad
      ? `• ${d.cheques.cantidad} cheque(s) en cartera para depositar esta semana: ${pesos(d.cheques.total)}`
      : '',
    ...d.diferencias.map((c) => `• Cierre de ${c.cuenta} con diferencia de ${pesos(c.diferencia)}`),
    d.stockBajo ? `• ${d.stockBajo} artículo(s) por debajo del stock mínimo` : '',
    d.recibidas ? `• ${d.recibidas} factura(s) de proveedores recibidas para registrar` : '',
  ].filter(Boolean)
  return [
    `Resumen de ${empresa} — ${periodo}`,
    '',
    `Ventas: ${pesos(d.ventas.neto)} netos de IVA (${d.ventas.facturas} factura(s), ${pesos(d.ventas.total)} con IVA)`,
    `Cobranzas: ${pesos(d.cobrado)} (${d.recibos} recibo(s))`,
    `Deuda vencida de clientes: ${pesos(d.deudaVencida)}${d.deudores ? ` (${d.deudores} cliente(s))` : ''}`,
    ...d.mayoresDeudores.map((x) => `   - ${x.nombre}: ${pesos(x.vencido)}, ${x.masViejo} días`),
    `Caja: ${pesos(d.caja)} · Bancos y billeteras: ${pesos(d.bancos)}`,
    '',
    alertas.length ? 'Para mirar:' : 'Sin alertas.',
    ...alertas,
  ].join('\n')
}

// ---------------------------------------------------------------------- Envío

/** ¿Toca mandarlo hoy? Diario: todos los días; semanal: el día elegido. Nunca dos veces el mismo día. */
export function tocaHoy(c: { frecuencia: string; diaSemana: number; ultimoEnvio: string | null }, hoy: string) {
  if (c.frecuencia === 'no' || (c.ultimoEnvio && c.ultimoEnvio >= hoy)) return false
  return c.frecuencia === 'diario' || diaDeSemana(hoy) === c.diaSemana
}

/**
 * Arma y manda el resumen si toca (o siempre, con forzar). El diario cuenta
 * el día anterior (sale a la mañana); el semanal, los siete días anteriores.
 */
export async function enviarResumenDueno(
  empresaId: string,
  o: { hoy?: string; forzar?: boolean; f?: Fetch } = {},
): Promise<{ enviados: number; errores: string[] }> {
  const hoy = o.hoy ?? hoyArgentina()
  const preparado = await conEmpresa(empresaId, async (tx) => {
    const c = await configuracionResumen(tx)
    if (!c.id || (!o.forzar && !tocaHoy(c, hoy))) return null
    const semanal = c.frecuencia === 'semanal'
    const hasta = sumarDias(hoy, -1)
    const desde = semanal ? sumarDias(hoy, -7) : hasta
    const emisora = await empresaEmisora(tx)
    const e = emisora?.nombreFantasia || emisora?.razonSocial || 'la empresa'
    const texto = textoResumen(e, await datosResumen(tx, desde, hasta), semanal)
    let enviados = 0
    for (const para of c.correos.filter(emailValido)) {
      if (
        await encolarCorreo(tx, {
          para,
          asunto: `Resumen ${semanal ? 'semanal' : 'del día'} de ${e}`,
          texto,
          entidad: 'resumen_dueno',
        })
      )
        enviados++
    }
    await tx.update(resumenDueno).set({ ultimoEnvio: hoy }).where(eq(resumenDueno.id, c.id))
    return { texto, telefonos: c.telefonos, enviados }
  })
  if (!preparado) return { enviados: 0, errores: [] }
  // WhatsApp, fuera de la transacción.
  const errores: string[] = []
  let enviados = preparado.enviados
  for (const tel of preparado.telefonos) {
    const r = await enviarATelefono(empresaId, tel, preparado.texto, { tipo: 'sistema' }, null, o.f)
    if (r.ok) enviados++
    else errores.push(`${tel}: ${r.error}`)
  }
  return { enviados, errores }
}
