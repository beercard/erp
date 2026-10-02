import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, notInArray, or, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import {
  archivosServicio,
  enviosFormulario,
  equipos,
  estadosBandeja,
  formularios,
  modelosEquipo,
  tecnicos,
  terceros,
  usuariosPortal,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { primerError } from '../comercial/documentos'
import { siguienteNumero } from '../comercial/numeracion'
import { emitir } from '../integraciones/webhooks'
import { validarDefinicion, validarValores, type Campo, type Firma, type Valores } from './formularios'

/**
 * Formularios sueltos y bandeja de entrada (como Persat): formularios que no
 * son una orden (un relevamiento, el checklist de la camioneta, un pedido de
 * presupuesto). Los completa la oficina, el técnico desde el celular o el
 * cliente desde el portal; cada envío entra a la bandeja con un estado de
 * color que la empresa define, y se va moviendo hasta un estado final.
 */

const ok = <T extends object>(d: T) => ({ ok: true as const, ...d })
const mal = (error: string) => ({ ok: false as const, error })

// ---------------------------------------------------------------- Estados de la bandeja

const ESTADOS_INICIALES = [
  { nombre: 'Nuevo', color: '#2563eb', orden: 1, inicial: true, final: false },
  { nombre: 'En curso', color: '#d97706', orden: 2, inicial: false, final: false },
  { nombre: 'Resuelto', color: '#059669', orden: 3, inicial: false, final: true },
  { nombre: 'Descartado', color: '#64748b', orden: 4, inicial: false, final: true },
]

/** Los estados de la bandeja (crea los de siempre la primera vez). */
export async function estadosDeBandeja(tx: Transaccion) {
  let lista = await tx.select().from(estadosBandeja).orderBy(asc(estadosBandeja.orden), asc(estadosBandeja.nombre))
  if (!lista.length) {
    await tx.insert(estadosBandeja).values(ESTADOS_INICIALES).onConflictDoNothing()
    lista = await tx.select().from(estadosBandeja).orderBy(asc(estadosBandeja.orden), asc(estadosBandeja.nombre))
  }
  return lista
}

const EsquemaEstado = z.object({
  nombre: z.string().trim().min(2, { error: 'Escribí el nombre del estado.' }).max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, { error: 'Color inválido.' }),
  orden: z.coerce.number().int().min(0).max(99).default(0),
  final: z.boolean().default(false),
  inicial: z.boolean().default(false),
})

export async function guardarEstado(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string) {
  const p = EsquemaEstado.safeParse(entrada)
  if (!p.success) return mal(primerError(p.error))
  const d = p.data
  if (d.inicial && d.final) return mal('El estado con el que entran los envíos no puede ser final.')
  const [mismo] = await tx.select({ id: estadosBandeja.id }).from(estadosBandeja).where(eq(estadosBandeja.nombre, d.nombre))
  if (mismo && mismo.id !== id) return mal('Ya hay un estado con ese nombre.')
  // Uno solo es el inicial.
  if (d.inicial) await tx.update(estadosBandeja).set({ inicial: false })
  let estadoId = id
  if (id) {
    const [e] = await tx.update(estadosBandeja).set(d).where(eq(estadosBandeja.id, id)).returning({ id: estadosBandeja.id })
    if (!e) return mal('Ese estado ya no existe.')
  } else {
    ;[{ id: estadoId }] = await tx.insert(estadosBandeja).values(d).returning({ id: estadosBandeja.id })
  }
  await auditar(tx, {
    usuarioId,
    accion: id ? 'modificacion' : 'alta',
    entidad: 'estado_bandeja',
    entidadId: estadoId,
    despues: d,
  })
  return ok({ id: estadoId! })
}

export async function borrarEstado(tx: Transaccion, usuarioId: string, id: string) {
  const [usado] = await tx
    .select({ id: enviosFormulario.id })
    .from(enviosFormulario)
    .where(eq(enviosFormulario.estadoId, id))
    .limit(1)
  if (usado) return mal('Hay envíos en ese estado: pasalos a otro antes de borrarlo.')
  const [e] = await tx.delete(estadosBandeja).where(eq(estadosBandeja.id, id)).returning()
  if (!e) return mal('Ese estado ya no existe.')
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'estado_bandeja', entidadId: id, antes: e })
  return ok({})
}

// ---------------------------------------------------------------- Formularios

const EsquemaFormulario = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{1,12}$/, { error: 'El código va con letras y números, hasta 12.' }),
  nombre: z.string().trim().min(3, { error: 'Escribí el nombre del formulario.' }).max(80),
  descripcion: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, { error: 'Color inválido.' })
    .default('#2563eb'),
  pideCliente: z.boolean().default(true),
  tecnico: z.boolean().default(true),
  portal: z.boolean().default(false),
  activo: z.boolean().default(true),
  campos: z.array(z.any()),
})

/** Crea o modifica un formulario. Si cambian los campos sube la versión (los envíos guardan la suya). */
export async function guardarFormulario(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string) {
  const p = EsquemaFormulario.safeParse(entrada)
  if (!p.success) return mal(primerError(p.error))
  const d = p.data
  const problema = validarDefinicion(d.campos, 'suelto')
  if (problema) return mal(problema)
  if (!d.campos.some((c: Campo) => c.tipo !== 'seccion' && c.tipo !== 'estatico'))
    return mal('El formulario necesita al menos un campo.')
  if (d.portal && !d.pideCliente) return mal('Para usarlo en el portal tiene que pedir el cliente.')
  if ((d.campos as Campo[]).some((c) => c.tipo === 'equipo') && !d.pideCliente)
    return mal('Para elegir un equipo, el formulario tiene que pedir el cliente.')
  const [mismo] = await tx.select({ id: formularios.id }).from(formularios).where(eq(formularios.codigo, d.codigo))
  if (mismo && mismo.id !== id) return mal('Ya hay un formulario con ese código.')
  let formularioId = id
  let version = 1
  if (id) {
    const [f] = await tx.select().from(formularios).where(eq(formularios.id, id)).for('update')
    if (!f) return mal('Ese formulario ya no existe.')
    version = JSON.stringify(f.campos) === JSON.stringify(d.campos) ? f.version : f.version + 1
    await tx
      .update(formularios)
      .set({ ...d, version })
      .where(eq(formularios.id, id))
  } else {
    ;[{ id: formularioId }] = await tx.insert(formularios).values(d).returning({ id: formularios.id })
  }
  await auditar(tx, {
    usuarioId,
    accion: id ? 'modificacion' : 'alta',
    entidad: 'formulario',
    entidadId: formularioId,
    despues: { ...d, campos: undefined, version },
  })
  return ok({ id: formularioId!, version })
}

export type Quien = 'oficina' | 'tecnico' | 'portal'

export async function listarFormularios(tx: Transaccion, para?: Quien) {
  const filtro =
    para === 'tecnico'
      ? and(eq(formularios.activo, true), eq(formularios.tecnico, true))
      : para === 'portal'
        ? and(eq(formularios.activo, true), eq(formularios.portal, true))
        : para === 'oficina'
          ? eq(formularios.activo, true)
          : undefined
  const lista = await tx.select().from(formularios).where(filtro).orderBy(asc(formularios.nombre))
  return lista.map((f) => ({ ...f, campos: f.campos as Campo[] }))
}

export async function obtenerFormulario(tx: Transaccion, id: string) {
  const [f] = await tx.select().from(formularios).where(eq(formularios.id, id))
  return f ? { ...f, campos: f.campos as Campo[] } : null
}

/** Formularios de ejemplo (los de Persat para un service de fotocopiadoras). */
export const MODELOS_SUELTOS: {
  codigo: string
  nombre: string
  descripcion: string
  tecnico: boolean
  portal: boolean
  pideCliente: boolean
  campos: Campo[]
}[] = [
  {
    codigo: 'RELEV',
    nombre: 'Relevamiento de equipos',
    descripcion: 'Visita comercial o técnica para relevar el parque del cliente y armar una propuesta.',
    tecnico: true,
    portal: false,
    pideCliente: true,
    campos: [
      { id: 'contacto', tipo: 'texto', etiqueta: 'Quién nos atendió' },
      {
        id: 'equipos',
        tipo: 'tabla',
        etiqueta: 'Equipos que tiene',
        columnas: [
          { id: 'marca', etiqueta: 'Marca y modelo', tipo: 'texto' },
          { id: 'copias', etiqueta: 'Copias por mes', tipo: 'numero' },
          { id: 'propio', etiqueta: 'Propio o alquilado', tipo: 'seleccion', opciones: ['Propio', 'Alquilado'] },
        ],
      },
      { id: 'color', tipo: 'si_no', etiqueta: '¿Necesita color?' },
      { id: 'interes', tipo: 'seleccion', etiqueta: 'Interés', opciones: ['Alto', 'Medio', 'Bajo'], requerido: true },
      { id: 'fotos', tipo: 'fotos', etiqueta: 'Fotos del lugar', maximo: 5 },
      { id: 'notas', tipo: 'parrafo', etiqueta: 'Observaciones' },
    ],
  },
  {
    codigo: 'VEHIC',
    nombre: 'Control de la camioneta',
    descripcion: 'Checklist semanal del vehículo del técnico.',
    tecnico: true,
    portal: false,
    pideCliente: false,
    campos: [
      { id: 'km', tipo: 'numero', etiqueta: 'Kilómetros', requerido: true },
      {
        id: 'combustible',
        tipo: 'seleccion',
        etiqueta: 'Combustible',
        opciones: ['Lleno', '3/4', '1/2', '1/4', 'Reserva'],
        requerido: true,
      },
      {
        id: 'controles',
        tipo: 'multiple',
        etiqueta: 'Está en condiciones',
        opciones: ['Luces', 'Cubiertas', 'Matafuego', 'Botiquín', 'Documentación'],
      },
      { id: 'problema', tipo: 'si_no', etiqueta: '¿Hay algún problema?', requerido: true },
      { id: 'cual', tipo: 'parrafo', etiqueta: '¿Cuál?', requerido: true, si: { campo: 'problema', valor: 'Sí' } },
      { id: 'fotos', tipo: 'fotos', etiqueta: 'Fotos', maximo: 4, si: { campo: 'problema', valor: 'Sí' } },
    ],
  },
  {
    codigo: 'PRESUP',
    nombre: 'Pedido de presupuesto',
    descripcion: 'El cliente pide precio por un equipo, insumos o un servicio.',
    tecnico: false,
    portal: true,
    pideCliente: true,
    campos: [
      {
        id: 'que',
        tipo: 'seleccion',
        etiqueta: '¿Qué necesitás?',
        opciones: ['Un equipo nuevo', 'Insumos', 'Un servicio', 'Otra cosa'],
        requerido: true,
      },
      { id: 'equipo', tipo: 'equipo', etiqueta: 'Para qué equipo', si: { campo: 'que', valor: 'Insumos' } },
      { id: 'detalle', tipo: 'parrafo', etiqueta: 'Contanos el detalle', requerido: true },
      { id: 'urgencia', tipo: 'seleccion', etiqueta: '¿Para cuándo?', opciones: ['Esta semana', 'Este mes', 'Sin apuro'] },
    ],
  },
]

export async function crearModelosSueltos(tx: Transaccion, usuarioId: string) {
  let creados = 0
  for (const m of MODELOS_SUELTOS) {
    const [ya] = await tx.select({ id: formularios.id }).from(formularios).where(eq(formularios.codigo, m.codigo))
    if (ya) continue
    const r = await guardarFormulario(tx, usuarioId, m)
    if (r.ok) creados++
  }
  return creados
}

// ---------------------------------------------------------------- Envíos

export type Autor =
  | { quien: 'oficina'; usuarioId: string }
  | { quien: 'tecnico'; usuarioId: string; tecnicoId: string }
  | { quien: 'portal'; usuarioPortalId: string; terceroId: string }

const puedeUsar = (f: { activo: boolean; tecnico: boolean; portal: boolean }, a: Autor) =>
  f.activo && (a.quien === 'oficina' || (a.quien === 'tecnico' && f.tecnico) || (a.quien === 'portal' && f.portal))

/** Empieza un envío (borrador): así las fotos y la firma ya tienen dónde subirse. */
export async function empezarEnvio(
  tx: Transaccion,
  formularioId: string,
  autor: Autor,
  extra: { terceroId?: string | null; ordenId?: string | null } = {},
) {
  const f = await obtenerFormulario(tx, formularioId)
  if (!f || !puedeUsar(f, autor)) return mal('Ese formulario no está disponible.')
  const [e] = await tx
    .insert(enviosFormulario)
    .values({
      formularioId,
      version: f.version,
      campos: f.campos,
      origen: autor.quien,
      usuarioId: autor.quien === 'portal' ? null : autor.usuarioId,
      tecnicoId: autor.quien === 'tecnico' ? autor.tecnicoId : null,
      usuarioPortalId: autor.quien === 'portal' ? autor.usuarioPortalId : null,
      terceroId: autor.quien === 'portal' ? autor.terceroId : f.pideCliente ? (extra.terceroId ?? null) : null,
      ordenId: extra.ordenId ?? null,
    })
    .returning({ id: enviosFormulario.id })
  return ok({ id: e.id })
}

/** El borrador de quien lo empezó (o null). La oficina puede ver los suyos y los de los técnicos no. */
export async function borradorDe(tx: Transaccion, id: string, autor: Autor) {
  const [e] = await tx
    .select()
    .from(enviosFormulario)
    .where(and(eq(enviosFormulario.id, id), isNull(enviosFormulario.enviado)))
  if (!e) return null
  const suyo =
    autor.quien === 'portal'
      ? e.usuarioPortalId === autor.usuarioPortalId && e.terceroId === autor.terceroId
      : e.origen === autor.quien && e.usuarioId === autor.usuarioId
  if (!suyo) return null
  const [f] = await tx.select().from(formularios).where(eq(formularios.id, e.formularioId))
  const [cliente] = e.terceroId
    ? await tx.select({ id: terceros.id, razonSocial: terceros.razonSocial }).from(terceros).where(eq(terceros.id, e.terceroId))
    : []
  return {
    ...e,
    campos: e.campos as Campo[],
    valores: e.valores as Valores,
    formulario: { nombre: f.nombre, descripcion: f.descripcion, pideCliente: f.pideCliente, color: f.color },
    cliente: cliente ?? null,
  }
}

const EsquemaEnvio = z.object({
  terceroId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null),
  valores: z.record(z.string(), z.unknown()).default({}),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
})

/** Ids de las fotos y la firma que trae la respuesta. */
function archivosDe(campos: Campo[], valores: Valores) {
  const ids: string[] = []
  for (const c of campos) {
    const v = valores[c.id]
    if (c.tipo === 'fotos' && Array.isArray(v)) ids.push(...(v as string[]))
    if (c.tipo === 'firma' && v && typeof v === 'object') ids.push((v as Firma).archivoId)
  }
  return ids
}

/** Manda el formulario: valida, le da número y lo pone en el estado inicial de la bandeja. */
export async function enviarFormulario(tx: Transaccion, id: string, autor: Autor, entrada: unknown) {
  const b = await borradorDe(tx, id, autor)
  if (!b) return mal('Ese formulario ya se envió o no existe.')
  const p = EsquemaEnvio.safeParse(entrada)
  if (!p.success) return mal(primerError(p.error))
  const terceroId = autor.quien === 'portal' ? autor.terceroId : b.formulario.pideCliente ? p.data.terceroId : null
  if (b.formulario.pideCliente && !terceroId) return mal('Elegí el cliente.')
  if (terceroId && autor.quien !== 'portal') {
    const [c] = await tx.select({ id: terceros.id }).from(terceros).where(eq(terceros.id, terceroId))
    if (!c) return mal('El cliente no existe.')
  }
  const v = validarValores(b.campos, p.data.valores)
  if (!v.ok) return mal(v.error)

  // El equipo tiene que ser del cliente; las fotos y la firma, de este envío.
  const campoEquipo = b.campos.find((c) => c.tipo === 'equipo')
  const equipoId = campoEquipo ? ((v.valores[campoEquipo.id] as string | undefined) ?? null) : null
  if (equipoId) {
    const [e] = await tx
      .select({ id: equipos.id })
      .from(equipos)
      .where(and(eq(equipos.id, equipoId), terceroId ? eq(equipos.terceroId, terceroId) : sql`false`))
    if (!e) return mal('El equipo elegido no es de ese cliente.')
  }
  const ids = archivosDe(b.campos, v.valores)
  if (ids.length) {
    const propios = await tx
      .select({ id: archivosServicio.id })
      .from(archivosServicio)
      .where(and(eq(archivosServicio.envioId, id), inArray(archivosServicio.id, ids)))
    if (propios.length !== new Set(ids).size) return mal('Hay fotos que no son de este formulario: sacalas y volvé a subirlas.')
  }
  // Las que subió y después sacó, no quedan.
  await tx
    .delete(archivosServicio)
    .where(and(eq(archivosServicio.envioId, id), ids.length ? notInArray(archivosServicio.id, ids) : undefined))

  const estados = await estadosDeBandeja(tx)
  const inicial = estados.find((e) => e.inicial) ?? estados.find((e) => !e.final)
  const numero = await siguienteNumero(tx, 'formulario')
  const enviado = new Date()
  const lat = p.data.lat ?? null
  const lng = p.data.lng ?? null
  await tx
    .update(enviosFormulario)
    .set({
      numero,
      enviado,
      terceroId,
      equipoId,
      valores: v.valores,
      estadoId: inicial?.id ?? null,
      lat: lat === null || lng === null ? null : lat.toFixed(6),
      lng: lat === null || lng === null ? null : lng.toFixed(6),
    })
    .where(eq(enviosFormulario.id, id))
  await auditar(tx, {
    usuarioId: autor.quien === 'portal' ? autor.usuarioPortalId : autor.usuarioId,
    accion: 'alta',
    entidad: 'envio_formulario',
    entidadId: id,
    despues: { numero, origen: autor.quien },
  })
  await emitir(tx, 'formulario.enviado', await datosEnvio(tx, id))
  return ok({ id, numero })
}

/** Descarta un borrador (con sus fotos). */
export async function descartarBorrador(tx: Transaccion, id: string, autor: Autor) {
  const b = await borradorDe(tx, id, autor)
  if (!b) return mal('Ese borrador ya no existe.')
  await tx.delete(enviosFormulario).where(eq(enviosFormulario.id, id))
  return ok({})
}

/** Guarda lo que va completando (para no perderlo si se cierra la pantalla). */
export async function guardarBorrador(tx: Transaccion, id: string, autor: Autor, valores: unknown, terceroId?: string | null) {
  const b = await borradorDe(tx, id, autor)
  if (!b) return mal('Ese borrador ya no existe.')
  if (!valores || typeof valores !== 'object' || JSON.stringify(valores).length > 200_000) return mal('Respuestas inválidas.')
  await tx
    .update(enviosFormulario)
    .set({
      valores,
      ...(autor.quien !== 'portal' && b.formulario.pideCliente && terceroId !== undefined
        ? { terceroId: terceroId || null }
        : {}),
    })
    .where(eq(enviosFormulario.id, id))
  return ok({})
}

/** Resumen de un envío para los webhooks y la API. */
export async function datosEnvio(tx: Transaccion, id: string) {
  const [r] = await tx
    .select({
      e: enviosFormulario,
      formulario: { codigo: formularios.codigo, nombre: formularios.nombre },
      estado: estadosBandeja.nombre,
      cliente: { id: terceros.id, codigo: terceros.codigo, razonSocial: terceros.razonSocial },
      serie: equipos.serie,
    })
    .from(enviosFormulario)
    .innerJoin(formularios, eq(formularios.id, enviosFormulario.formularioId))
    .leftJoin(estadosBandeja, eq(estadosBandeja.id, enviosFormulario.estadoId))
    .leftJoin(terceros, eq(terceros.id, enviosFormulario.terceroId))
    .leftJoin(equipos, eq(equipos.id, enviosFormulario.equipoId))
    .where(eq(enviosFormulario.id, id))
  return {
    id,
    numero: r.e.numero,
    formulario: r.formulario,
    origen: r.e.origen,
    estado: r.estado,
    enviado: r.e.enviado,
    cliente: r.cliente?.id ? r.cliente : null,
    equipo: r.serie,
    valores: r.e.valores,
  }
}

// ---------------------------------------------------------------- Bandeja

export type FiltroBandeja = { estado?: string; formulario?: string; q?: string; terceroId?: string; limite?: number }

/** La bandeja de entrada: "pendientes" son los que no están en un estado final. */
export async function bandeja(tx: Transaccion, f: FiltroBandeja = {}) {
  const q = f.q?.trim()
  const estados = await estadosDeBandeja(tx)
  const estado =
    f.estado === 'todos'
      ? undefined
      : f.estado && f.estado !== 'pendientes'
        ? eq(enviosFormulario.estadoId, f.estado)
        : or(
            isNull(enviosFormulario.estadoId),
            inArray(
              enviosFormulario.estadoId,
              estados
                .filter((e) => !e.final)
                .map((e) => e.id)
                .concat('00000000-0000-0000-0000-000000000000'),
            ),
          )
  const filas = await tx
    .select({
      id: enviosFormulario.id,
      numero: enviosFormulario.numero,
      enviado: enviosFormulario.enviado,
      origen: enviosFormulario.origen,
      estadoId: enviosFormulario.estadoId,
      formulario: formularios.nombre,
      color: formularios.color,
      cliente: terceros.razonSocial,
      serie: equipos.serie,
      tecnico: tecnicos.nombre,
      portal: usuariosPortal.email,
      nota: enviosFormulario.nota,
    })
    .from(enviosFormulario)
    .innerJoin(formularios, eq(formularios.id, enviosFormulario.formularioId))
    .leftJoin(terceros, eq(terceros.id, enviosFormulario.terceroId))
    .leftJoin(equipos, eq(equipos.id, enviosFormulario.equipoId))
    .leftJoin(tecnicos, eq(tecnicos.id, enviosFormulario.tecnicoId))
    .leftJoin(usuariosPortal, eq(usuariosPortal.id, enviosFormulario.usuarioPortalId))
    .where(
      and(
        isNotNull(enviosFormulario.enviado),
        estado,
        f.formulario ? eq(enviosFormulario.formularioId, f.formulario) : undefined,
        f.terceroId ? eq(enviosFormulario.terceroId, f.terceroId) : undefined,
        q
          ? or(
              ilike(terceros.razonSocial, `%${q}%`),
              ilike(formularios.nombre, `%${q}%`),
              ilike(equipos.serie, `%${q}%`),
              /^\d+$/.test(q) ? eq(enviosFormulario.numero, Number(q)) : undefined,
            )
          : undefined,
      ),
    )
    .orderBy(desc(enviosFormulario.enviado))
    .limit(f.limite ?? 200)
  const porId = new Map(estados.map((e) => [e.id, e]))
  return { estados, envios: filas.map((x) => ({ ...x, estado: x.estadoId ? (porId.get(x.estadoId) ?? null) : null })) }
}

export async function obtenerEnvio(tx: Transaccion, id: string) {
  const [r] = await tx
    .select({
      e: enviosFormulario,
      formulario: { id: formularios.id, nombre: formularios.nombre, codigo: formularios.codigo, color: formularios.color },
      cliente: { id: terceros.id, razonSocial: terceros.razonSocial, telefono: terceros.telefono, email: terceros.email },
      equipo: { id: equipos.id, serie: equipos.serie, modelo: modelosEquipo.nombre },
      tecnico: tecnicos.nombre,
      portal: { email: usuariosPortal.email, nombre: usuariosPortal.nombre },
    })
    .from(enviosFormulario)
    .innerJoin(formularios, eq(formularios.id, enviosFormulario.formularioId))
    .leftJoin(terceros, eq(terceros.id, enviosFormulario.terceroId))
    .leftJoin(equipos, eq(equipos.id, enviosFormulario.equipoId))
    .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
    .leftJoin(tecnicos, eq(tecnicos.id, enviosFormulario.tecnicoId))
    .leftJoin(usuariosPortal, eq(usuariosPortal.id, enviosFormulario.usuarioPortalId))
    .where(and(eq(enviosFormulario.id, id), isNotNull(enviosFormulario.enviado)))
  if (!r) return null
  const estados = await estadosDeBandeja(tx)
  return {
    ...r.e,
    campos: r.e.campos as Campo[],
    valores: r.e.valores as Valores,
    formulario: r.formulario,
    cliente: r.cliente?.id
      ? (r.cliente as { id: string; razonSocial: string; telefono: string | null; email: string | null })
      : null,
    equipo: r.equipo?.id ? (r.equipo as { id: string; serie: string; modelo: string | null }) : null,
    tecnico: r.tecnico,
    portal: r.portal?.email ? r.portal : null,
    estado: estados.find((e) => e.id === r.e.estadoId) ?? null,
    estados,
  }
}

const EsquemaCambio = z.object({
  estadoId: z.uuid({ error: 'Elegí el estado.' }),
  nota: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => v || null),
})

/** Mueve el envío de estado en la bandeja (y guarda la nota interna). */
export async function cambiarEstadoEnvio(tx: Transaccion, usuarioId: string, id: string, entrada: unknown) {
  const p = EsquemaCambio.safeParse(entrada)
  if (!p.success) return mal(primerError(p.error))
  const [estado] = await tx.select().from(estadosBandeja).where(eq(estadosBandeja.id, p.data.estadoId))
  if (!estado) return mal('Ese estado no existe.')
  const [antes] = await tx
    .select()
    .from(enviosFormulario)
    .where(and(eq(enviosFormulario.id, id), isNotNull(enviosFormulario.enviado)))
  if (!antes) return mal('Ese envío no existe.')
  await tx.update(enviosFormulario).set({ estadoId: estado.id, nota: p.data.nota }).where(eq(enviosFormulario.id, id))
  await auditar(tx, {
    usuarioId,
    accion: 'modificacion',
    entidad: 'envio_formulario',
    entidadId: id,
    antes: { estadoId: antes.estadoId, nota: antes.nota },
    despues: { estadoId: estado.id, nota: p.data.nota },
  })
  return ok({})
}

/** Lo que mandó un cliente desde el portal (para mostrarle el estado). */
export async function enviosDelCliente(tx: Transaccion, terceroId: string) {
  const r = await bandeja(tx, { estado: 'todos', terceroId, limite: 50 })
  return r.envios.filter((e) => e.origen === 'portal')
}

/** Cuántos pendientes hay en la bandeja (para el menú y el tablero). */
export async function pendientesBandeja(tx: Transaccion) {
  const estados = await estadosDeBandeja(tx)
  const finales = estados.filter((e) => e.final).map((e) => e.id)
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(enviosFormulario)
    .where(
      and(
        isNotNull(enviosFormulario.enviado),
        finales.length ? or(isNull(enviosFormulario.estadoId), notInArray(enviosFormulario.estadoId, finales)) : undefined,
      ),
    )
  return r.n
}
