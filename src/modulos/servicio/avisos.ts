import { createHash, createHmac, randomUUID } from 'node:crypto'

import { and, asc, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import {
  empresas,
  encuestas,
  equipos,
  modelosEquipo,
  ordenesServicio,
  ordenesServicioItems,
  recordatorios,
  tecnicos,
  terceros,
  tiposOrden,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { hoyArgentina } from '../../lib/fechas'
import { emailValido, encolarCorreo, enlaceWhatsapp } from '../comunicaciones/correo'
import { emitir } from '../integraciones/webhooks'
import { sumarDias } from './agenda'
import { obtenerConfiguracion } from './configuracion'
import { enlaceSeguimiento } from './seguimiento'
import { generarPreventivos } from './preventivo'
import { marcarVencidas } from './servicio'

/**
 * Avisos del servicio técnico: al cliente (visita programada, trabajo
 * terminado con encuesta de satisfacción), a la oficina (SLA por vencer) y
 * los recordatorios. Los emails salen por la bandeja de salida; cada aviso
 * trae además el enlace de WhatsApp con el mismo texto.
 */

/** Usuario con el que quedan auditadas las tareas automáticas. */
export const SISTEMA = '00000000-0000-0000-0000-000000000000'

/** "martes 6 de octubre". */
const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00Z`)
    .toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .replace(',', '')

async function datosAviso(tx: Transaccion, ordenId: string) {
  const [o] = await tx
    .select({
      o: ordenesServicio,
      cliente: terceros.razonSocial,
      emailCliente: terceros.email,
      telefonoCliente: terceros.telefono,
      serie: equipos.serie,
      modelo: modelosEquipo.nombre,
      tecnico: tecnicos.nombre,
      tipo: tiposOrden.nombre,
    })
    .from(ordenesServicio)
    .innerJoin(terceros, eq(terceros.id, ordenesServicio.terceroId))
    .leftJoin(equipos, eq(equipos.id, ordenesServicio.equipoId))
    .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
    .leftJoin(tecnicos, eq(tecnicos.id, ordenesServicio.tecnicoId))
    .leftJoin(tiposOrden, eq(tiposOrden.id, ordenesServicio.tipoOrdenId))
    .where(eq(ordenesServicio.id, ordenId))
  if (!o) return null
  const [empresa] = await tx
    .select({ id: empresas.id, razonSocial: empresas.razonSocial, nombreFantasia: empresas.nombreFantasia })
    .from(empresas)
    .where(sql`${empresas.id} = nullif(current_setting('app.empresa_id', true), '')::uuid`)
  const config = await obtenerConfiguracion(tx)
  return {
    ...o,
    empresaId: empresa?.id ?? null,
    empresa: empresa?.nombreFantasia || empresa?.razonSocial || '',
    config,
    para: o.o.email ?? o.emailCliente,
    telefono: o.o.telefono ?? o.telefonoCliente,
    equipo: o.serie ? `${o.modelo ? `${o.modelo} ` : ''}serie ${o.serie}` : null,
  }
}

const pie = (empresa: string, firma: string | null) => `\n\n${firma ?? empresa}`

export type Aviso = { texto: string; asunto: string; para: string | null; whatsapp: string; encolado: boolean }

/**
 * Aviso de visita programada: día, hora, técnico y el enlace para seguirla
 * (si se conoce la dirección pública del sistema: la del pedido o APP_URL).
 */
export async function avisarVisita(
  tx: Transaccion,
  usuarioId: string,
  ordenId: string,
  base: string | null = process.env.APP_URL ?? null,
): Promise<Aviso | { error: string }> {
  const d = await datosAviso(tx, ordenId)
  if (!d) return { error: 'Esa orden de servicio ya no existe.' }
  if (!d.o.programada) return { error: 'La orden todavía no tiene día de visita.' }
  const seguimiento = base && d.empresaId ? enlaceSeguimiento(base, d.empresaId, ordenId) : null
  const asunto = `Visita de servicio técnico · orden ${d.o.numero}`
  const texto =
    `Hola. Le confirmamos la visita de servicio técnico de ${d.empresa} ` +
    `para el ${fechaLarga(d.o.programada)}${d.o.hora ? ` a las ${d.o.hora}` : ''}` +
    `${d.tecnico ? `, a cargo de ${d.tecnico}` : ''}.\n` +
    `Orden N° ${d.o.numero}${d.equipo ? ` · ${d.equipo}` : ''}${d.o.domicilio ? `\nDomicilio: ${d.o.domicilio}` : ''}\n` +
    (seguimiento ? `El día de la visita puede ver cuándo llega el técnico en: ${seguimiento}\n` : '') +
    `Si necesita cambiar el día, responda este mensaje.` +
    pie(d.empresa, d.config.firma)
  const encolado = !!(await encolarCorreo(tx, {
    para: d.para ?? '',
    asunto,
    texto,
    entidad: 'orden_servicio',
    entidadId: ordenId,
    usuarioId,
  }))
  await tx.update(ordenesServicio).set({ avisoVisita: new Date() }).where(eq(ordenesServicio.id, ordenId))
  return { texto, asunto, para: d.para, whatsapp: enlaceWhatsapp(d.telefono, texto), encolado }
}

// ------------------------------------------------------------- Encuestas

const hash = (secreto: string) => createHash('sha256').update(secreto).digest('hex')

/**
 * Secreto del enlace de una encuesta: se deriva de su id con la clave maestra
 * del servidor, así el enlace es siempre el mismo (un email viejo sigue
 * sirviendo) y en la base solo queda su hash. El id es aleatorio y no se
 * publica: aun sin clave maestra (desarrollo) el enlace no se puede adivinar.
 */
const secretoDe = (encuestaId: string) =>
  createHmac('sha256', process.env.ERP_CLAVE_MAESTRA ?? 'desarrollo-sin-clave-maestra')
    .update(`encuesta:${encuestaId}`)
    .digest('base64url')

/** Crea (si no existe) la encuesta de una orden y devuelve el token de su enlace. Respondida: null. */
export async function crearEncuesta(tx: Transaccion, ordenId: string, empresaId: string) {
  const [ya] = await tx.select().from(encuestas).where(eq(encuestas.ordenId, ordenId))
  if (ya?.respondida) return null
  const id = ya?.id ?? randomUUID()
  const secreto = secretoDe(id)
  if (!ya) await tx.insert(encuestas).values({ id, ordenId, secretoHash: hash(secreto) })
  else if (ya.secretoHash !== hash(secreto))
    await tx
      .update(encuestas)
      .set({ secretoHash: hash(secreto) })
      .where(eq(encuestas.id, id))
  return `${empresaId}.${secreto}`
}

function leerToken(token: string) {
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{20,64})$/i.exec(token)
  return m ? { empresaId: m[1], secretoHash: hash(m[2]) } : null
}

/** Encuesta para la página pública (sin sesión): lo justo para mostrar de qué orden es. */
export async function encuestaPublica(token: string) {
  const t = leerToken(token)
  if (!t) return null
  return conEmpresa(t.empresaId, async (tx) => {
    const [e] = await tx.select().from(encuestas).where(eq(encuestas.secretoHash, t.secretoHash))
    if (!e) return null
    const d = await datosAviso(tx, e.ordenId)
    if (!d) return null
    return {
      empresa: d.empresa,
      numero: d.o.numero,
      fecha: d.o.fechaResolucion ?? d.o.fecha,
      tecnico: d.tecnico,
      equipo: d.equipo,
      trabajo: d.o.solucion,
      respondida: !!e.respondida,
    }
  })
}

export async function responderEncuesta(token: string, entrada: { puntaje: number; nps: number; comentario: string }) {
  const t = leerToken(token)
  if (!t) return { ok: false as const, error: 'El enlace no es válido.' }
  const puntaje = Math.round(Number(entrada.puntaje))
  const nps = Math.round(Number(entrada.nps))
  if (!(puntaje >= 1 && puntaje <= 5)) return { ok: false as const, error: 'Elegí de 1 a 5 estrellas.' }
  if (!(nps >= 0 && nps <= 10)) return { ok: false as const, error: 'Elegí un número del 0 al 10.' }
  return conEmpresa(t.empresaId, async (tx) => {
    const [e] = await tx.select().from(encuestas).where(eq(encuestas.secretoHash, t.secretoHash))
    if (!e) return { ok: false as const, error: 'El enlace no es válido.' }
    if (e.respondida) return { ok: false as const, error: 'Esta encuesta ya fue respondida. ¡Gracias!' }
    // Solo si sigue sin responder: dos envíos a la vez no se pisan ni avisan dos veces.
    const hechas = await tx
      .update(encuestas)
      .set({ puntaje, nps, comentario: entrada.comentario.trim().slice(0, 1000) || null, respondida: new Date() })
      .where(and(eq(encuestas.id, e.id), isNull(encuestas.respondida)))
      .returning({ id: encuestas.id })
    if (!hechas.length) return { ok: false as const, error: 'Esta encuesta ya fue respondida. ¡Gracias!' }
    const [o] = await tx.select({ numero: ordenesServicio.numero }).from(ordenesServicio).where(eq(ordenesServicio.id, e.ordenId))
    await emitir(tx, 'encuesta.respondida', {
      ordenId: e.ordenId,
      numero: o?.numero,
      puntaje,
      nps,
      comentario: entrada.comentario.trim().slice(0, 1000) || null,
    })
    return { ok: true as const }
  })
}

/**
 * Aviso de trabajo terminado: resumen de lo hecho y, si la empresa lo usa, el
 * enlace a la encuesta. Se llama al cerrar una orden OK o con desvío.
 */
export async function avisarCierre(
  tx: Transaccion,
  usuarioId: string,
  ordenId: string,
  o: { empresaId: string; base: string | null },
): Promise<Aviso | { error: string }> {
  const d = await datosAviso(tx, ordenId)
  if (!d) return { error: 'Esa orden de servicio ya no existe.' }
  const items = await tx
    .select({ descripcion: ordenesServicioItems.descripcion, cantidad: ordenesServicioItems.cantidad })
    .from(ordenesServicioItems)
    .where(eq(ordenesServicioItems.ordenId, ordenId))
    .orderBy(asc(ordenesServicioItems.creado))
  const token = d.config.encuesta && o.base ? await crearEncuesta(tx, ordenId, o.empresaId) : null
  const enlace = token ? `${o.base}/encuesta/${token}` : null
  const asunto = `Servicio técnico realizado · orden ${d.o.numero}`
  const texto =
    `Hola. Le contamos que terminamos el servicio técnico${d.equipo ? ` del equipo ${d.equipo}` : ''} (orden N° ${d.o.numero}).\n\n` +
    `Trabajo realizado: ${d.o.solucion ?? '—'}\n` +
    (items.length
      ? `Repuestos e insumos: ${items.map((i) => `${Number(i.cantidad).toLocaleString('es-AR')} × ${i.descripcion}`).join(', ')}\n`
      : '') +
    (d.o.contador !== null ? `Contador del equipo: ${d.o.contador.toLocaleString('es-AR')}\n` : '') +
    (d.o.estado === 'cerrada_desvio' && d.o.notaCierre ? `Pendiente: ${d.o.notaCierre}\n` : '') +
    (d.tecnico ? `Técnico: ${d.tecnico}\n` : '') +
    (enlace ? `\n¿Cómo lo atendimos? Nos ayuda mucho su opinión (un minuto): ${enlace}` : '') +
    pie(d.empresa, d.config.firma)
  const encolado = d.config.avisarCierre
    ? !!(await encolarCorreo(tx, { para: d.para ?? '', asunto, texto, entidad: 'orden_servicio', entidadId: ordenId, usuarioId }))
    : false
  return { texto, asunto, para: d.para, whatsapp: enlaceWhatsapp(d.telefono, texto), encolado }
}

// ------------------------------------------------------------ Poner al día

/**
 * Lo que el sistema hace solo, cada vez que alguien abre el servicio técnico
 * (y desde la tarea programada /api/cron/servicio): vencimientos, preventivos,
 * avisos de visita pendientes, alertas de SLA y recordatorios.
 */
export async function ponerAlDia(tx: Transaccion, usuarioId = SISTEMA, ahora = new Date()) {
  const hoy = hoyArgentina(ahora)
  const vencidas = await marcarVencidas(tx, ahora)
  const preventivos = await generarPreventivos(tx, usuarioId, 30, hoy)
  const config = await obtenerConfiguracion(tx)
  let avisos = 0

  // Aviso de visita: las asignadas para mañana o pasado que todavía no se avisaron.
  if (config.avisarVisita) {
    const proximas = await tx
      .select({ id: ordenesServicio.id })
      .from(ordenesServicio)
      .where(
        and(
          eq(ordenesServicio.estado, 'asignada'),
          isNull(ordenesServicio.avisoVisita),
          sql`${ordenesServicio.programada} between ${hoy}::date and ${sumarDias(hoy, 2)}::date`,
        ),
      )
    for (const p of proximas) {
      const r = await avisarVisita(tx, usuarioId, p.id)
      if ('encolado' in r && r.encolado) avisos++
    }
  }

  // Alerta de SLA a coordinación: una vez por orden, cuando la respuesta o la resolución vence en menos de 2 horas.
  if (emailValido(config.emailCoordinacion)) {
    const limite = new Date(ahora.getTime() + 2 * 3_600_000)
    const enRiesgo = await tx
      .select({
        id: ordenesServicio.id,
        numero: ordenesServicio.numero,
        cliente: terceros.razonSocial,
        slaRespuesta: ordenesServicio.slaRespuesta,
        slaResolucion: ordenesServicio.slaResolucion,
        llegada: ordenesServicio.llegada,
        tecnico: tecnicos.nombre,
      })
      .from(ordenesServicio)
      .innerJoin(terceros, eq(terceros.id, ordenesServicio.terceroId))
      .leftJoin(tecnicos, eq(tecnicos.id, ordenesServicio.tecnicoId))
      .where(
        and(
          inArray(ordenesServicio.estado, ['pendiente', 'proyectada', 'asignada', 'vencida']),
          isNull(ordenesServicio.alertaSla),
          or(
            and(
              isNull(ordenesServicio.llegada),
              isNotNull(ordenesServicio.slaRespuesta),
              lte(ordenesServicio.slaRespuesta, limite),
            ),
            and(isNotNull(ordenesServicio.slaResolucion), lte(ordenesServicio.slaResolucion, limite)),
          ),
        ),
      )
      .orderBy(asc(ordenesServicio.numero))
    if (enRiesgo.length) {
      const hora = (d: Date | null) =>
        d
          ? d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })
          : '—'
      await encolarCorreo(tx, {
        para: config.emailCoordinacion!,
        asunto: `SLA: ${enRiesgo.length} orden${enRiesgo.length > 1 ? 'es' : ''} por vencer o vencida${enRiesgo.length > 1 ? 's' : ''}`,
        texto:
          `Órdenes de servicio con el tiempo comprometido por vencer o vencido:\n\n` +
          enRiesgo
            .map(
              (r) =>
                `· N° ${r.numero} ${r.cliente} (${r.tecnico ?? 'sin técnico'}): ` +
                (!r.llegada && r.slaRespuesta ? `llegar antes de ${hora(r.slaRespuesta)}; ` : '') +
                `resolver antes de ${hora(r.slaResolucion)}`,
            )
            .join('\n'),
        entidad: 'alerta_sla',
        usuarioId,
      })
      await tx
        .update(ordenesServicio)
        .set({ alertaSla: ahora })
        .where(
          inArray(
            ordenesServicio.id,
            enRiesgo.map((r) => r.id),
          ),
        )
      avisos++
    }
  }

  // Recordatorios: el aviso sale `diasAntes` días antes de la fecha.
  const debidos = await tx
    .select({ r: recordatorios, cliente: terceros.razonSocial })
    .from(recordatorios)
    .innerJoin(terceros, eq(terceros.id, recordatorios.terceroId))
    .where(and(isNull(recordatorios.avisado), isNull(recordatorios.hecho), isNotNull(recordatorios.avisarA)))
  for (const { r, cliente } of debidos) {
    if (sumarDias(r.fecha, -r.diasAntes) > hoy) continue
    await encolarCorreo(tx, {
      para: r.avisarA!,
      asunto: `Recordatorio: ${r.titulo} · ${cliente}`,
      texto: `${r.titulo}\nCliente: ${cliente}\nFecha: ${fechaLarga(r.fecha)}${r.hora ? ` ${r.hora}` : ''}${r.detalle ? `\n\n${r.detalle}` : ''}`,
      entidad: 'recordatorio',
      entidadId: r.id,
      usuarioId,
    })
    await tx.update(recordatorios).set({ avisado: ahora }).where(eq(recordatorios.id, r.id))
    avisos++
  }

  if (avisos) await auditar(tx, { usuarioId, accion: 'emision', entidad: 'avisos_servicio', despues: { avisos } })
  return { vencidas, preventivos: preventivos.creadas, avisos }
}
