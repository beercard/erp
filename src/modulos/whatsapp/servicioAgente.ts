import { and, desc, eq, sql } from 'drizzle-orm'

import { conEmpresa } from '../../db/empresa'
import { equipos, ordenesServicio, terceros } from '../../db/schema'
import { hoyArgentina } from '../../lib/fechas'
import { emailValido, encolarCorreo } from '../comunicaciones/correo'
import { buscarHuecos } from '../servicio/agenda'
import { obtenerConfiguracion } from '../servicio/configuracion'
import { guardarOrden, programarOrden } from '../servicio/servicio'

/**
 * Lo que el agente de WhatsApp puede hacer con el servicio técnico, siempre
 * para el cliente de la conversación: abrir un pedido de servicio (reclamo),
 * ofrecer turnos libres y reservar uno para una orden suya que esté abierta.
 */

/** Las órdenes que abre el agente quedan a nombre del sistema. */
export const USUARIO_AGENTE = '00000000-0000-0000-0000-000000000000'
const DURACION = 60
const dma = (f: string) => f.split('-').reverse().join('/')
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const diaDe = (f: string) => DIAS[new Date(`${f}T12:00:00-03:00`).getDay()]

/** Abre una orden de servicio con lo que contó el cliente. */
export async function abrirReclamo(
  empresaId: string,
  terceroId: string,
  d: { falla: string; equipo?: string | null; contacto?: string | null; telefono?: string | null },
) {
  return conEmpresa(empresaId, async (tx) => {
    const falla = d.falla.trim()
    if (falla.length < 5) return { ok: false as const, error: 'Falta que el cliente cuente qué pasa.' }
    const [cliente] = await tx.select().from(terceros).where(eq(terceros.id, terceroId))
    if (!cliente) return { ok: false as const, error: 'No se encontró el cliente.' }
    // El equipo por número de serie o descripción, solo entre los instalados en el cliente.
    const propios = await tx
      .select({ id: equipos.id, serie: equipos.serie })
      .from(equipos)
      .where(and(eq(equipos.terceroId, terceroId), eq(equipos.estado, 'instalado')))
    const buscado = d.equipo?.trim().toLowerCase()
    const equipo =
      (buscado &&
        propios.find(
          (e) => e.serie?.toLowerCase() === buscado || (buscado.length >= 4 && e.serie?.toLowerCase().includes(buscado)),
        )) ||
      (propios.length === 1 ? propios[0] : null)
    const r = await guardarOrden(tx, USUARIO_AGENTE, {
      fecha: hoyArgentina(),
      terceroId,
      equipoId: equipo?.id ?? null,
      falla: `${falla}${d.equipo && !equipo ? ` (equipo que indicó: ${d.equipo})` : ''}`.slice(0, 2000),
      contacto: d.contacto || null,
      telefono: d.telefono || null,
      email: emailValido(cliente.email) ? cliente.email : null,
      observaciones: 'Pedido por WhatsApp (agente de atención).',
      origen: 'whatsapp',
    })
    if (!r.ok) return { ok: false as const, error: r.error }
    const [o] = await tx.select({ numero: ordenesServicio.numero }).from(ordenesServicio).where(eq(ordenesServicio.id, r.id))
    const config = await obtenerConfiguracion(tx)
    if (emailValido(config.emailCoordinacion)) {
      await encolarCorreo(tx, {
        para: config.emailCoordinacion,
        asunto: `Pedido de servicio por WhatsApp: ${cliente.razonSocial}`,
        texto: `${cliente.razonSocial} pidió un servicio por WhatsApp.\n\nOrden N° ${o.numero}\n${falla}`,
        entidad: 'orden_servicio',
        entidadId: r.id,
      })
    }
    return { ok: true as const, id: r.id, numero: o.numero, equipo: equipo?.serie ?? null }
  })
}

/** Órdenes abiertas del cliente sin día de visita (las que se pueden agendar). */
async function abiertasSinTurno(empresaId: string, terceroId: string) {
  return conEmpresa(empresaId, (tx) =>
    tx
      .select({
        id: ordenesServicio.id,
        numero: ordenesServicio.numero,
        falla: ordenesServicio.falla,
        programada: ordenesServicio.programada,
      })
      .from(ordenesServicio)
      .where(
        and(
          eq(ordenesServicio.terceroId, terceroId),
          sql`${ordenesServicio.estado} in ('pendiente', 'proyectada', 'asignada', 'vencida')`,
        ),
      )
      .orderBy(desc(ordenesServicio.numero))
      .limit(5),
  )
}

/** Los próximos turnos libres (uno por día y hora, sin decir qué técnico). */
export async function turnosLibres(empresaId: string, ahora = new Date()) {
  const huecos = await conEmpresa(empresaId, (tx) => buscarHuecos(tx, { duracion: DURACION, dias: 10 }, ahora))
  const vistos = new Set<string>()
  return huecos
    .filter((h) => {
      const k = `${h.fecha} ${h.hora}`
      if (vistos.has(k)) return false
      vistos.add(k)
      return true
    })
    .sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`))
    .slice(0, 6)
}

export function textoTurnos(lista: { fecha: string; hora: string }[]) {
  return lista.map((h) => `- ${diaDe(h.fecha)} ${dma(h.fecha)} a las ${h.hora}`).join('\n')
}

/** Reserva un turno (día y hora de los ofrecidos) para una orden abierta del cliente. */
export async function reservarTurno(
  empresaId: string,
  terceroId: string,
  d: { orden?: number | null; fecha: string; hora: string },
  ahora = new Date(),
) {
  const ordenes = await abiertasSinTurno(empresaId, terceroId)
  const orden = d.orden ? ordenes.find((o) => o.numero === d.orden) : ordenes.length === 1 ? ordenes[0] : null
  if (!orden) {
    return {
      ok: false as const,
      error: ordenes.length
        ? `Indicá para qué orden es el turno: ${ordenes.map((o) => `N° ${o.numero} (${o.falla.slice(0, 40)})`).join(', ')}.`
        : 'El cliente no tiene órdenes de servicio abiertas: primero hay que abrir el pedido.',
    }
  }
  const hora = d.hora.replace(/^(\d):/, '0$1:').slice(0, 5)
  // Se vuelve a buscar: el turno tiene que seguir libre.
  const libre = (
    await conEmpresa(empresaId, (tx) => buscarHuecos(tx, { duracion: DURACION, dias: 10, excluirOrdenId: orden.id }, ahora))
  ).find((h) => h.fecha === d.fecha && h.hora === hora)
  if (!libre) return { ok: false as const, error: 'Ese turno ya no está libre: ofrecé los disponibles de nuevo.' }
  const r = await conEmpresa(empresaId, (tx) =>
    programarOrden(tx, USUARIO_AGENTE, orden.id, {
      tecnicoId: libre.tecnicoId,
      programada: libre.fecha,
      hora: libre.hora,
      duracion: DURACION,
    }),
  )
  if (!r.ok) return { ok: false as const, error: r.error }
  return {
    ok: true as const,
    numero: orden.numero,
    fecha: libre.fecha,
    hora: libre.hora,
    texto: `${diaDe(libre.fecha)} ${dma(libre.fecha)} a las ${libre.hora}`,
  }
}
