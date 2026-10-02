import { and, eq } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { empresas, enviosContador, presentaciones } from '../../db/schema'
import { escribirXlsx } from '../../lib/xlsx'
import { escribirZip } from '../../lib/zip'
import { emailValido, encolarCorreo } from '../comunicaciones/correo'
import { controlesIva } from './controles'
import { archivoTxt, libroIva } from './libroIva'
import { hojasIibb, hojasRetenciones, hojasSubdiarios } from './planillas'
import { posicionIva } from './posicionIva'
import { lineasSicore, retencionesPracticadas } from './retenciones'
import { configuracion } from './vencimientos'

/**
 * Paquete del mes para el estudio contable: todo lo que pide el contador en
 * un .zip. Si el Libro IVA está presentado va el archivo exacto que se
 * presentó; si no, uno generado en el momento.
 */

const pesos = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
const periodoCorto = (p: string) => p.split('-').reverse().join('/')

export async function armarPaquete(tx: Transaccion, empresaId: string, periodo: string) {
  const [e] = await tx
    .select({ razonSocial: empresas.razonSocial, cuit: empresas.cuit })
    .from(empresas)
    .where(eq(empresas.id, empresaId))
  const [pos, controles, presentadas, retenciones] = await Promise.all([
    posicionIva(tx, periodo),
    controlesIva(tx, periodo),
    tx
      .select()
      .from(presentaciones)
      .where(and(eq(presentaciones.periodo, periodo), eq(presentaciones.estado, 'presentada'))),
    retencionesPracticadas(tx, periodo),
  ])
  const archivos: { nombre: string; datos: Uint8Array }[] = []
  const iva = presentadas.find((p) => p.impuesto === 'iva_digital')
  if (iva) archivos.push({ nombre: `presentado/${iva.nombreArchivo}`, datos: new Uint8Array(iva.archivo) })
  else
    for (const a of (await libroIva(tx, periodo)).archivos)
      archivos.push({ nombre: `libro-iva-digital/${a.nombre}`, datos: a.datos })
  const sicore = presentadas.find((p) => p.impuesto === 'sicore')
  if (sicore) archivos.push({ nombre: `presentado/${sicore.nombreArchivo}`, datos: new Uint8Array(sicore.archivo) })
  else if (retenciones.some((r) => r.impuesto === 'ganancias'))
    archivos.push({ nombre: `sicore-retenciones-${periodo}.txt`, datos: archivoTxt(lineasSicore(retenciones)) })
  archivos.push({ nombre: `subdiarios-iva-${periodo}.xlsx`, datos: escribirXlsx(await hojasSubdiarios(tx, periodo)) })
  archivos.push({ nombre: `iibb-${periodo}.xlsx`, datos: escribirXlsx(await hojasIibb(tx, periodo)) })
  archivos.push({ nombre: `retenciones-${periodo}.xlsx`, datos: escribirXlsx(await hojasRetenciones(tx, periodo)) })

  const errores = controles.filter((c) => c.gravedad === 'error')
  const resumen = [
    `${e?.razonSocial ?? ''} · CUIT ${e?.cuit ?? ''}`,
    `Período ${periodoCorto(periodo)}`,
    '',
    'POSICIÓN DE IVA',
    `  Débito fiscal ................ ${pesos(pos.debito)}`,
    `  Crédito fiscal ............... ${pesos(pos.credito)}`,
    `  Saldo técnico anterior ....... ${pesos(pos.anterior.tecnico)}`,
    `  ${pos.saldoTecnico >= 0 ? 'Impuesto determinado' : 'Saldo técnico a favor'} ......... ${pesos(Math.abs(pos.saldoTecnico))}`,
    `  Percepciones sufridas ........ ${pesos(pos.percepciones)}`,
    `  Retenciones sufridas ......... ${pesos(pos.retenciones)}`,
    `  Libre disponibilidad anterior  ${pesos(pos.anterior.libre)}`,
    `  A pagar ...................... ${pesos(pos.aPagar)}`,
    `  Pasa al mes siguiente: técnico ${pesos(pos.saldoTecnicoAFavor)}, libre disponibilidad ${pesos(pos.libreDisponibilidad)}`,
    '',
    `Ventas: ${pos.ventas.resumen.cantidad} comprobantes, total ${pesos(pos.ventas.resumen.total)}`,
    `Compras: ${pos.compras.resumen.cantidad} comprobantes, total ${pesos(pos.compras.resumen.total)}`,
    '',
    iva
      ? `Libro IVA presentado${iva.transaccion ? ` (transacción ${iva.transaccion})` : ''}.`
      : 'Libro IVA todavía NO presentado (el archivo es el generado hoy).',
    sicore ? `SICORE presentado${sicore.transaccion ? ` (transacción ${sicore.transaccion})` : ''}.` : '',
    '',
    controles.length
      ? `CONTROLES: ${errores.length} errores y ${controles.length - errores.length} avisos\n${controles.map((c) => `  [${c.gravedad}] ${c.comprobante}: ${c.problema}`).join('\n')}`
      : 'Controles: todo en orden.',
  ]
    .filter((x, i, l) => x !== '' || l[i - 1] !== '')
    .join('\r\n')
  archivos.unshift({ nombre: 'LEEME.txt', datos: new TextEncoder().encode(resumen) })
  return { zip: escribirZip(archivos), nombre: `paquete-contador-${periodo}.zip`, resumen, empresa: e?.razonSocial ?? '' }
}

/** Manda el paquete del mes al email del contador (adjunto). */
export async function enviarPaquete(tx: Transaccion, empresaId: string, usuarioId: string, periodo: string, automatico = false) {
  const cfg = await configuracion(tx)
  if (!emailValido(cfg.emailContador))
    return { ok: false as const, error: 'Cargá el email del contador en Impuestos › Vencimientos.' }
  const p = await armarPaquete(tx, empresaId, periodo)
  if (p.zip.length > 10 * 1024 * 1024)
    return { ok: false as const, error: 'El paquete es muy grande para mandarlo por email: bajalo y compartilo.' }
  const correoId = await encolarCorreo(tx, {
    para: cfg.emailContador,
    asunto: `${p.empresa}: impuestos de ${periodoCorto(periodo)}`,
    texto: `Hola:\n\nAdjunto el paquete de ${periodoCorto(periodo)}: Libro IVA Digital, subdiarios, Ingresos Brutos, retenciones y un resumen.\n\n${p.resumen}\n`,
    adjuntos: [{ nombre: p.nombre, tipo: 'application/zip', datos: p.zip }],
    entidad: 'paquete_contador',
    usuarioId,
  })
  await tx.insert(enviosContador).values({ periodo, para: cfg.emailContador, correoId, automatico, usuarioId })
  return { ok: true as const, para: cfg.emailContador }
}

export async function enviosDelPeriodo(tx: Transaccion, periodo: string) {
  return tx.select().from(enviosContador).where(eq(enviosContador.periodo, periodo))
}

/** Al presentar el Libro IVA: si está configurado, el paquete sale solo para el contador. */
export async function alPresentarIva(tx: Transaccion, empresaId: string, usuarioId: string, periodo: string) {
  const cfg = await configuracion(tx)
  if (!cfg.paqueteAlPresentar || !emailValido(cfg.emailContador)) return null
  return enviarPaquete(tx, empresaId, usuarioId, periodo, true)
}
