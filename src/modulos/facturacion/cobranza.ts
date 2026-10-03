import { asc, eq, inArray, max, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import { cobranzaConfiguracion, interesesMora, recordatoriosDeuda, terceros } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { aImporte, D, monto } from '../../lib/dinero'
import { firmarEnlace } from '../../lib/enlaces'
import { hoyArgentina } from '../../lib/fechas'
import { URL_SITIO } from '../../lib/marca'
import { DocumentoPdf } from '../../lib/pdf'
import { formatearNumero } from '../comercial/formato'
import { filasDe } from '../compras/compras'
import { emailValido, encolarCorreo } from '../comunicaciones/correo'
import { credencialesDe, enviarATelefono } from '../whatsapp/whatsapp'
import { empresaEmisora, guardarComprobante } from './comprobantes'
import { abreviatura } from './tipos'

/**
 * Cobranza automática:
 * - Estado de deuda de un cliente (pantalla, PDF y enlace firmado), para
 *   mandar por correo o WhatsApp.
 * - Recordatorios escalonados: un aviso antes del vencimiento y recordatorios
 *   después (los últimos, como reclamo), una vuelta por día.
 * - Intereses por mora: interés simple diario sobre el saldo vencido; se
 *   pasan a notas de débito en borrador para revisar y autorizar.
 */

type Fetch = typeof fetch

const pesos = (v: string | number) =>
  Number(v).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).replace(/ /g, ' ')
const dma = (f: string) => f.split('-').reverse().join('/')
const dias = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000)
const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

// ------------------------------------------------------------- Configuración

export async function configuracionCobranza(tx: Transaccion) {
  const [c] = await tx.select().from(cobranzaConfiguracion)
  return (
    c ?? {
      recordatorios: false,
      diasAntes: 3,
      etapas: [1, 7, 15, 30],
      porCorreo: true,
      porWhatsapp: false,
      tasaMensual: null as string | null,
      diasGracia: 0,
      minimoInteres: '0',
      ultimoEnvio: null as string | null,
    }
  )
}

const EsquemaConfig = z.object({
  recordatorios: z.boolean(),
  diasAntes: z.coerce.number().int().min(0).max(30),
  etapas: z
    .array(z.coerce.number().int().min(1).max(365))
    .max(6)
    .transform((l) => [...new Set(l)].sort((a, b) => a - b)),
  porCorreo: z.boolean(),
  porWhatsapp: z.boolean(),
  tasaMensual: z
    .string()
    .trim()
    .transform((v) => (v ? v.replace(',', '.') : null))
    .pipe(
      z
        .string()
        .regex(/^\d{1,3}(\.\d{1,4})?$/, { error: 'La tasa va en % mensual (por ejemplo 4,5).' })
        .nullable(),
    ),
  diasGracia: z.coerce.number().int().min(0).max(90),
  minimoInteres: z
    .string()
    .trim()
    .transform((v) => (v ? v.replace(/\./g, '').replace(',', '.') : '0'))
    .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, { error: 'Mínimo inválido.' })),
})

export async function guardarConfiguracionCobranza(tx: Transaccion, usuarioId: string, entrada: unknown) {
  const p = EsquemaConfig.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message }
  await tx
    .insert(cobranzaConfiguracion)
    .values(p.data)
    .onConflictDoUpdate({ target: cobranzaConfiguracion.empresaId, set: { ...p.data, actualizado: new Date() } })
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'cobranza_configuracion', despues: p.data })
  return { ok: true as const }
}

// ------------------------------------------------------------- Deuda

export type RenglonDeuda = {
  id: string
  terceroId: string
  tipo: number
  puntoVenta: number
  numero: number
  fecha: string
  vence: string
  total: string
  saldo: string
  /** Días vencido (negativo: faltan días para vencer). */
  diasVencido: number
}

/** Facturas y notas de débito con saldo, con su vencimiento (el del comprobante o el de la condición de pago). */
export async function deudaPendiente(tx: Transaccion, hoy: string, terceroIds?: string[]): Promise<RenglonDeuda[]> {
  const filas = filasDe<Omit<RenglonDeuda, 'diasVencido'>>(
    await tx.execute(sql`
      select * from (
        select c.id, c.tercero_id as "terceroId", c.tipo, c.punto_venta as "puntoVenta", c.numero, c.fecha::text as fecha,
          coalesce(c.vencimiento, c.fecha + coalesce(cp.dias, 0))::text as vence,
          round(c.total * c.cotizacion, 2)::text as total,
          (round(c.total * c.cotizacion, 2) - coalesce((
            select sum(i.importe) from imputaciones i left join recibos r on r.id = i.recibo_id
            where i.comprobante_id = c.id and (i.recibo_id is null or r.estado = 'emitido')
          ), 0))::text as saldo
        from comprobantes c
        left join condiciones_pago cp on cp.id = c.condicion_pago_id
        where c.estado = 'autorizado' and c.clase in ('factura', 'nota_debito')
          ${terceroIds ? sql`and c.tercero_id in ${terceroIds.length ? terceroIds : ['00000000-0000-0000-0000-000000000000']}` : sql``}
      ) d
      where d.saldo::numeric > 0
      order by d.vence, d.numero
    `),
  )
  return filas.map((f) => ({ ...f, saldo: aImporte(f.saldo), total: aImporte(f.total), diasVencido: dias(f.vence, hoy) }))
}

export async function estadoDeuda(tx: Transaccion, terceroId: string, hoy = hoyArgentina()) {
  const [cliente] = await tx.select().from(terceros).where(eq(terceros.id, terceroId))
  if (!cliente) return null
  const renglones = await deudaPendiente(tx, hoy, [terceroId])
  const total = renglones.reduce((s, r) => s.plus(r.saldo), new D(0))
  const vencido = renglones.filter((r) => r.diasVencido > 0).reduce((s, r) => s.plus(r.saldo), new D(0))
  const e = await empresaEmisora(tx)
  return {
    empresa: e?.nombreFantasia || e?.razonSocial || '',
    cliente: { id: cliente.id, nombre: cliente.razonSocial, email: cliente.email, telefono: cliente.telefono },
    hoy,
    renglones,
    total: aImporte(total),
    vencido: aImporte(vencido),
    aVencer: aImporte(total.minus(vencido)),
  }
}

export type EstadoDeuda = NonNullable<Awaited<ReturnType<typeof estadoDeuda>>>

export const etiquetaComprobante = (r: { tipo: number; puntoVenta: number; numero: number }) =>
  `${abreviatura(r.tipo)} ${formatearNumero(r.puntoVenta, r.numero)}`

export const enlaceDeuda = (empresaId: string, terceroId: string) =>
  `${URL_SITIO}/deuda/${encodeURIComponent(firmarEnlace('deuda', empresaId, terceroId, 30))}`

export function pdfEstadoDeuda(e: EstadoDeuda) {
  const d = new DocumentoPdf()
  const izq = 48
  const der = d.ancho - 48
  let y = 56
  d.texto(izq, y, e.empresa, { tam: 9, gris: true })
  y += 22
  d.texto(izq, y, 'Estado de cuenta', { tam: 18, negrita: true })
  y += 20
  d.texto(izq, y, `${e.cliente.nombre} · al ${dma(e.hoy)}`, { gris: true })
  y += 26
  const cols = [izq, izq + 120, izq + 200, izq + 280]
  for (const [i, t] of ['Comprobante', 'Fecha', 'Vence', 'Estado'].entries()) d.texto(cols[i], y, t, { negrita: true, tam: 9 })
  d.texto(der - 90, y, 'Importe', { negrita: true, tam: 9, derecha: true })
  d.texto(der, y, 'Saldo', { negrita: true, tam: 9, derecha: true })
  y += 6
  d.linea(izq, y, der)
  y += 14
  for (const r of e.renglones) {
    if (y > d.alto - 80) {
      d.nuevaPagina()
      y = 56
    }
    d.texto(cols[0], y, etiquetaComprobante(r), { tam: 9 })
    d.texto(cols[1], y, dma(r.fecha), { tam: 9 })
    d.texto(cols[2], y, dma(r.vence), { tam: 9 })
    d.texto(
      cols[3],
      y,
      r.diasVencido > 0 ? `Vencida hace ${r.diasVencido} d` : r.diasVencido === 0 ? 'Vence hoy' : `Vence en ${-r.diasVencido} d`,
      {
        tam: 9,
        gris: r.diasVencido <= 0,
      },
    )
    d.texto(der - 90, y, pesos(r.total), { tam: 9, derecha: true })
    d.texto(der, y, pesos(r.saldo), { tam: 9, derecha: true })
    y += 15
  }
  y += 4
  d.linea(izq, y, der)
  y += 16
  for (const [t, v] of [
    ['Vencido', e.vencido],
    ['A vencer', e.aVencer],
    ['Total adeudado', e.total],
  ] as const) {
    d.texto(der - 120, y, t, { negrita: t === 'Total adeudado', derecha: true })
    d.texto(der, y, pesos(v), { negrita: t === 'Total adeudado', derecha: true })
    y += 16
  }
  return d.bytes()
}

/** Texto del recordatorio según la etapa: aviso, recordatorio o reclamo. */
export function textoRecordatorio(e: EstadoDeuda, etapa: number, enlace: string) {
  const vencidas = e.renglones.filter((r) => r.diasVencido > 0)
  const encabezado =
    etapa < 0
      ? `Hola, ${e.cliente.nombre}. Te recordamos que tenés comprobantes que vencen en los próximos días.`
      : etapa < 15
        ? `Hola, ${e.cliente.nombre}. Te recordamos que tenés comprobantes vencidos por ${pesos(e.vencido)}.`
        : `Hola, ${e.cliente.nombre}. Todavía figuran comprobantes vencidos por ${pesos(e.vencido)}. Te pedimos que regularices el pago o nos contactes para coordinarlo.`
  const lista = (etapa < 0 ? e.renglones.filter((r) => r.diasVencido <= 0) : vencidas)
    .slice(0, 10)
    .map((r) => `• ${etiquetaComprobante(r)} · vence ${dma(r.vence)} · ${pesos(r.saldo)}`)
  return [
    encabezado,
    '',
    ...lista,
    '',
    `Estado de cuenta completo: ${enlace}`,
    '',
    `Si ya pagaste, desestimá este mensaje. ${e.empresa}`,
  ].join('\n')
}

// ------------------------------------------------------------- Recordatorios

/** Etapa que le toca hoy a un comprobante (o null): el aviso previo o la última etapa alcanzada. */
export function etapaDe(diasVencido: number, diasAntes: number, etapas: number[]) {
  if (diasVencido < 0) return diasAntes > 0 && -diasVencido <= diasAntes ? -diasAntes : null
  const alcanzadas = etapas.filter((e) => diasVencido >= e)
  return alcanzadas.length ? Math.max(...alcanzadas) : null
}

/**
 * Una vuelta de recordatorios (una por día): por cliente, si algún
 * comprobante llegó a una etapa nueva, se manda el estado de deuda por los
 * medios configurados y se anotan las etapas para no repetir.
 */
export async function recordatoriosDelDia(empresaId: string, hoy = hoyArgentina(), f: Fetch = fetch) {
  const plan = await conEmpresa(empresaId, async (tx) => {
    const c = await configuracionCobranza(tx)
    if (!c.recordatorios || (c.ultimoEnvio && c.ultimoEnvio >= hoy)) return null
    await tx.update(cobranzaConfiguracion).set({ ultimoEnvio: hoy })
    const deuda = await deudaPendiente(tx, hoy)
    const enviados = deuda.length
      ? await tx
          .select({ comprobanteId: recordatoriosDeuda.comprobanteId, etapa: max(recordatoriosDeuda.etapa) })
          .from(recordatoriosDeuda)
          .where(
            inArray(
              recordatoriosDeuda.comprobanteId,
              deuda.map((d) => d.id),
            ),
          )
          .groupBy(recordatoriosDeuda.comprobanteId)
      : []
    const ultima = new Map(enviados.map((e) => [e.comprobanteId, e.etapa ?? -999]))
    const porCliente = new Map<string, { etapa: number; comprobantes: { id: string; etapa: number }[] }>()
    for (const r of deuda) {
      const etapa = etapaDe(r.diasVencido, c.diasAntes, c.etapas)
      if (etapa === null || (ultima.get(r.id) ?? -999) >= etapa) continue
      const x = porCliente.get(r.terceroId) ?? { etapa, comprobantes: [] }
      x.etapa = Math.max(x.etapa, etapa)
      x.comprobantes.push({ id: r.id, etapa })
      porCliente.set(r.terceroId, x)
    }
    const mensajes: {
      terceroId: string
      etapa: number
      comprobantes: { id: string; etapa: number }[]
      texto: string
      email: string | null
      telefono: string | null
    }[] = []
    for (const [terceroId, x] of porCliente) {
      const e = await estadoDeuda(tx, terceroId, hoy)
      if (!e) continue
      const texto = textoRecordatorio(e, x.etapa, enlaceDeuda(empresaId, terceroId))
      if (c.porCorreo && emailValido(e.cliente.email)) {
        await encolarCorreo(tx, {
          para: e.cliente.email!,
          asunto: x.etapa < 0 ? `${e.empresa}: vencimientos próximos` : `${e.empresa}: comprobantes vencidos`,
          texto,
          entidad: 'tercero',
          entidadId: terceroId,
          adjuntos: [{ nombre: 'estado-de-cuenta.pdf', tipo: 'application/pdf', datos: pdfEstadoDeuda(e) }],
        })
        for (const cp of x.comprobantes)
          await tx
            .insert(recordatoriosDeuda)
            .values({ comprobanteId: cp.id, etapa: cp.etapa, via: 'correo', destino: e.cliente.email })
            .onConflictDoNothing()
      }
      mensajes.push({
        terceroId,
        etapa: x.etapa,
        comprobantes: x.comprobantes,
        texto,
        email: e.cliente.email,
        telefono: e.cliente.telefono,
      })
    }
    return { config: c, mensajes }
  })
  if (!plan) return { clientes: 0, whatsapp: 0 }
  let whatsapp = 0
  if (plan.config.porWhatsapp && (await credencialesDe(empresaId))) {
    for (const m of plan.mensajes.filter((x) => x.telefono)) {
      const r = await enviarATelefono(empresaId, m.telefono!, m.texto, { tipo: 'sistema' }, m.terceroId, f).catch(() => ({
        ok: false,
      }))
      if (!r.ok) continue
      whatsapp++
      await conEmpresa(empresaId, async (tx) => {
        for (const cp of m.comprobantes)
          await tx
            .insert(recordatoriosDeuda)
            .values({ comprobanteId: cp.id, etapa: cp.etapa, via: 'whatsapp', destino: m.telefono })
            .onConflictDoNothing()
      })
    }
  }
  return { clientes: plan.mensajes.length, whatsapp }
}

/** Manda ahora el estado de deuda de un cliente (correo y/o WhatsApp). */
export async function enviarEstadoDeuda(
  empresaId: string,
  terceroId: string,
  via: { correo: boolean; whatsapp: boolean },
  f: Fetch = fetch,
) {
  const datos = await conEmpresa(empresaId, async (tx) => {
    const e = await estadoDeuda(tx, terceroId)
    if (!e) return null
    const enlace = enlaceDeuda(empresaId, terceroId)
    const texto = textoRecordatorio(e, e.vencido !== '0.00' ? 1 : -1, enlace)
    let correo = false
    if (via.correo && emailValido(e.cliente.email)) {
      await encolarCorreo(tx, {
        para: e.cliente.email!,
        asunto: `${e.empresa}: estado de cuenta`,
        texto,
        entidad: 'tercero',
        entidadId: terceroId,
        adjuntos: [{ nombre: 'estado-de-cuenta.pdf', tipo: 'application/pdf', datos: pdfEstadoDeuda(e) }],
      })
      correo = true
    }
    return { e, texto, correo }
  })
  if (!datos) return { ok: false as const, error: 'Ese cliente ya no existe.' }
  if (!datos.e.renglones.length) return { ok: false as const, error: 'El cliente no tiene deuda.' }
  let whatsapp: string | null = null
  if (via.whatsapp) {
    if (!datos.e.cliente.telefono) whatsapp = 'El cliente no tiene teléfono cargado.'
    else if (!(await credencialesDe(empresaId))) whatsapp = 'WhatsApp no está conectado.'
    else {
      const r = await enviarATelefono(empresaId, datos.e.cliente.telefono, datos.texto, { tipo: 'sistema' }, terceroId, f)
      whatsapp = r.ok ? null : r.error
    }
  }
  if (!datos.correo && (!via.whatsapp || whatsapp)) {
    return { ok: false as const, error: whatsapp ?? 'El cliente no tiene un correo válido.' }
  }
  return { ok: true as const, correo: datos.correo, whatsapp: via.whatsapp && !whatsapp, avisoWhatsapp: whatsapp }
}

// ------------------------------------------------------------- Intereses

export type InteresCalculado = {
  comprobanteId: string
  terceroId: string
  comprobante: string
  desde: string
  hasta: string
  dias: number
  saldo: string
  importe: string
}

/**
 * Intereses por mora hasta hoy: interés simple (tasa mensual / 30 por día)
 * sobre el saldo de cada comprobante vencido, desde el vencimiento más los
 * días de gracia o desde el día después del último interés cobrado.
 */
export async function calcularIntereses(tx: Transaccion, hoy = hoyArgentina()) {
  const c = await configuracionCobranza(tx)
  if (!c.tasaMensual || !Number(c.tasaMensual)) return { tasa: null, porCliente: [] }
  const deuda = (await deudaPendiente(tx, hoy)).filter((r) => r.diasVencido > c.diasGracia)
  const previos = deuda.length
    ? await tx
        .select({ comprobanteId: interesesMora.comprobanteId, hasta: max(interesesMora.hasta) })
        .from(interesesMora)
        .where(
          inArray(
            interesesMora.comprobanteId,
            deuda.map((d) => d.id),
          ),
        )
        .groupBy(interesesMora.comprobanteId)
    : []
  const ultimo = new Map(previos.map((p) => [p.comprobanteId, p.hasta]))
  const renglones: InteresCalculado[] = []
  for (const r of deuda) {
    const inicio = ultimo.get(r.id) ? sumarDias(ultimo.get(r.id)!, 1) : sumarDias(r.vence, c.diasGracia + 1)
    const n = dias(inicio, hoy) + 1
    if (n <= 0) continue
    const importe = monto(r.saldo).times(c.tasaMensual).div(100).div(30).times(n).toDecimalPlaces(2)
    if (importe.lte(0)) continue
    renglones.push({
      comprobanteId: r.id,
      terceroId: r.terceroId,
      comprobante: etiquetaComprobante(r),
      desde: inicio,
      hasta: hoy,
      dias: n,
      saldo: r.saldo,
      importe: aImporte(importe),
    })
  }
  const nombres = renglones.length
    ? new Map(
        (
          await tx
            .select({ id: terceros.id, nombre: terceros.razonSocial })
            .from(terceros)
            .where(inArray(terceros.id, [...new Set(renglones.map((r) => r.terceroId))]))
        ).map((t) => [t.id, t.nombre]),
      )
    : new Map<string, string>()
  const porCliente = [...new Set(renglones.map((r) => r.terceroId))]
    .map((terceroId) => {
      const items = renglones.filter((r) => r.terceroId === terceroId)
      return {
        terceroId,
        cliente: nombres.get(terceroId) ?? '',
        renglones: items,
        total: aImporte(items.reduce((s, r) => s.plus(r.importe), new D(0))),
      }
    })
    .filter((x) => monto(x.total).gte(c.minimoInteres))
    .sort((a, b) => a.cliente.localeCompare(b.cliente))
  return { tasa: c.tasaMensual, porCliente }
}

/**
 * Pasa los intereses a una nota de débito en borrador por cliente (asociada
 * a la factura más vieja), con un renglón por comprobante, y los anota para
 * que el próximo cálculo arranque al día siguiente. La nota se revisa y se
 * autoriza en ARCA como cualquier otra.
 */
export async function generarNotasDeInteres(
  tx: Transaccion,
  usuarioId: string,
  terceroIds: string[],
  puntoVenta: number,
  hoy = hoyArgentina(),
) {
  const { tasa, porCliente } = await calcularIntereses(tx, hoy)
  if (!tasa) return { ok: false as const, error: 'Configurá la tasa de interés por mora.' }
  const notas: string[] = []
  for (const cl of porCliente.filter((x) => terceroIds.includes(x.terceroId))) {
    const asociado = [...cl.renglones].sort((a, b) => a.desde.localeCompare(b.desde))[0]
    const r = await guardarComprobante(tx, usuarioId, {
      clase: 'nota_debito',
      puntoVenta,
      terceroId: cl.terceroId,
      fecha: hoy,
      moneda: 'PES',
      cotizacion: '1',
      concepto: 2,
      servicioDesde: cl.renglones.reduce((m, x) => (x.desde < m ? x.desde : m), hoy),
      servicioHasta: hoy,
      vencimiento: hoy,
      asociadoId: asociado.comprobanteId,
      observaciones: `Intereses por mora al ${String(Number(tasa)).replace('.', ',')} % mensual.`,
      items: cl.renglones.map((x) => ({
        descripcion: `Intereses por mora ${x.comprobante}: ${x.dias} días sobre ${pesos(x.saldo)} (del ${dma(x.desde)} al ${dma(x.hasta)})`,
        cantidad: '1',
        precioUnitario: x.importe,
        alicuotaIva: 5,
      })),
    })
    if (!r.ok) return { ok: false as const, error: `${cl.cliente}: ${r.error}` }
    await tx.insert(interesesMora).values(
      cl.renglones.map((x) => ({
        comprobanteId: x.comprobanteId,
        desde: x.desde,
        hasta: x.hasta,
        dias: x.dias,
        saldo: x.saldo,
        tasaMensual: tasa,
        importe: x.importe,
        notaDebitoId: r.id,
        usuarioId,
      })),
    )
    notas.push(r.id)
  }
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'intereses_mora', despues: { notas, terceroIds } })
  return { ok: true as const, notas }
}

/** Deudores con saldo vencido (para mandar el estado de deuda a todos). */
export async function deudoresVencidos(tx: Transaccion, hoy = hoyArgentina()) {
  const deuda = (await deudaPendiente(tx, hoy)).filter((r) => r.diasVencido > 0)
  const ids = [...new Set(deuda.map((d) => d.terceroId))]
  if (!ids.length) return []
  const ts = await tx
    .select({ id: terceros.id, nombre: terceros.razonSocial, email: terceros.email, telefono: terceros.telefono })
    .from(terceros)
    .where(inArray(terceros.id, ids))
    .orderBy(asc(terceros.razonSocial))
  return ts.map((t) => {
    const suyos = deuda.filter((d) => d.terceroId === t.id)
    return {
      ...t,
      vencido: aImporte(suyos.reduce((s, d) => s.plus(d.saldo), new D(0))),
      masViejo: Math.max(...suyos.map((d) => d.diasVencido)),
      comprobantes: suyos.length,
    }
  })
}
