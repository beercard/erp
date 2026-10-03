import { eq } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import { cierresCaja, cuentasTesoreria } from '../../db/schema'
import { firmarEnlace } from '../../lib/enlaces'
import { URL_SITIO } from '../../lib/marca'
import { DocumentoPdf } from '../../lib/pdf'
import { correoConfigurado, encolarCorreo, enviarPendientes } from '../comunicaciones/correo'
import { empresaEmisora } from '../facturacion/comprobantes'
import { credencialesDe, enviarATelefono } from '../whatsapp/whatsapp'
import { type Cierre, obtenerCierre } from './cierres'

/**
 * Reporte del cierre (el "Z" de un punto de venta): un PDF con el turno, lo
 * cobrado por medio y por cajero, el efectivo esperado contra el contado y
 * los demás medios rendidos. Al cerrar la caja se manda por correo (con el
 * PDF) y por WhatsApp (un resumen con el enlace) a quienes se configuró.
 */

type Fetch = typeof fetch

const pesos = (v: string | number) =>
  Number(v).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).replace(/ /g, ' ')
const fechaHora = (d: Date | string) =>
  new Date(d).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })
const diferencia = (v: string) =>
  Number(v) === 0 ? 'Cuadró' : `${Number(v) > 0 ? 'Sobrante' : 'Faltante'} ${pesos(Math.abs(Number(v)))}`

/** Enlace público firmado al reporte (para WhatsApp). */
export const enlaceCierre = (empresaId: string, id: string) =>
  `${URL_SITIO}/cierre/${encodeURIComponent(firmarEnlace('cierre', empresaId, id, 90))}`

export async function datosReporte(tx: Transaccion, id: string) {
  const cierre = await obtenerCierre(tx, id)
  if (!cierre) return null
  const e = await empresaEmisora(tx)
  return { cierre, empresa: e?.nombreFantasia || e?.razonSocial || '' }
}

/** El PDF del cierre. */
export function pdfCierre(c: Cierre, empresa: string) {
  const d = new DocumentoPdf()
  const izq = 48
  const der = d.ancho - 48
  let y = 56
  const salto = (n = 16) => {
    y += n
    if (y > d.alto - 56) {
      d.nuevaPagina()
      y = 56
    }
  }
  const fila = (titulo: string, valor: string, o: { negrita?: boolean; nota?: string } = {}) => {
    d.texto(izq, y, titulo, { negrita: o.negrita })
    if (o.nota) d.texto(der - 130, y, o.nota, { derecha: true, gris: true, tam: 9 })
    d.texto(der, y, valor, { derecha: true, negrita: o.negrita })
    salto()
  }
  const seccion = (titulo: string) => {
    salto(8)
    d.texto(izq, y, titulo.toUpperCase(), { negrita: true, tam: 9, gris: true })
    salto(6)
    d.linea(izq, y, der)
    salto(14)
  }

  d.texto(izq, y, empresa, { tam: 9, gris: true })
  salto(22)
  d.texto(izq, y, `Cierre de caja · ${c.caja}`, { tam: 18, negrita: true })
  salto(20)
  d.texto(izq, y, `Del ${fechaHora(c.desde)} al ${fechaHora(c.hasta)}`, { gris: true })
  salto(14)
  d.texto(izq, y, `Cerró: ${c.usuario ?? '—'}${c.supervisor && c.supervisor !== c.usuario ? ` · aprobó: ${c.supervisor}` : ''}`, {
    gris: true,
  })
  salto(10)

  seccion('Efectivo')
  if (c.turno)
    fila('Fondo inicial contado', pesos(c.turno.fondoContado), { nota: c.turno.abrio ? `abrió ${c.turno.abrio}` : undefined })
  fila('Saldo inicial', pesos(c.saldoInicial))
  fila('Entradas', pesos(c.ingresos))
  fila('Salidas', pesos(Number(c.egresos) ? -Number(c.egresos) : 0))
  fila('Esperado', pesos(c.esperado), { negrita: true })
  fila('Contado', pesos(c.contado), { negrita: true })
  fila('Diferencia', diferencia(c.diferencia), { negrita: true })

  const r = c.resumen
  seccion('Cobranzas por medio')
  for (const m of r.porMedio) fila(m.nombre, pesos(m.total), { nota: `${m.recibos} ${m.recibos === 1 ? 'recibo' : 'recibos'}` })
  if (!r.porMedio.length) fila('Sin cobranzas', pesos(0))
  fila('Total cobrado', pesos(r.cobrado), { negrita: true, nota: `${r.recibos} recibos · promedio ${pesos(r.promedio)}` })
  if (r.anulados.cantidad) fila('Recibos anulados', pesos(r.anulados.total), { nota: String(r.anulados.cantidad) })

  if (c.medios?.length) {
    seccion('Otros medios rendidos')
    for (const m of c.medios) {
      fila(m.nombre, pesos(m.contado), {
        nota: Number(m.diferencia) === 0 ? 'cuadró' : `esperado ${pesos(m.esperado)} · ${diferencia(m.diferencia)}`,
      })
    }
  }

  if (r.porCajero.length) {
    seccion('Por cajero')
    for (const x of r.porCajero) fila(x.usuario, pesos(x.total), { nota: `${x.recibos} recibos` })
  }

  if (r.online.length) {
    seccion('Cobros online')
    for (const o of r.online) fila(o.proveedor, pesos(o.total), { nota: `${o.cantidad} pagos` })
  }

  seccion('Ventas facturadas')
  fila('Comprobantes autorizados', pesos(r.ventas.total), { nota: `${r.ventas.comprobantes} comprobantes` })

  if (r.otrosMovimientos.length) {
    seccion('Otros movimientos de la caja')
    for (const m of r.otrosMovimientos) fila(m.descripcion.slice(0, 70) || m.tipo, pesos(m.importe))
  }

  const conteo = Object.entries(c.conteo ?? {}).sort((a, b) => Number(b[0]) - Number(a[0]))
  if (conteo.length) {
    seccion('Conteo de billetes y monedas')
    for (const [b, n] of conteo) fila(`$ ${Number(b).toLocaleString('es-AR')} × ${n}`, pesos(Number(b) * n))
  }
  if (c.turno?.nota || c.observaciones) {
    seccion('Notas')
    if (c.turno?.nota) {
      d.texto(izq, y, `Apertura: ${c.turno.nota}`.slice(0, 110))
      salto()
    }
    if (c.observaciones) {
      d.texto(izq, y, `Cierre: ${c.observaciones}`.slice(0, 110))
      salto()
    }
  }
  return d.bytes()
}

/** Resumen corto para WhatsApp. */
export function textoCierre(c: Cierre, empresa: string, enlace: string) {
  const medios = c.resumen.porMedio.map((m) => `• ${m.nombre}: ${pesos(m.total)}`).join('\n')
  const otros = (c.medios ?? []).filter((m) => Number(m.diferencia) !== 0)
  return [
    `Cierre de caja · ${c.caja}${empresa ? ` (${empresa})` : ''}`,
    `${fechaHora(c.desde)} a ${fechaHora(c.hasta)} · cerró ${c.usuario ?? '—'}`,
    '',
    `Cobrado: ${pesos(c.resumen.cobrado)} en ${c.resumen.recibos} recibos`,
    medios,
    '',
    `Efectivo esperado ${pesos(c.esperado)}, contado ${pesos(c.contado)}: ${diferencia(c.diferencia)}`,
    ...otros.map((m) => `${m.nombre}: ${diferencia(m.diferencia)}`),
    '',
    `Reporte completo: ${enlace}`,
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')
}

/**
 * Manda el reporte a los destinatarios de la caja. Se llama después de
 * cerrar, fuera de la transacción del cierre; lo que pasó queda en el cierre.
 */
export async function enviarReporteCierre(empresaId: string, id: string, f: Fetch = fetch) {
  const datos = await conEmpresa(empresaId, async (tx) => {
    const r = await datosReporte(tx, id)
    if (!r) return null
    const [caja] = await tx
      .select({ aviso: cuentasTesoreria.avisoCierre })
      .from(cuentasTesoreria)
      .where(eq(cuentasTesoreria.id, r.cierre.cuentaId))
    const aviso = caja?.aviso
    if (!aviso || (!aviso.correos.length && !aviso.telefonos.length)) return null
    // Los correos se encolan acá (con el PDF) y salen enseguida si hay SMTP.
    const pdf = pdfCierre(r.cierre, r.empresa)
    const asunto = `Cierre de caja ${r.cierre.caja} · ${fechaHora(r.cierre.hasta)} · ${diferencia(r.cierre.diferencia)}`
    const texto = textoCierre(r.cierre, r.empresa, enlaceCierre(empresaId, id))
    for (const para of aviso.correos) {
      await encolarCorreo(tx, {
        para,
        asunto,
        texto,
        entidad: 'cierre_caja',
        entidadId: id,
        adjuntos: [
          {
            nombre: `cierre-${r.cierre.caja.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
            tipo: 'application/pdf',
            datos: pdf,
          },
        ],
      })
    }
    return { aviso, texto }
  })
  if (!datos) return []
  const envio: { destino: string; via: 'correo' | 'whatsapp'; ok: boolean; error?: string }[] = datos.aviso.correos.map(
    (destino) =>
      correoConfigurado()
        ? { destino, via: 'correo' as const, ok: true }
        : {
            destino,
            via: 'correo' as const,
            ok: false,
            error: 'Quedó en la bandeja de salida: falta configurar el correo saliente.',
          },
  )
  if (datos.aviso.correos.length) await enviarPendientes(empresaId).catch(() => undefined)
  const conWhatsapp = datos.aviso.telefonos.length > 0 && !!(await credencialesDe(empresaId))
  for (const tel of datos.aviso.telefonos) {
    if (!conWhatsapp) {
      envio.push({ destino: tel, via: 'whatsapp', ok: false, error: 'WhatsApp no está conectado.' })
      continue
    }
    const r = await enviarATelefono(empresaId, tel, datos.texto, { tipo: 'sistema' }, null, f).catch((e: Error) => ({
      ok: false as const,
      error: e.message,
    }))
    envio.push({ destino: tel, via: 'whatsapp', ok: r.ok, error: r.ok ? undefined : r.error })
  }
  await conEmpresa(empresaId, (tx) => tx.update(cierresCaja).set({ envio }).where(eq(cierresCaja.id, id)))
  return envio
}
