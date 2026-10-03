import { createHmac, timingSafeEqual } from 'node:crypto'

import { and, desc, eq, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import { empresas, equipos, modelosEquipo, ordenesServicio, posicionesTecnicos, tecnicos, tiposOrden } from '../../db/schema'
import { hoyArgentina } from '../../lib/fechas'
import { distanciaKm, minutosDeViaje, punto, puntoDeOrden } from './mapa'

/**
 * Enlace público de seguimiento de una orden (como el "tracking link" de
 * Persat): el cliente ve, sin usuario, en qué paso está su pedido, cuándo va
 * el técnico y, el día de la visita, a qué distancia está y cuánto tarda.
 * No se muestra dónde está el técnico: solo la distancia y el tiempo
 * estimados, y solo mientras viaja a esa visita.
 *
 * El enlace se deriva del id de la orden con la clave maestra del servidor:
 * es siempre el mismo, no se guarda nada y no se puede adivinar.
 */

/** Cómo ve el cliente cada estado (en el portal y en el enlace de seguimiento). */
export const ESTADOS_PORTAL: Record<string, string> = {
  pendiente: 'Recibida',
  proyectada: 'Recibida',
  asignada: 'Visita programada',
  vencida: 'Visita programada',
  informe: 'Trabajo realizado',
  cerrada_ok: 'Resuelta',
  cerrada_desvio: 'Resuelta',
  cerrada_no_cumplida: 'Cerrada sin resolver',
  cancelada: 'Cancelada',
}

/** Color del estado en el portal. */
export const tonoEstado = (estado: string): 'ok' | 'aviso' | 'neutro' =>
  estado === 'cerrada_ok' || estado === 'cerrada_desvio'
    ? 'ok'
    : estado === 'cancelada' || estado === 'cerrada_no_cumplida'
      ? 'neutro'
      : estado === 'asignada' || estado === 'vencida'
        ? 'aviso'
        : 'neutro'

/** Posiciones más viejas que esto no cuentan como "en camino". */
const FRESCURA_MINUTOS = 10

const firma = (ordenId: string) =>
  createHmac('sha256', process.env.ERP_CLAVE_MAESTRA ?? 'desarrollo-sin-clave-maestra')
    .update(`seguimiento:${ordenId}`)
    .digest('base64url')
    .slice(0, 24)

export const tokenSeguimiento = (empresaId: string, ordenId: string) => `${empresaId}.${ordenId}.${firma(ordenId)}`

export const enlaceSeguimiento = (base: string, empresaId: string, ordenId: string) =>
  `${base.replace(/\/$/, '')}/seguimiento/${tokenSeguimiento(empresaId, ordenId)}`

export function leerTokenSeguimiento(token: string) {
  const m = /^([0-9a-f-]{36})\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{24})$/i.exec(token)
  if (!m) return null
  const esperada = Buffer.from(firma(m[2]))
  const recibida = Buffer.from(m[3])
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null
  return { empresaId: m[1], ordenId: m[2] }
}

const hora = (d: Date | null) =>
  d ? d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) : null
const fechaCorta = (iso: string) => iso.split('-').reverse().join('/')

/** Lo que ve el cliente en el enlace. Null si el enlace no es válido. */
export async function seguimientoPublico(token: string, ahora = new Date()) {
  const t = leerTokenSeguimiento(token)
  if (!t) return null
  return conEmpresa(t.empresaId, (tx) => armarSeguimiento(tx, t.ordenId, ahora))
}

export async function armarSeguimiento(tx: Transaccion, ordenId: string, ahora = new Date()) {
  const [f] = await tx
    .select({
      o: ordenesServicio,
      tecnico: tecnicos.nombre,
      tipo: tiposOrden.nombre,
      serie: equipos.serie,
      modelo: modelosEquipo.nombre,
    })
    .from(ordenesServicio)
    .leftJoin(tecnicos, eq(tecnicos.id, ordenesServicio.tecnicoId))
    .leftJoin(tiposOrden, eq(tiposOrden.id, ordenesServicio.tipoOrdenId))
    .leftJoin(equipos, eq(equipos.id, ordenesServicio.equipoId))
    .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
    .where(eq(ordenesServicio.id, ordenId))
  if (!f) return null
  const [e] = await tx
    .select({ razonSocial: empresas.razonSocial, nombreFantasia: empresas.nombreFantasia })
    .from(empresas)
    .where(sql`${empresas.id} = nullif(current_setting('app.empresa_id', true), '')::uuid`)
  const o = f.o
  // Del técnico, el nombre de pila alcanza.
  const tecnico = f.tecnico ? f.tecnico.trim().split(/\s+/)[0] : null
  const cerrada = o.estado.startsWith('cerrada')

  // En camino: el día de la visita, sin llegada todavía y con una posición reciente del técnico.
  let enCamino: { km: number; minutos: number; actualizado: Date } | null = null
  if (o.estado === 'asignada' && o.tecnicoId && o.programada === hoyArgentina(ahora) && !o.llegada) {
    const [p] = await tx
      .select()
      .from(posicionesTecnicos)
      .where(
        and(
          eq(posicionesTecnicos.tecnicoId, o.tecnicoId),
          sql`${posicionesTecnicos.momento} > ${new Date(ahora.getTime() - FRESCURA_MINUTOS * 60_000)}`,
        ),
      )
      .orderBy(desc(posicionesTecnicos.momento))
      .limit(1)
    const destino = p ? await puntoDeOrden(tx, o.id) : null
    const desde = p ? punto(p.lat, p.lng) : null
    if (desde && destino) {
      const km = Math.round(distanciaKm(desde, destino) * 1.3 * 10) / 10
      enCamino = { km, minutos: minutosDeViaje(desde, destino), actualizado: p.momento }
    }
  }

  return {
    empresa: e?.nombreFantasia || e?.razonSocial || '',
    numero: o.numero,
    tipo: f.tipo,
    equipo: f.serie ? `${f.modelo ? `${f.modelo} · ` : ''}serie ${f.serie}` : null,
    domicilio: o.domicilio,
    estado: ESTADOS_PORTAL[o.estado] ?? o.estado,
    tono: tonoEstado(o.estado),
    cancelada: o.estado === 'cancelada',
    tecnico,
    enCamino,
    pasos: [
      { texto: 'Pedido recibido', cuando: hora(o.creado) ?? fechaCorta(o.fecha), hecho: true },
      {
        texto: 'Visita programada',
        cuando: o.programada
          ? `${fechaCorta(o.programada)}${o.hora ? ` ${o.hora.slice(0, 5)}` : ''}${tecnico ? ` · ${tecnico}` : ''}`
          : null,
        hecho: !!o.programada && !!o.tecnicoId,
      },
      { texto: 'Técnico en el lugar', cuando: hora(o.llegada), hecho: !!o.llegada },
      { texto: 'Trabajo realizado', cuando: hora(o.informada), hecho: !!o.informada },
      { texto: 'Cerrado', cuando: cerrada ? (ESTADOS_PORTAL[o.estado] ?? null) : null, hecho: cerrada },
    ],
    trabajo: cerrada || o.informada ? o.solucion : null,
  }
}
