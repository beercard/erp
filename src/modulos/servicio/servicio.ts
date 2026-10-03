import { and, asc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import {
  archivosServicio,
  articulos,
  comprobantes,
  contratos,
  depositos,
  encuestas,
  equipos,
  listasPrecios,
  modelosEquipo,
  ordenesServicio,
  ordenesServicioItems,
  ordenesServicioVisitas,
  tecnicos,
  terceros,
  tiposOrden,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { monto } from '../../lib/dinero'
import { hoyArgentina } from '../../lib/fechas'
import { convertir, TASAS_IVA } from '../comercial/calculo'
import { decimal, opcionalUuid, primerError } from '../comercial/documentos'
import { siguienteNumero } from '../comercial/numeracion'
import { registrarMovimientos, saldoDe } from '../comercial/stock'
import { registrarLectura } from '../contratos/contratos'
import { guardarComprobante } from '../facturacion/comprobantes'
import { cotizacionVigente } from '../comercial/cotizacion'
import { correosDe } from '../comunicaciones/correo'
import { emitir } from '../integraciones/webhooks'
import { preciosVigentes } from '../maestros/articulos'
import { acompanantesDe, etiquetasDeOrdenes, ordenesComoAcompanante, ponerAcompanantes } from './etiquetas'
import { archivosDe, campoDe, validarValores, type Campo, type Lectura, type Material, type Valores } from './formularios'
import {
  ABIERTAS,
  cerradaEnPersat,
  CIERRES,
  COBERTURAS,
  coberturaSugerida,
  estaAbierta,
  estaCerrada,
  estaHecha,
  estadoPlanificado,
  limitesSla,
  seTrabaja,
  TIPOS_ORDEN,
  vencimiento,
} from './tipos'
import { obtenerConfiguracion } from './configuracion'
import { obtenerPlantilla, plantillaVigente } from './tiposOrden'

export { COBERTURAS, ESTADOS_ORDEN, TIPOS_ORDEN, coberturaSugerida, estaAbierta } from './tipos'

/**
 * Servicio técnico: órdenes sobre los equipos de los clientes, con sus
 * visitas, los insumos y repuestos usados (descuentan stock al cargarlos) y,
 * si van con cargo, la factura en borrador.
 *
 * Ciclo (como Persat): la oficina abre la orden con las instrucciones y la
 * programa (pendiente → proyectada → asignada); el técnico marca la llegada y
 * manda la devolución desde el celular (informe); el supervisor la revisa y
 * la cierra OK, con desvío o no cumplida. Si el técnico no informa dentro del
 * plazo del tipo, vence.
 */

const texto = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)
const fechaOpcional = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .pipe(z.iso.date({ error: 'Fecha inválida.' }).nullable())
const fecha = z.iso.date({ error: 'Fecha inválida.' })
const horaOpcional = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .pipe(
    z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Hora inválida.' })
      .nullable(),
  )
const contadorOpcional = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => (v === null || v === undefined || String(v).trim() === '' ? null : Number(String(v).replace(/\./g, ''))))
  .pipe(
    z.number({ error: 'El contador es un número entero.' }).int({ error: 'El contador es un número entero.' }).min(0).nullable(),
  )
const claves = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]

type Error = { ok: false; error: string }
const error = (mensaje: string): Error => ({ ok: false, error: mensaje })

/** La orden bloqueada hasta el fin de la transacción (dos técnicos no la pisan). */
async function ordenParaCambiar(tx: Transaccion, id: string) {
  const [o] = await tx.select().from(ordenesServicio).where(eq(ordenesServicio.id, id)).for('update')
  return o ?? null
}

type Orden = typeof ordenesServicio.$inferSelect

/** Se le pueden cargar visitas e insumos: abierta o en informe. */
function soloAbierta(o: Orden | null): Error | null {
  if (!o) return error('Esa orden de servicio ya no existe.')
  if (o.estado === 'cancelada') return error('La orden está cancelada.')
  if (estaCerrada(o.estado)) return error('La orden ya está cerrada: reabrila para cambiarla.')
  if (!seTrabaja(o.estado)) return error('La orden no admite cambios en este estado.')
  return null
}

/** Plazo para informar del tipo de la orden (48 h si no tiene tipo). */
async function plazoDe(tx: Transaccion, tipoOrdenId: string | null) {
  if (!tipoOrdenId) return 48
  const [t] = await tx.select({ plazo: tiposOrden.plazoHoras }).from(tiposOrden).where(eq(tiposOrden.id, tipoOrdenId))
  return t?.plazo ?? 48
}

/** Estado y vencimiento según la planificación (para una orden abierta). */
async function planificacion(
  tx: Transaccion,
  o: { programada: string | null; hora: string | null; tecnicoId: string | null; tipoOrdenId: string | null },
) {
  const estado = estadoPlanificado(o)
  const vence = estado === 'asignada' ? vencimiento(o.programada, o.hora, await plazoDe(tx, o.tipoOrdenId)) : null
  return { estado, vence }
}

// ---------------------------------------------------------------- Órdenes

const EsquemaOrden = z.object({
  fecha,
  terceroId: z.uuid({ error: 'Elegí el cliente.' }),
  equipoId: opcionalUuid,
  tipo: z.enum(claves(TIPOS_ORDEN)).default('correctivo'),
  prioridad: z.enum(['normal', 'urgente']).default('normal'),
  falla: z.string().trim().min(3, { error: 'Escribí qué pasa o qué pide el cliente.' }),
  contacto: texto,
  telefono: texto,
  email: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null)
    .pipe(z.email({ error: 'El email no es válido.' }).nullable()),
  domicilio: texto,
  tecnicoId: opcionalUuid,
  programada: fechaOpcional,
  hora: horaOpcional,
  duracion: z.coerce.number().int().min(5).max(1440).nullable().optional(),
  /** Tipo de orden (con sus formularios) y respuestas a las instrucciones. */
  tipoOrdenId: opcionalUuid,
  instrucciones: z.record(z.string(), z.unknown()).default({}),
  /** Vacía: la sugerida según el equipo (contrato, garantía o cargo). */
  cobertura: z
    .enum(claves(COBERTURAS))
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  observaciones: texto,
  /** Quién la abre (solo cuenta al crearla). */
  origen: z.enum(['oficina', 'portal', 'api', 'preventivo', 'whatsapp']).default('oficina'),
})

/** Abre una orden nueva o corrige los datos de una que no está facturada ni cancelada. */
export async function guardarOrden(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string) {
  const p = EsquemaOrden.safeParse(entrada)
  if (!p.success) return error(primerError(p.error))
  const { cobertura, instrucciones: respuestas, origen, ...d } = p.data

  let equipo: typeof equipos.$inferSelect | undefined
  if (d.equipoId) {
    ;[equipo] = await tx.select().from(equipos).where(eq(equipos.id, d.equipoId))
    if (!equipo) return error('Ese equipo ya no existe.')
    if (equipo.terceroId && equipo.terceroId !== d.terceroId) return error('El equipo está instalado en otro cliente.')
  }
  if (d.programada && d.programada < d.fecha) return error('La visita no puede ser antes de la fecha del pedido.')

  const anterior = id ? await ordenParaCambiar(tx, id) : null
  if (id) {
    if (!anterior) return error('Esa orden de servicio ya no existe.')
    if (anterior.estado === 'cancelada') return error('La orden está cancelada.')
    if (anterior.comprobanteId) return error('La orden ya está facturada: no se modifica.')
  }

  // Tipo de orden: sus formularios (la versión vigente, o la que ya tenía la orden si no cambió de tipo).
  let plantillaId: string | null = null
  let instrucciones: Valores = {}
  let clase = d.tipo
  let duracion = d.duracion ?? 60
  if (d.tipoOrdenId) {
    const [t] = await tx.select().from(tiposOrden).where(eq(tiposOrden.id, d.tipoOrdenId))
    if (!t) return error('Ese tipo de orden ya no existe.')
    const mismoTipo = anterior?.tipoOrdenId === t.id && anterior.plantillaId
    if (!t.activo && !mismoTipo) return error(`El tipo de orden ${t.nombre} está dado de baja.`)
    const plantilla = mismoTipo ? await obtenerPlantilla(tx, anterior.plantillaId!) : await plantillaVigente(tx, t.id)
    if (!plantilla) return error(`El tipo de orden ${t.nombre} no tiene formularios.`)
    // El campo de equipo de las instrucciones es el equipo de la orden.
    const campoEquipo = campoDe(plantilla.instrucciones, 'equipo')
    const valores = { ...respuestas, ...(campoEquipo ? { [campoEquipo.id]: d.equipoId ?? '' } : {}) }
    const v = validarValores(plantilla.instrucciones, valores)
    if (!v.ok) return error(v.error)
    plantillaId = plantilla.id
    instrucciones = v.valores
    clase = t.clase as typeof clase
    duracion = d.duracion ?? t.duracion
  }

  const datos = {
    ...d,
    tipo: clase,
    duracion,
    plantillaId,
    instrucciones,
    contratoId: equipo?.contratoId ?? null,
    domicilio: d.domicilio ?? (equipo ? [equipo.domicilio, equipo.localidad].filter(Boolean).join(', ') || null : null),
    contacto: d.contacto ?? equipo?.contacto ?? null,
    telefono: d.telefono ?? equipo?.telefono ?? null,
    cobertura: cobertura ?? coberturaSugerida(equipo ?? null, d.fecha),
  }

  const plan = await planificacion(tx, datos)
  // SLA: se fija al abrir; si cambia la prioridad o el contrato de una orden abierta, se recalcula desde su apertura.
  const recalcular =
    !anterior ||
    (estaAbierta(anterior.estado) && (anterior.prioridad !== datos.prioridad || anterior.contratoId !== datos.contratoId))
  const sla = recalcular
    ? limitesSla(
        anterior?.creado ?? new Date(),
        datos.prioridad,
        await obtenerConfiguracion(tx),
        datos.contratoId
          ? (
              await tx
                .select({ slaRespuestaHoras: contratos.slaRespuestaHoras, slaResolucionHoras: contratos.slaResolucionHoras })
                .from(contratos)
                .where(eq(contratos.id, datos.contratoId))
            )[0]
          : null,
      )
    : {}
  let ordenId = id
  let numero: number
  if (anterior) {
    // Abierta: el estado sale de la planificación. En informe o cerrada se corrigen los datos, nada más.
    const cambio = estaAbierta(anterior.estado) ? { ...plan, ...sla } : {}
    await tx
      .update(ordenesServicio)
      .set({ ...datos, ...cambio })
      .where(eq(ordenesServicio.id, anterior.id))
    numero = anterior.numero
  } else {
    numero = await siguienteNumero(tx, 'orden_servicio')
    const [nueva] = await tx
      .insert(ordenesServicio)
      .values({ ...datos, ...plan, ...sla, numero, origen, usuarioId })
      .returning({ id: ordenesServicio.id })
    ordenId = nueva.id
    await emitir(tx, 'orden.creada', await datosEvento(tx, ordenId))
  }
  await auditar(tx, {
    usuarioId,
    accion: id ? 'modificacion' : 'alta',
    entidad: 'orden_servicio',
    entidadId: ordenId,
    despues: datos,
  })
  return { ok: true as const, id: ordenId!, numero }
}

const EsquemaProgramacion = z.object({
  tecnicoId: opcionalUuid,
  programada: fechaOpcional,
  hora: horaOpcional,
  duracion: z.coerce.number().int().min(5).max(1440).optional(),
  /** Técnicos que van con el responsable (si no viene, quedan los que estaban). */
  acompanantes: z.array(z.string()).optional(),
})

/**
 * Programa la visita (lo que hace el calendario al arrastrar): técnico, día,
 * hora y duración. Sin día queda pendiente; con día y sin técnico, proyectada;
 * con los dos, asignada. Reprogramar una vencida la vuelve a asignar.
 */
export async function programarOrden(tx: Transaccion, usuarioId: string, id: string, entrada: unknown) {
  const p = EsquemaProgramacion.safeParse(entrada)
  if (!p.success) return error(primerError(p.error))
  const o = await ordenParaCambiar(tx, id)
  if (!o) return error('Esa orden de servicio ya no existe.')
  if (!estaAbierta(o.estado)) return error('Solo se programa una orden que todavía no se hizo.')
  const { acompanantes, ...resto } = p.data
  const d = { ...resto, duracion: resto.duracion ?? o.duracion }
  if (d.programada && d.programada < o.fecha) return error('La visita no puede ser antes de la fecha del pedido.')
  if (d.tecnicoId) {
    const [t] = await tx.select({ activo: tecnicos.activo }).from(tecnicos).where(eq(tecnicos.id, d.tecnicoId))
    if (!t?.activo) return error('Ese técnico no está activo.')
  }
  // Sin responsable no hay acompañantes; si no se mandan, quedan los que estaban.
  const equipo = await ponerAcompanantes(
    tx,
    id,
    d.tecnicoId ?? null,
    !d.tecnicoId ? (acompanantes ?? []) : (acompanantes ?? (await acompanantesDe(tx, [id])).get(id)?.map((t) => t.id) ?? []),
  )
  if (!equipo.ok) return error(equipo.error)
  const plan = await planificacion(tx, { ...d, tipoOrdenId: o.tipoOrdenId })
  await tx
    .update(ordenesServicio)
    .set({ ...d, ...plan })
    .where(eq(ordenesServicio.id, id))
  await auditar(tx, {
    usuarioId,
    accion: 'modificacion',
    entidad: 'orden_servicio',
    entidadId: id,
    despues: { ...d, acompanantes: equipo.ids },
  })
  await emitir(tx, 'orden.programada', await datosEvento(tx, id))
  return { ok: true as const, estado: plan.estado }
}

/** Compatibilidad: asignar es programar sin cambiar la hora ni la duración. */
export async function asignarOrden(tx: Transaccion, usuarioId: string, id: string, entrada: unknown) {
  const [o] = await tx.select({ hora: ordenesServicio.hora }).from(ordenesServicio).where(eq(ordenesServicio.id, id))
  return programarOrden(tx, usuarioId, id, { hora: o?.hora ?? null, ...(entrada as object) })
}

/**
 * Pasa a vencidas las asignadas cuyo plazo para informar ya pasó. Se llama al
 * consultar (listado, calendario, agenda): no hace falta un proceso aparte.
 */
export async function marcarVencidas(tx: Transaccion, ahora = new Date()) {
  const r = await tx
    .update(ordenesServicio)
    .set({ estado: 'vencida' })
    .where(and(eq(ordenesServicio.estado, 'asignada'), isNotNull(ordenesServicio.vence), lt(ordenesServicio.vence, ahora)))
    .returning({ id: ordenesServicio.id })
  return r.length
}

// ------------------------------------------------------------ Técnico en campo

const EsquemaLlegada = z.object({
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  /** Cuándo llegó, si se marcó sin señal y se manda después (del celular; no del futuro ni de hace más de una semana). */
  cuando: z.iso.datetime({ offset: true }).nullable().optional(),
})

/** El técnico marca que llegó (con la ubicación del celular, si la dio). Vale la primera vez. */
export async function registrarLlegada(tx: Transaccion, usuarioId: string, id: string, entrada: unknown) {
  const p = EsquemaLlegada.safeParse(entrada)
  if (!p.success) return error('Ubicación inválida.')
  const o = await ordenParaCambiar(tx, id)
  if (!o) return error('Esa orden de servicio ya no existe.')
  if (!estaAbierta(o.estado)) return error('La orden ya no está para hacerse.')
  if (o.llegada) return { ok: true as const, llegada: o.llegada }
  const ahora = new Date()
  const marcada = p.data.cuando ? new Date(p.data.cuando) : null
  const llegada =
    marcada && marcada.getTime() <= ahora.getTime() + 5 * 60_000 && ahora.getTime() - marcada.getTime() <= 7 * 86_400_000
      ? marcada
      : ahora
  const conUbicacion = p.data.lat != null && p.data.lng != null
  await tx
    .update(ordenesServicio)
    .set({
      llegada,
      llegadaLat: conUbicacion ? p.data.lat!.toFixed(6) : null,
      llegadaLng: conUbicacion ? p.data.lng!.toFixed(6) : null,
    })
    .where(eq(ordenesServicio.id, id))
  // El GPS del técnico en el lugar ubica al equipo en el mapa, si todavía no tenía ubicación.
  if (conUbicacion && o.equipoId && !o.lat)
    await tx
      .update(equipos)
      .set({ lat: p.data.lat!.toFixed(6), lng: p.data.lng!.toFixed(6) })
      .where(and(eq(equipos.id, o.equipoId), isNull(equipos.lat)))
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'orden_servicio', entidadId: id, despues: { llegada } })
  return { ok: true as const, llegada }
}

/** Precios en pesos de la lista del cliente (o de la primera lista activa), para lo que cobra la orden. */
async function preciosDelCliente(tx: Transaccion, terceroId: string, articuloIds: string[]) {
  if (!articuloIds.length) return new Map<string, string>()
  const [cliente] = await tx.select({ lista: terceros.listaPreciosId }).from(terceros).where(eq(terceros.id, terceroId))
  const listaId =
    cliente?.lista ??
    (
      await tx
        .select({ id: listasPrecios.id })
        .from(listasPrecios)
        .where(eq(listasPrecios.activa, true))
        .orderBy(asc(listasPrecios.codigo))
        .limit(1)
    )[0]?.id
  const salida = new Map<string, string>()
  if (!listaId) return salida
  const dolar = (await cotizacionVigente(tx, 'DOL'))?.valor ?? '0'
  for (const [articuloId, p] of await preciosVigentes(tx, listaId, articuloIds)) {
    try {
      salida.set(articuloId, convertir(p.precio, p.moneda, 'PES', dolar))
    } catch {
      // Sin cotización para pasarlo a pesos: queda sin precio y lo completa la oficina.
    }
  }
  return salida
}

const EsquemaInforme = z.object({
  fecha,
  solucion: z.string().trim().min(3, { error: 'Escribí un resumen de lo que hiciste.' }).max(2000),
  cierre: z.enum(Object.keys(CIERRES) as [keyof typeof CIERRES, ...(keyof typeof CIERRES)[]], {
    error: '¿Cómo quedó? Elegí OK, con desvío o no cumplida.',
  }),
  resultados: z.record(z.string(), z.unknown()).default({}),
})

/**
 * Devolución del técnico desde el celular: valida el formulario de la orden
 * y aplica sus efectos en la misma transacción.
 * - Materiales: salen de la camioneta del técnico (o del primer depósito) y
 *   quedan como renglones; si la orden es con cargo, con el precio de lista.
 * - Contador: queda como lectura del equipo (factura de contratos).
 * - Queda una visita con el tiempo entre la llegada y el envío.
 * La orden pasa a informe, para que la revise el supervisor.
 */
export async function informarOrden(tx: Transaccion, usuarioId: string, id: string, entrada: unknown) {
  const p = EsquemaInforme.safeParse(entrada)
  if (!p.success) return error(primerError(p.error))
  const d = p.data
  const o = await ordenParaCambiar(tx, id)
  if (!o) return error('Esa orden de servicio ya no existe.')
  if (!estaAbierta(o.estado)) {
    return error(o.estado === 'informe' ? 'La orden ya se informó.' : 'La orden ya no está para hacerse.')
  }
  if (d.fecha < o.fecha) return error('No se puede informar antes de la fecha del pedido.')

  const plantilla = o.plantillaId ? await obtenerPlantilla(tx, o.plantillaId) : null
  const campos: Campo[] = plantilla?.devolucion ?? []
  const v = validarValores(campos, d.resultados)
  if (!v.ok) return error(v.error)
  const resultados = v.valores

  // Fotos y firma tienen que ser de esta orden.
  const archivos = archivosDe(campos, resultados)
  if (archivos.length) {
    const propios = await tx
      .select({ id: archivosServicio.id })
      .from(archivosServicio)
      .where(and(eq(archivosServicio.ordenId, id), inArray(archivosServicio.id, archivos)))
    if (propios.length !== new Set(archivos).size) return error('Hay fotos o firmas que no son de esta orden: volvé a cargarlas.')
  }

  // Equipo elegido en la devolución (si la orden no tenía).
  let equipoId = o.equipoId
  const campoEquipo = campoDe(campos, 'equipo')
  if (campoEquipo && resultados[campoEquipo.id]) {
    const elegido = resultados[campoEquipo.id] as string
    const [e] = await tx.select({ terceroId: equipos.terceroId }).from(equipos).where(eq(equipos.id, elegido))
    if (!e || e.terceroId !== o.terceroId) return error('El equipo elegido no es de este cliente.')
    equipoId ??= elegido
  }

  // Contador → lectura del equipo.
  let contador: number | null = null
  const campoContador = campoDe(campos, 'contador')
  const lectura = campoContador ? (resultados[campoContador.id] as Lectura | undefined) : undefined
  if (lectura) {
    if (!equipoId) return error('La orden no tiene equipo: el contador no se puede guardar.')
    const l = await registrarLectura(
      tx,
      usuarioId,
      { equipoId, fecha: d.fecha, contador: lectura.contador, creditos: lectura.creditos },
      'tecnico',
    )
    if (!l.ok) return l
    contador = lectura.contador
  }

  // Materiales → renglones de la orden con su salida de stock.
  const campoMateriales = campoDe(campos, 'materiales')
  const materiales = campoMateriales ? ((resultados[campoMateriales.id] as Material[] | undefined) ?? []) : []
  const avisos: string[] = []
  if (materiales.length) {
    const [tecnico] = o.tecnicoId ? await tx.select().from(tecnicos).where(eq(tecnicos.id, o.tecnicoId)) : []
    const depositoId =
      tecnico?.depositoId ??
      (
        await tx
          .select({ id: depositos.id })
          .from(depositos)
          .where(eq(depositos.activo, true))
          .orderBy(asc(depositos.codigo))
          .limit(1)
      )[0]?.id
    const precios =
      o.cobertura === 'cargo'
        ? await preciosDelCliente(
            tx,
            o.terceroId,
            materiales.flatMap((m) => (m.articuloId ? [m.articuloId] : [])),
          )
        : new Map<string, string>()
    for (const m of materiales) {
      const r = await agregarItem(tx, usuarioId, id, {
        articuloId: m.articuloId,
        descripcion: m.descripcion || null,
        cantidad: m.cantidad,
        depositoId,
        precioUnitario: (m.articuloId && precios.get(m.articuloId)) || '0',
      })
      if (!r.ok) return r
      avisos.push(...r.avisos)
    }
  }

  const salida = new Date()
  await tx.insert(ordenesServicioVisitas).values({
    ordenId: id,
    fecha: d.fecha,
    tecnicoId: o.tecnicoId,
    horas: o.llegada ? Math.max(0, (salida.getTime() - o.llegada.getTime()) / 3_600_000).toFixed(2) : '0',
    detalle: d.solucion,
    usuarioId,
  })
  await tx
    .update(ordenesServicio)
    .set({
      estado: 'informe',
      resultados,
      solucion: d.solucion,
      cierreTecnico: d.cierre,
      informada: salida,
      salida,
      equipoId,
      contador: contador ?? o.contador,
    })
    .where(eq(ordenesServicio.id, id))
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'orden_servicio', entidadId: id, despues: { informe: d } })
  await emitir(tx, 'orden.informada', await datosEvento(tx, id))
  return { ok: true as const, avisos }
}

// ---------------------------------------------------------------- Visitas

const EsquemaVisita = z.object({
  fecha,
  tecnicoId: opcionalUuid,
  horas: decimal('Las horas son un número (1,5 es una hora y media).').default('0'),
  detalle: z.string().trim().min(3, { error: 'Escribí qué se hizo en la visita.' }),
})

export async function registrarVisita(tx: Transaccion, usuarioId: string, ordenId: string, entrada: unknown) {
  const p = EsquemaVisita.safeParse(entrada)
  if (!p.success) return error(primerError(p.error))
  const o = await ordenParaCambiar(tx, ordenId)
  const no = soloAbierta(o)
  if (no) return no
  if (p.data.fecha < o!.fecha) return error('La visita no puede ser antes de la fecha del pedido.')
  const tecnicoId = p.data.tecnicoId ?? o!.tecnicoId
  await tx.insert(ordenesServicioVisitas).values({ ...p.data, tecnicoId, ordenId, usuarioId })
  // Quien fue a verla queda como técnico de la orden si no había uno.
  if (!o!.tecnicoId && tecnicoId) {
    const cambio = estaAbierta(o!.estado) ? await planificacion(tx, { ...o!, tecnicoId }) : {}
    await tx
      .update(ordenesServicio)
      .set({ tecnicoId, ...cambio })
      .where(eq(ordenesServicio.id, ordenId))
  }
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'visita_servicio', entidadId: ordenId, despues: p.data })
  return { ok: true as const }
}

// ------------------------------------------------- Insumos y mano de obra

const EsquemaItem = z.object({
  articuloId: opcionalUuid,
  descripcion: texto,
  cantidad: decimal('La cantidad tiene que ser mayor que cero.').refine((v) => Number(v) > 0, {
    error: 'La cantidad tiene que ser mayor que cero.',
  }),
  depositoId: opcionalUuid,
  precioUnitario: decimal('El precio no puede ser negativo.').default('0'),
  alicuotaIva: z.coerce
    .number()
    .refine((v) => v in TASAS_IVA, { error: 'Alícuota de IVA inválida.' })
    .optional(),
})

/**
 * Agrega un insumo, repuesto o mano de obra. Si es un artículo con stock,
 * sale del depósito en ese momento; si el depósito no tenía, avisa y deja el
 * stock negativo (el técnico ya lo usó).
 */
export async function agregarItem(tx: Transaccion, usuarioId: string, ordenId: string, entrada: unknown) {
  const p = EsquemaItem.safeParse(entrada)
  if (!p.success) return error(primerError(p.error))
  const d = p.data
  const o = await ordenParaCambiar(tx, ordenId)
  const no = soloAbierta(o)
  if (no) return no

  let articulo: typeof articulos.$inferSelect | undefined
  if (d.articuloId) {
    ;[articulo] = await tx.select().from(articulos).where(eq(articulos.id, d.articuloId))
    if (!articulo) return error('Ese artículo ya no existe.')
  }
  const descripcion = d.descripcion ?? articulo?.nombre
  if (!descripcion) return error('Elegí un artículo o escribí qué se cobra (por ejemplo, Mano de obra).')
  const conStock = !!articulo?.llevaStock
  if (conStock && !d.depositoId) return error('Elegí de qué depósito sale.')

  const avisos: string[] = []
  if (conStock) {
    const saldo = monto(await saldoDe(tx, articulo!.id, d.depositoId!))
    if (saldo.lt(d.cantidad)) {
      avisos.push(`${articulo!.codigo}: el depósito tenía ${saldo.toString()} y salen ${d.cantidad}; queda stock negativo.`)
    }
  }
  const [item] = await tx
    .insert(ordenesServicioItems)
    .values({
      ordenId,
      articuloId: articulo?.id ?? null,
      descripcion,
      cantidad: d.cantidad,
      depositoId: conStock ? d.depositoId : null,
      precioUnitario: d.precioUnitario,
      alicuotaIva: d.alicuotaIva ?? articulo?.alicuotaIva ?? 5,
      usuarioId,
    })
    .returning()
  if (conStock) {
    await registrarMovimientos(tx, usuarioId, [
      {
        articuloId: articulo!.id,
        depositoId: d.depositoId!,
        cantidad: `-${d.cantidad}`,
        tipo: 'servicio',
        origenId: ordenId,
        observacion: `Orden de servicio ${o!.numero}`,
      },
    ])
  }
  await auditar(tx, { usuarioId, accion: 'alta', entidad: 'item_servicio', entidadId: item.id, despues: item })
  return { ok: true as const, id: item.id, avisos }
}

/** Quita un renglón de una orden abierta; lo que había salido del depósito vuelve. */
export async function quitarItem(tx: Transaccion, usuarioId: string, itemId: string) {
  const [item] = await tx.select().from(ordenesServicioItems).where(eq(ordenesServicioItems.id, itemId))
  if (!item) return error('Ese renglón ya no existe.')
  const o = await ordenParaCambiar(tx, item.ordenId)
  const no = soloAbierta(o)
  if (no) return no
  await tx.delete(ordenesServicioItems).where(eq(ordenesServicioItems.id, itemId))
  if (item.articuloId && item.depositoId) {
    await registrarMovimientos(tx, usuarioId, [
      {
        articuloId: item.articuloId,
        depositoId: item.depositoId,
        cantidad: item.cantidad,
        tipo: 'anulacion_servicio',
        origenId: item.ordenId,
        observacion: `Devuelto de la orden de servicio ${o!.numero}`,
      },
    ])
  }
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'item_servicio', entidadId: itemId, antes: item })
  return { ok: true as const }
}

// ------------------------------------------------- Cerrar, reabrir, cancelar

const EsquemaCierre = z.object({
  fecha,
  cierre: z.enum(Object.keys(CIERRES) as [keyof typeof CIERRES, ...(keyof typeof CIERRES)[]]),
  nota: texto,
  /** Para cerrar desde la oficina una orden que el técnico no informó por el celular. */
  contador: contadorOpcional,
  creditos: z.coerce.number().int().min(0, { error: 'Las copias de prueba son un número entero.' }).default(0),
})

/**
 * El supervisor cierra la orden: OK, con desvío (hecha con algo pendiente) o
 * no cumplida. Normalmente después del informe del técnico; también se puede
 * cerrar directo desde la oficina (resuelta por teléfono, por ejemplo), y
 * entonces la nota es la solución.
 */
export async function cerrarOrden(tx: Transaccion, usuarioId: string, id: string, entrada: unknown) {
  const p = EsquemaCierre.safeParse(entrada)
  if (!p.success) return error(primerError(p.error))
  const d = p.data
  const o = await ordenParaCambiar(tx, id)
  if (!o) return error('Esa orden de servicio ya no existe.')
  if (o.estado !== 'informe' && !estaAbierta(o.estado)) return error('La orden ya está cerrada o cancelada.')
  if (d.fecha < o.fecha) return error('No se puede cerrar antes de la fecha del pedido.')
  const solucion = o.solucion ?? d.nota
  if (!solucion || solucion.length < 3) return error('Escribí qué se hizo (o por qué no se hizo).')
  if (d.cierre !== 'ok' && !d.nota) return error('Contá el desvío o por qué no se cumplió.')
  if (d.contador !== null) {
    if (!o.equipoId) return error('La orden no tiene equipo: el contador no se puede guardar.')
    const l = await registrarLectura(
      tx,
      usuarioId,
      { equipoId: o.equipoId, fecha: d.fecha, contador: d.contador, creditos: d.creditos },
      'tecnico',
    )
    if (!l.ok) return l
  }
  await tx
    .update(ordenesServicio)
    .set({
      estado: `cerrada_${d.cierre}`,
      solucion,
      notaCierre: d.nota,
      fechaResolucion: d.fecha,
      cerrada: new Date(),
      cerradaPor: usuarioId,
      contador: d.contador ?? o.contador,
    })
    .where(eq(ordenesServicio.id, id))
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'orden_servicio', entidadId: id, despues: { cierre: d } })
  await emitir(tx, 'orden.cerrada', await datosEvento(tx, id))
  return { ok: true as const }
}

/**
 * Cierre en lote de órdenes en informe (lo que se acumula esperando al
 * supervisor). Cada una se cierra como la propuso el técnico, o todas OK, con
 * la fecha de su informe. Si el técnico propuso desvío o no cumplida, la nota
 * es la que dejó o su resumen. Las que no se pueden cerrar se informan.
 */
/** Órdenes que se cierran de una vez (y que muestra la revisión en lote). */
export const LOTE_MAXIMO = 500

export async function cerrarEnLote(tx: Transaccion, usuarioId: string, ids: string[], o: { modo: 'propuesto' | 'ok' }) {
  const unicos = [...new Set(ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, LOTE_MAXIMO)
  const filas = unicos.length ? await tx.select().from(ordenesServicio).where(inArray(ordenesServicio.id, unicos)) : []
  const cerradas: string[] = []
  const omitidas: { id: string; numero: number | null; motivo: string }[] = []
  for (const id of unicos) {
    const f = filas.find((x) => x.id === id)
    if (!f) {
      omitidas.push({ id, numero: null, motivo: 'ya no existe' })
      continue
    }
    if (f.estado !== 'informe') {
      omitidas.push({ id, numero: f.numero, motivo: 'no está en informe' })
      continue
    }
    const cierre = o.modo === 'ok' ? 'ok' : ((f.cierreTecnico as keyof typeof CIERRES | null) ?? 'ok')
    const fecha = f.informada ? hoyArgentina(f.informada) : hoyArgentina()
    const nota = cierre === 'ok' ? null : (f.notaCierre ?? (f.solucion ? `Según el informe del técnico: ${f.solucion}` : null))
    const r = await cerrarOrden(tx, usuarioId, id, { fecha: fecha < f.fecha ? f.fecha : fecha, cierre, nota })
    if (r.ok) cerradas.push(id)
    else omitidas.push({ id, numero: f.numero, motivo: r.error })
  }
  return { ok: true as const, cerradas, omitidas }
}

/** Compatibilidad: resolver es cerrar OK desde la oficina con la solución. */
export async function resolverOrden(tx: Transaccion, usuarioId: string, id: string, entrada: unknown) {
  const e = (entrada ?? {}) as { fecha?: string; solucion?: string; contador?: unknown; creditos?: unknown }
  return cerrarOrden(tx, usuarioId, id, {
    fecha: e.fecha,
    cierre: 'ok',
    nota: e.solucion,
    contador: e.contador,
    creditos: e.creditos,
  })
}

/**
 * Vuelve a abrir una orden cerrada o en informe (la falla se repitió, el
 * informe está incompleto): queda como estaba planificada. No si ya se facturó.
 */
export async function reabrirOrden(tx: Transaccion, usuarioId: string, id: string) {
  const o = await ordenParaCambiar(tx, id)
  if (!o) return error('Esa orden de servicio ya no existe.')
  if (!estaCerrada(o.estado) && o.estado !== 'informe') return error('Solo se reabre una orden cerrada o en informe.')
  if (o.comprobanteId) return error('La orden ya está facturada: abrí una nueva.')
  const plan = await planificacion(tx, o)
  await tx
    .update(ordenesServicio)
    .set({ ...plan, fechaResolucion: null, cerrada: null, cerradaPor: null, informada: null })
    .where(eq(ordenesServicio.id, id))
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'orden_servicio', entidadId: id, despues: { reabierta: true } })
  return { ok: true as const }
}

const EsquemaRecierre = z.object({
  cierre: z.enum(Object.keys(CIERRES) as [keyof typeof CIERRES, ...(keyof typeof CIERRES)[]]),
  nota: texto,
})

/**
 * Cambia el tipo de cierre de una orden ya cerrada (OK, con desvío o no
 * cumplida) sin reabrirla: conserva la fecha, el informe y la factura.
 * Una facturada no puede pasar a no cumplida.
 */
export async function recerrarOrden(tx: Transaccion, usuarioId: string, id: string, entrada: unknown) {
  const p = EsquemaRecierre.safeParse(entrada)
  if (!p.success) return error(primerError(p.error))
  const d = p.data
  const o = await ordenParaCambiar(tx, id)
  if (!o) return error('Esa orden de servicio ya no existe.')
  if (!estaCerrada(o.estado)) return error('Solo se cambia el cierre de una orden cerrada.')
  const estado = `cerrada_${d.cierre}`
  if (estado === o.estado && (d.nota ?? o.notaCierre) === o.notaCierre) return error('El cierre es el mismo.')
  if (o.comprobanteId && d.cierre === 'no_cumplida') return error('La orden está facturada: no puede quedar como no cumplida.')
  const nota = d.nota ?? o.notaCierre
  if (d.cierre !== 'ok' && !nota) return error('Contá el desvío o por qué no se cumplió.')
  await tx.update(ordenesServicio).set({ estado, notaCierre: nota }).where(eq(ordenesServicio.id, id))
  await auditar(tx, {
    usuarioId,
    accion: 'modificacion',
    entidad: 'orden_servicio',
    entidadId: id,
    antes: { estado: o.estado, notaCierre: o.notaCierre },
    despues: { estado, notaCierre: nota },
  })
  await emitir(tx, 'orden.cerrada', await datosEvento(tx, id))
  return { ok: true as const }
}

export async function cancelarOrden(tx: Transaccion, usuarioId: string, id: string, motivo: string) {
  const o = await ordenParaCambiar(tx, id)
  if (!o) return error('Esa orden de servicio ya no existe.')
  if (!estaAbierta(o.estado)) return error('Solo se cancela una orden que todavía no se hizo.')
  if (motivo.trim().length < 3) return error('Escribí por qué se cancela.')
  const [usado] = await tx
    .select({ id: ordenesServicioItems.id })
    .from(ordenesServicioItems)
    .where(eq(ordenesServicioItems.ordenId, id))
    .limit(1)
  if (usado) return error('La orden tiene insumos cargados: quitalos primero (vuelven al depósito) o cerrala.')
  await tx
    .update(ordenesServicio)
    .set({ estado: 'cancelada', motivoCancelacion: motivo.trim(), vence: null })
    .where(eq(ordenesServicio.id, id))
  await auditar(tx, { usuarioId, accion: 'anulacion', entidad: 'orden_servicio', entidadId: id, despues: { motivo } })
  await emitir(tx, 'orden.cancelada', await datosEvento(tx, id))
  return { ok: true as const }
}

// ---------------------------------------------------------------- Facturar

const EsquemaFacturar = z.object({
  puntoVenta: z.coerce.number().int().min(1, { error: 'Elegí el punto de venta.' }),
  fecha,
})

/**
 * Factura (en borrador) lo que tiene precio en una orden resuelta con cargo
 * al cliente. Concepto para ARCA: productos si son solo artículos de tipo
 * producto, servicios si son solo servicios o mano de obra, y ambos si hay de
 * los dos.
 */
export async function facturarOrden(tx: Transaccion, usuarioId: string, id: string, entrada: unknown) {
  const p = EsquemaFacturar.safeParse(entrada)
  if (!p.success) return error(primerError(p.error))
  const o = await ordenParaCambiar(tx, id)
  if (!o) return error('Esa orden de servicio ya no existe.')
  if (!estaHecha(o.estado)) return error('Se factura una orden cerrada OK o con desvío.')
  if (o.comprobanteId) return error('La orden ya está facturada.')
  if (cerradaEnPersat(o)) return error('La orden se cerró en Persat: se facturó en el sistema anterior.')
  if (o.cobertura !== 'cargo') {
    return error(`La orden está ${o.cobertura === 'contrato' ? 'cubierta por el contrato' : 'en garantía'}: no se factura.`)
  }
  const items = (
    await tx
      .select({ item: ordenesServicioItems, tipoArticulo: articulos.tipo })
      .from(ordenesServicioItems)
      .leftJoin(articulos, eq(articulos.id, ordenesServicioItems.articuloId))
      .where(eq(ordenesServicioItems.ordenId, id))
      .orderBy(asc(ordenesServicioItems.creado))
  ).filter((f) => Number(f.item.precioUnitario) > 0)
  if (!items.length) return error('La orden no tiene nada con precio para facturar.')

  // Un concepto escrito a mano (mano de obra, viático) es un servicio.
  const productos = items.some((f) => f.tipoArticulo === 'producto')
  const servicios = items.some((f) => f.tipoArticulo !== 'producto')
  const concepto = productos && servicios ? 3 : productos ? 1 : 2
  const [equipo] = o.equipoId ? await tx.select({ serie: equipos.serie }).from(equipos).where(eq(equipos.id, o.equipoId)) : []
  const f = await guardarComprobante(tx, usuarioId, {
    clase: 'factura',
    terceroId: o.terceroId,
    puntoVenta: p.data.puntoVenta,
    fecha: p.data.fecha,
    moneda: 'PES',
    cotizacion: '1',
    concepto,
    servicioDesde: concepto === 1 ? null : o.fecha,
    servicioHasta: concepto === 1 ? null : o.fechaResolucion,
    vencimiento: p.data.fecha,
    observaciones: `Orden de servicio N° ${o.numero}${equipo ? ` · equipo ${equipo.serie}` : ''}`,
    items: items.map(({ item: i }) => ({
      articuloId: i.articuloId,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
      alicuotaIva: i.alicuotaIva,
    })),
  })
  if (!f.ok) return f
  await tx.update(ordenesServicio).set({ comprobanteId: f.id }).where(eq(ordenesServicio.id, id))
  await auditar(tx, { usuarioId, accion: 'emision', entidad: 'orden_servicio', entidadId: id, despues: { comprobanteId: f.id } })
  return { ok: true as const, comprobanteId: f.id }
}

// -------------------------------------------------------------- Consultas

export type FiltroOrdenes = {
  q?: string
  /** activas (abiertas y en informe), un estado, cerradas, o todas */
  estado?: string
  tecnicoId?: string
  /** Con tecnicoId: también las que acompaña. */
  incluirAcompanante?: boolean
  etiquetaId?: string
  equipoId?: string
  terceroId?: string
  limite?: number
}

/** Abiertas y en informe: lo que todavía pide atención. */
const ACTIVAS = [...ABIERTAS, 'informe']
const activa = sql`${ordenesServicio.estado} in ('pendiente', 'proyectada', 'asignada', 'vencida', 'informe')`

export async function listarOrdenes(tx: Transaccion, filtro: FiltroOrdenes = {}) {
  const q = filtro.q?.trim()
  const estado =
    filtro.estado === 'todas'
      ? undefined
      : filtro.estado === 'cerradas'
        ? sql`${ordenesServicio.estado} like 'cerrada%'`
        : filtro.estado && !['abiertas', 'activas'].includes(filtro.estado)
          ? eq(ordenesServicio.estado, filtro.estado)
          : inArray(ordenesServicio.estado, ACTIVAS)
  return (
    tx
      .select({
        id: ordenesServicio.id,
        numero: ordenesServicio.numero,
        fecha: ordenesServicio.fecha,
        tipo: ordenesServicio.tipo,
        prioridad: ordenesServicio.prioridad,
        estado: ordenesServicio.estado,
        cobertura: ordenesServicio.cobertura,
        falla: ordenesServicio.falla,
        programada: ordenesServicio.programada,
        hora: ordenesServicio.hora,
        duracion: ordenesServicio.duracion,
        tecnicoId: ordenesServicio.tecnicoId,
        tipoOrden: tiposOrden.nombre,
        color: tiposOrden.color,
        cierreTecnico: ordenesServicio.cierreTecnico,
        fechaResolucion: ordenesServicio.fechaResolucion,
        creado: ordenesServicio.creado,
        slaRespuesta: ordenesServicio.slaRespuesta,
        slaResolucion: ordenesServicio.slaResolucion,
        llegada: ordenesServicio.llegada,
        informada: ordenesServicio.informada,
        cerrada: ordenesServicio.cerrada,
        comprobanteId: ordenesServicio.comprobanteId,
        origen: ordenesServicio.origen,
        cerradaPor: ordenesServicio.cerradaPor,
        cliente: terceros.razonSocial,
        terceroId: ordenesServicio.terceroId,
        equipoId: ordenesServicio.equipoId,
        serie: equipos.serie,
        modelo: modelosEquipo.nombre,
        tecnico: tecnicos.nombre,
      })
      .from(ordenesServicio)
      .innerJoin(terceros, eq(terceros.id, ordenesServicio.terceroId))
      .leftJoin(equipos, eq(equipos.id, ordenesServicio.equipoId))
      .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
      .leftJoin(tecnicos, eq(tecnicos.id, ordenesServicio.tecnicoId))
      .leftJoin(tiposOrden, eq(tiposOrden.id, ordenesServicio.tipoOrdenId))
      .where(
        and(
          estado,
          filtro.tecnicoId
            ? filtro.incluirAcompanante
              ? or(
                  eq(ordenesServicio.tecnicoId, filtro.tecnicoId),
                  sql`exists (select 1 from ordenes_servicio_tecnicos x where x.orden_id = ${ordenesServicio.id} and x.tecnico_id = ${filtro.tecnicoId})`,
                )
              : eq(ordenesServicio.tecnicoId, filtro.tecnicoId)
            : undefined,
          filtro.etiquetaId
            ? sql`exists (select 1 from ordenes_servicio_etiquetas x where x.orden_id = ${ordenesServicio.id} and x.etiqueta_id = ${filtro.etiquetaId})`
            : undefined,
          filtro.equipoId ? eq(ordenesServicio.equipoId, filtro.equipoId) : undefined,
          filtro.terceroId ? eq(ordenesServicio.terceroId, filtro.terceroId) : undefined,
          q
            ? or(
                ilike(terceros.razonSocial, `%${q}%`),
                ilike(equipos.serie, `%${q}%`),
                ilike(ordenesServicio.falla, `%${q}%`),
                /^\d+$/.test(q) ? eq(ordenesServicio.numero, Number(q)) : undefined,
              )
            : undefined,
        ),
      )
      // Activas: primero las urgentes y las más viejas. El resto, las más nuevas arriba.
      .orderBy(
        sql`case when ${activa} then 0 else 1 end`,
        sql`case when ${activa} and ${ordenesServicio.prioridad} = 'urgente' then 0 else 1 end`,
        sql`case when ${activa} then ${ordenesServicio.numero} else -${ordenesServicio.numero} end`,
      )
      .limit(filtro.limite ?? 300)
  )
}

/** Cuántas hay en cada situación que pide atención (para el encabezado). */
export async function resumenOrdenes(tx: Transaccion) {
  const [r] = await tx
    .select({
      abiertas: sql<number>`count(*) filter (where ${activa})::int`,
      sinAsignar: sql<number>`count(*) filter (where ${ordenesServicio.estado} in ('pendiente', 'proyectada'))::int`,
      urgentes: sql<number>`count(*) filter (where ${activa} and ${ordenesServicio.prioridad} = 'urgente')::int`,
      vencidas: sql<number>`count(*) filter (where ${ordenesServicio.estado} = 'vencida')::int`,
      paraRevisar: sql<number>`count(*) filter (where ${ordenesServicio.estado} = 'informe')::int`,
      porFacturar: sql<number>`count(*) filter (where ${ordenesServicio.estado} in ('cerrada_ok', 'cerrada_desvio') and ${ordenesServicio.cobertura} = 'cargo' and ${ordenesServicio.comprobanteId} is null and not (${ordenesServicio.origen} = 'persat' and ${ordenesServicio.cerradaPor} is null))::int`,
    })
    .from(ordenesServicio)
  return r
}

export async function obtenerOrden(tx: Transaccion, id: string) {
  const [o] = await tx.select().from(ordenesServicio).where(eq(ordenesServicio.id, id))
  if (!o) return null
  const [[cliente], [equipo], visitas, items, [factura]] = await Promise.all([
    tx
      .select({
        id: terceros.id,
        razonSocial: terceros.razonSocial,
        listaPreciosId: terceros.listaPreciosId,
        telefono: terceros.telefono,
        email: terceros.email,
      })
      .from(terceros)
      .where(eq(terceros.id, o.terceroId)),
    o.equipoId
      ? tx
          .select({
            id: equipos.id,
            serie: equipos.serie,
            modelo: modelosEquipo.nombre,
            garantiaHasta: equipos.garantiaHasta,
            contratoId: equipos.contratoId,
            sector: equipos.sector,
          })
          .from(equipos)
          .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
          .where(eq(equipos.id, o.equipoId))
      : Promise.resolve([]),
    tx
      .select({
        id: ordenesServicioVisitas.id,
        fecha: ordenesServicioVisitas.fecha,
        horas: ordenesServicioVisitas.horas,
        detalle: ordenesServicioVisitas.detalle,
        tecnico: tecnicos.nombre,
      })
      .from(ordenesServicioVisitas)
      .leftJoin(tecnicos, eq(tecnicos.id, ordenesServicioVisitas.tecnicoId))
      .where(eq(ordenesServicioVisitas.ordenId, id))
      .orderBy(asc(ordenesServicioVisitas.fecha), asc(ordenesServicioVisitas.creado)),
    tx
      .select({
        id: ordenesServicioItems.id,
        articuloId: ordenesServicioItems.articuloId,
        codigo: articulos.codigo,
        descripcion: ordenesServicioItems.descripcion,
        cantidad: ordenesServicioItems.cantidad,
        deposito: depositos.nombre,
        precioUnitario: ordenesServicioItems.precioUnitario,
        alicuotaIva: ordenesServicioItems.alicuotaIva,
      })
      .from(ordenesServicioItems)
      .leftJoin(articulos, eq(articulos.id, ordenesServicioItems.articuloId))
      .leftJoin(depositos, eq(depositos.id, ordenesServicioItems.depositoId))
      .where(eq(ordenesServicioItems.ordenId, id))
      .orderBy(asc(ordenesServicioItems.creado)),
    o.comprobanteId
      ? tx
          .select({
            id: comprobantes.id,
            estado: comprobantes.estado,
            letra: comprobantes.letra,
            puntoVenta: comprobantes.puntoVenta,
            numero: comprobantes.numero,
            total: comprobantes.total,
          })
          .from(comprobantes)
          .where(eq(comprobantes.id, o.comprobanteId))
      : Promise.resolve([]),
  ])
  const [tecnico, tipoOrden, plantilla, archivos, [encuesta], avisos, etiquetas, acompanantes] = await Promise.all([
    o.tecnicoId
      ? tx
          .select()
          .from(tecnicos)
          .where(eq(tecnicos.id, o.tecnicoId))
          .then((r) => r[0] ?? null)
      : null,
    o.tipoOrdenId
      ? tx
          .select()
          .from(tiposOrden)
          .where(eq(tiposOrden.id, o.tipoOrdenId))
          .then((r) => r[0] ?? null)
      : null,
    o.plantillaId ? obtenerPlantilla(tx, o.plantillaId) : null,
    tx
      .select({ id: archivosServicio.id, clase: archivosServicio.clase, creado: archivosServicio.creado })
      .from(archivosServicio)
      .where(eq(archivosServicio.ordenId, id))
      .orderBy(asc(archivosServicio.creado)),
    tx
      .select({
        puntaje: encuestas.puntaje,
        nps: encuestas.nps,
        comentario: encuestas.comentario,
        respondida: encuestas.respondida,
        creado: encuestas.creado,
      })
      .from(encuestas)
      .where(eq(encuestas.ordenId, id)),
    correosDe(tx, 'orden_servicio', id),
    etiquetasDeOrdenes(tx, [id]).then((m) => m.get(id) ?? []),
    acompanantesDe(tx, [id]).then((m) => m.get(id) ?? []),
  ])
  return {
    ...o,
    etiquetas,
    acompanantes,
    instrucciones: o.instrucciones as Valores,
    resultados: (o.resultados ?? null) as Valores | null,
    cliente,
    equipo: equipo ?? null,
    tecnico,
    tipoOrden,
    plantilla,
    archivos,
    encuesta: encuesta ?? null,
    avisos,
    visitas,
    items,
    factura: factura ?? null,
  }
}

export async function listarTecnicos(tx: Transaccion) {
  return tx
    .select({
      id: tecnicos.id,
      nombre: tecnicos.nombre,
      jornadaDesde: tecnicos.jornadaDesde,
      jornadaHasta: tecnicos.jornadaHasta,
      dias: tecnicos.dias,
    })
    .from(tecnicos)
    .where(eq(tecnicos.activo, true))
    .orderBy(asc(tecnicos.nombre))
}

/** Equipos instalados de un cliente, para elegir sobre cuál es la orden. */
export async function equiposDelCliente(tx: Transaccion, terceroId: string) {
  return tx
    .select({
      id: equipos.id,
      serie: equipos.serie,
      modelo: modelosEquipo.nombre,
      sector: equipos.sector,
      contratoId: equipos.contratoId,
      garantiaHasta: equipos.garantiaHasta,
    })
    .from(equipos)
    .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
    .where(and(eq(equipos.terceroId, terceroId), eq(equipos.estado, 'instalado')))
    .orderBy(asc(equipos.serie))
}

/**
 * Artículos para cargar en la orden, con el precio en pesos de la lista del
 * cliente (o de la primera lista activa) y el stock total.
 */
export async function articulosParaOrden(tx: Transaccion, ordenId: string, buscar: string, cotizacionDolar: string | null) {
  const q = buscar.trim()
  if (q.length < 2) return []
  const [o] = await tx
    .select({ listaPreciosId: terceros.listaPreciosId })
    .from(ordenesServicio)
    .innerJoin(terceros, eq(terceros.id, ordenesServicio.terceroId))
    .where(eq(ordenesServicio.id, ordenId))
  if (!o) return []
  const listaId =
    o.listaPreciosId ??
    (
      await tx
        .select({ id: listasPrecios.id })
        .from(listasPrecios)
        .where(eq(listasPrecios.activa, true))
        .orderBy(asc(listasPrecios.codigo))
        .limit(1)
    )[0]?.id
  const arts = await tx
    .select({
      id: articulos.id,
      codigo: articulos.codigo,
      nombre: articulos.nombre,
      alicuotaIva: articulos.alicuotaIva,
      llevaStock: articulos.llevaStock,
    })
    .from(articulos)
    .where(
      and(
        eq(articulos.activo, true),
        or(ilike(articulos.nombre, `%${q}%`), ilike(articulos.codigo, `%${q}%`), eq(articulos.codigoBarras, q)),
      ),
    )
    .orderBy(asc(articulos.nombre))
    .limit(12)
  if (!arts.length) return []
  const precios = listaId
    ? await preciosVigentes(
        tx,
        listaId,
        arts.map((a) => a.id),
      )
    : new Map()
  return arts.map((a) => {
    const p = precios.get(a.id)
    let precio: string | null = null
    if (p) {
      try {
        precio = convertir(p.precio, p.moneda, 'PES', cotizacionDolar ?? '0')
      } catch {
        precio = null
      }
    }
    return { ...a, precio }
  })
}

/** Órdenes de un equipo, para su ficha. */
export async function ordenesDelEquipo(tx: Transaccion, equipoId: string) {
  return listarOrdenes(tx, { equipoId, estado: 'todas', limite: 50 })
}

/** El técnico de un usuario: el vinculado, o el que tiene su email (así no hay que vincularlo a mano). */
export async function tecnicoDeUsuario(tx: Transaccion, usuario: { id: string; email: string }) {
  const [t] = await tx
    .select()
    .from(tecnicos)
    .where(
      and(
        eq(tecnicos.activo, true),
        or(eq(tecnicos.usuarioId, usuario.id), sql`lower(${tecnicos.email}) = lower(${usuario.email})`),
      ),
    )
    .orderBy(sql`case when ${tecnicos.usuarioId} = ${usuario.id} then 0 else 1 end`)
    .limit(1)
  return t ?? null
}

/** Agenda del técnico: lo asignado y lo vencido (lo que tiene que hacer), y lo que mandó a revisar hace poco. */
export async function agendaDelTecnico(tx: Transaccion, tecnicoId: string) {
  const [ordenes, acompana] = await Promise.all([
    listarOrdenes(tx, { tecnicoId, incluirAcompanante: true, estado: 'activas', limite: 200 }),
    ordenesComoAcompanante(tx, tecnicoId),
  ])
  return ordenes
    .map((o) => ({ ...o, acompanante: o.tecnicoId !== tecnicoId && acompana.includes(o.id) }))
    .sort(
      (a, b) =>
        (a.programada ?? '9999').localeCompare(b.programada ?? '9999') ||
        (a.hora ?? '99').localeCompare(b.hora ?? '99') ||
        a.numero - b.numero,
    )
}

/** Datos de una orden para la API y los webhooks (sin datos internos de la empresa). */
export async function datosEvento(tx: Transaccion, id: string) {
  const [f] = await tx
    .select({
      o: ordenesServicio,
      cliente: { id: terceros.id, codigo: terceros.codigo, razonSocial: terceros.razonSocial },
      serie: equipos.serie,
      modelo: modelosEquipo.nombre,
      tecnico: tecnicos.nombre,
      tipo: { codigo: tiposOrden.codigo, nombre: tiposOrden.nombre },
    })
    .from(ordenesServicio)
    .innerJoin(terceros, eq(terceros.id, ordenesServicio.terceroId))
    .leftJoin(equipos, eq(equipos.id, ordenesServicio.equipoId))
    .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
    .leftJoin(tecnicos, eq(tecnicos.id, ordenesServicio.tecnicoId))
    .leftJoin(tiposOrden, eq(tiposOrden.id, ordenesServicio.tipoOrdenId))
    .where(eq(ordenesServicio.id, id))
  if (!f) return { id }
  const o = f.o
  return {
    id: o.id,
    numero: o.numero,
    estado: o.estado,
    origen: o.origen,
    clase: o.tipo,
    tipo: f.tipo?.codigo ? f.tipo : null,
    prioridad: o.prioridad,
    cobertura: o.cobertura,
    fecha: o.fecha,
    cliente: f.cliente,
    equipo: f.serie ? { id: o.equipoId, serie: f.serie, modelo: f.modelo } : null,
    falla: o.falla,
    programada: o.programada,
    hora: o.hora,
    duracion: o.duracion,
    tecnico: f.tecnico,
    llegada: o.llegada,
    informada: o.informada,
    cerrada: o.cerrada,
    solucion: o.solucion,
    cierreTecnico: o.cierreTecnico,
    contador: o.contador,
    slaRespuesta: o.slaRespuesta,
    slaResolucion: o.slaResolucion,
    comprobanteId: o.comprobanteId,
    instrucciones: o.instrucciones,
    resultados: o.resultados,
    acompanantes: ((await acompanantesDe(tx, [id])).get(id) ?? []).map((t) => t.nombre),
    etiquetas: ((await etiquetasDeOrdenes(tx, [id])).get(id) ?? []).map((e) => e.nombre),
  }
}
