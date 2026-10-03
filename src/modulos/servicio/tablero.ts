import { sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import { filasDe } from '../compras/compras'

/**
 * Indicadores del servicio técnico en un período (como el tablero gerencial
 * de Persat): cumplimiento, resolución en la primera visita, tiempos de
 * respuesta y resolución, SLA, coincidencia del cierre técnico/supervisor,
 * satisfacción (estrellas y NPS), por técnico y por tipo; además, lo que
 * Persat no tiene: equipos que reinciden y materiales consumidos.
 *
 * Fechas en Argentina (UTC−3): el día de un momento es (t − 3 h) en UTC.
 */

const dia = (columna: string) => sql.raw(`((${columna} at time zone 'UTC') - interval '3 hours')::date`)
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

export type Resumen = {
  creadas: number
  cerradas: number
  ok: number
  desvio: number
  noCumplida: number
  primeraVisita: number
  respuestaHoras: number | null
  resolucionHoras: number | null
  slaRespuesta: { cumplidas: number; total: number }
  slaResolucion: { cumplidas: number; total: number }
  coincidencia: { iguales: number; total: number }
  encuestas: { enviadas: number; respondidas: number; puntaje: number | null; promotores: number; detractores: number }
  activas: number
  vencidas: number
}

export async function indicadores(tx: Transaccion, desde: string, hasta: string) {
  const cerradaEn = sql`o.estado like 'cerrada%' and ${dia('o.cerrada')} between ${desde}::date and ${hasta}::date`
  const resueltaEn = sql.raw('coalesce(o.informada, o.cerrada)')

  const [r] = filasDe<Record<string, unknown>>(
    await tx.execute(sql`
      select
        (select count(*) from ordenes_servicio o where ${dia('o.creado')} between ${desde}::date and ${hasta}::date) as creadas,
        count(*) filter (where ${cerradaEn}) as cerradas,
        count(*) filter (where ${cerradaEn} and o.estado = 'cerrada_ok') as ok,
        count(*) filter (where ${cerradaEn} and o.estado = 'cerrada_desvio') as desvio,
        count(*) filter (where ${cerradaEn} and o.estado = 'cerrada_no_cumplida') as no_cumplida,
        count(*) filter (where ${cerradaEn} and o.estado = 'cerrada_ok'
          and (select count(*) from ordenes_servicio_visitas v where v.orden_id = o.id) <= 1) as primera_visita,
        avg(extract(epoch from o.llegada - o.creado) / 3600) filter (where ${cerradaEn} and o.llegada is not null) as respuesta,
        avg(extract(epoch from ${resueltaEn} - o.creado) / 3600) filter (where ${cerradaEn}) as resolucion,
        count(*) filter (where ${cerradaEn} and o.sla_respuesta is not null) as sla_resp_total,
        count(*) filter (where ${cerradaEn} and coalesce(o.llegada, ${resueltaEn}) <= o.sla_respuesta) as sla_resp_ok,
        count(*) filter (where ${cerradaEn} and o.sla_resolucion is not null) as sla_resol_total,
        count(*) filter (where ${cerradaEn} and ${resueltaEn} <= o.sla_resolucion) as sla_resol_ok,
        count(*) filter (where ${cerradaEn} and o.cierre_tecnico is not null) as coinc_total,
        count(*) filter (where ${cerradaEn} and 'cerrada_' || o.cierre_tecnico = o.estado) as coinc_ok,
        count(*) filter (where o.estado in ('pendiente', 'proyectada', 'asignada', 'vencida', 'informe')) as activas,
        count(*) filter (where o.estado = 'vencida') as vencidas
      from ordenes_servicio o`),
  )
  const [e] = filasDe<Record<string, unknown>>(
    await tx.execute(sql`
      select
        count(*) filter (where ${dia('e.creado')} between ${desde}::date and ${hasta}::date) as enviadas,
        count(*) filter (where ${dia('e.respondida')} between ${desde}::date and ${hasta}::date) as respondidas,
        avg(e.puntaje) filter (where ${dia('e.respondida')} between ${desde}::date and ${hasta}::date) as puntaje,
        count(*) filter (where ${dia('e.respondida')} between ${desde}::date and ${hasta}::date and e.nps >= 9) as promotores,
        count(*) filter (where ${dia('e.respondida')} between ${desde}::date and ${hasta}::date and e.nps <= 6) as detractores
      from encuestas e`),
  )
  const resumen: Resumen = {
    creadas: Number(r.creadas),
    cerradas: Number(r.cerradas),
    ok: Number(r.ok),
    desvio: Number(r.desvio),
    noCumplida: Number(r.no_cumplida),
    primeraVisita: Number(r.primera_visita),
    respuestaHoras: num(r.respuesta),
    resolucionHoras: num(r.resolucion),
    slaRespuesta: { cumplidas: Number(r.sla_resp_ok), total: Number(r.sla_resp_total) },
    slaResolucion: { cumplidas: Number(r.sla_resol_ok), total: Number(r.sla_resol_total) },
    coincidencia: { iguales: Number(r.coinc_ok), total: Number(r.coinc_total) },
    encuestas: {
      enviadas: Number(e.enviadas),
      respondidas: Number(e.respondidas),
      puntaje: num(e.puntaje),
      promotores: Number(e.promotores),
      detractores: Number(e.detractores),
    },
    activas: Number(r.activas),
    vencidas: Number(r.vencidas),
  }

  const porTecnico = filasDe<Record<string, unknown>>(
    await tx.execute(sql`
      select t.id, t.nombre,
        count(o.id) filter (where ${cerradaEn}) as cerradas,
        count(o.id) filter (where ${cerradaEn} and o.estado = 'cerrada_ok') as ok,
        count(o.id) filter (where ${cerradaEn} and o.estado = 'cerrada_desvio') as desvio,
        count(o.id) filter (where ${cerradaEn} and o.estado = 'cerrada_no_cumplida') as no_cumplida,
        count(o.id) filter (where ${cerradaEn} and o.estado = 'cerrada_ok'
          and (select count(*) from ordenes_servicio_visitas v where v.orden_id = o.id) <= 1) as primera_visita,
        avg(extract(epoch from o.llegada - o.creado) / 3600) filter (where ${cerradaEn} and o.llegada is not null) as respuesta,
        count(o.id) filter (where ${cerradaEn} and o.cierre_tecnico is not null) as coinc_total,
        count(o.id) filter (where ${cerradaEn} and 'cerrada_' || o.cierre_tecnico = o.estado) as coinc_ok,
        count(o.id) filter (where o.estado in ('asignada', 'vencida')) as pendientes,
        (select coalesce(sum(v.horas), 0) from ordenes_servicio_visitas v
          where v.tecnico_id = t.id and v.fecha between ${desde}::date and ${hasta}::date) as horas,
        (select avg(e.puntaje) from encuestas e join ordenes_servicio x on x.id = e.orden_id
          where x.tecnico_id = t.id and ${dia('e.respondida')} between ${desde}::date and ${hasta}::date) as puntaje
      from tecnicos t
      left join ordenes_servicio o on o.tecnico_id = t.id
      where t.activo
      group by t.id, t.nombre
      order by t.nombre`),
  ).map((x) => ({
    id: String(x.id),
    nombre: String(x.nombre),
    cerradas: Number(x.cerradas),
    ok: Number(x.ok),
    desvio: Number(x.desvio),
    noCumplida: Number(x.no_cumplida),
    primeraVisita: Number(x.primera_visita),
    respuestaHoras: num(x.respuesta),
    coincidencia: { iguales: Number(x.coinc_ok), total: Number(x.coinc_total) },
    pendientes: Number(x.pendientes),
    horas: Number(x.horas),
    puntaje: num(x.puntaje),
  }))

  const porTipo = filasDe<Record<string, unknown>>(
    await tx.execute(sql`
      select coalesce(t.nombre, o.tipo) as tipo, t.color,
        count(*) as cerradas,
        count(*) filter (where o.estado = 'cerrada_ok') as ok,
        avg(o.duracion) as estimada,
        avg(extract(epoch from o.salida - o.llegada) / 60) filter (where o.llegada is not null and o.salida is not null) as real
      from ordenes_servicio o
      left join tipos_orden t on t.id = o.tipo_orden_id
      where ${cerradaEn}
      group by 1, 2
      order by 3 desc`),
  ).map((x) => ({
    tipo: String(x.tipo),
    color: (x.color as string | null) ?? null,
    cerradas: Number(x.cerradas),
    ok: Number(x.ok),
    estimada: num(x.estimada),
    real: num(x.real),
  }))

  // Equipos con más de un correctivo en el período: los que reinciden.
  const reincidentes = filasDe<Record<string, unknown>>(
    await tx.execute(sql`
      select e.id, e.serie, m.nombre as modelo, c.razon_social as cliente, count(*) as correctivos
      from ordenes_servicio o
      join equipos e on e.id = o.equipo_id
      left join modelos_equipo m on m.id = e.modelo_id
      join terceros c on c.id = o.tercero_id
      where o.tipo = 'correctivo' and o.estado <> 'cancelada'
        and ${dia('o.creado')} between ${desde}::date and ${hasta}::date
      group by e.id, e.serie, m.nombre, c.razon_social
      having count(*) > 1
      order by 5 desc, 2
      limit 10`),
  ).map((x) => ({
    id: String(x.id),
    serie: String(x.serie),
    modelo: (x.modelo as string | null) ?? null,
    cliente: String(x.cliente),
    correctivos: Number(x.correctivos),
  }))

  const materiales = filasDe<Record<string, unknown>>(
    await tx.execute(sql`
      select i.descripcion, sum(i.cantidad) as cantidad, count(distinct i.orden_id) as ordenes
      from ordenes_servicio_items i
      join ordenes_servicio o on o.id = i.orden_id
      where i.articulo_id is not null and ${cerradaEn}
      group by i.descripcion
      order by 2 desc
      limit 10`),
  ).map((x) => ({ descripcion: String(x.descripcion), cantidad: Number(x.cantidad), ordenes: Number(x.ordenes) }))

  return { resumen, porTecnico, porTipo, reincidentes, materiales }
}

/** NPS: % de promotores (9 y 10) menos % de detractores (0 a 6). */
export const nps = (e: Resumen['encuestas']) =>
  e.respondidas ? Math.round(((e.promotores - e.detractores) / e.respondidas) * 100) : null
