import { and, asc, desc, eq, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { contratos, equipos, facturacionesContrato, lecturas, modelosEquipo, terceros } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { decimal, opcionalUuid, primerError } from '../comercial/documentos'
import { siguienteNumero } from '../comercial/numeracion'
import { COMERCIALIZACIONES, MODALIDADES } from './tipos'

export { COMERCIALIZACIONES, MODALIDADES } from './tipos'

/** Contratos, equipos (parque instalado) y lecturas de contadores. */

const texto = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)
const fecha = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .pipe(z.iso.date().nullable())
const entero = (mensaje: string) => z.coerce.number({ error: mensaje }).int({ error: mensaje }).min(0, { error: mensaje })

// ---------------------------------------------------------------- Contratos

const EsquemaContrato = z.object({
  terceroId: z.uuid({ error: 'Elegí el cliente.' }),
  tipo: z.string().trim().min(2, { error: 'Escribí el tipo de contrato (por ejemplo, Servicio de fotocopiado).' }),
  modalidad: z.enum(Object.keys(MODALIDADES) as [keyof typeof MODALIDADES, ...(keyof typeof MODALIDADES)[]]),
  facturacion: z.enum(['adelantada', 'vencida']),
  moneda: z.enum(['PES', 'DOL']),
  cargoFijo: decimal('Cargo fijo inválido.').default('0'),
  copiasLibres: entero('Copias libres inválidas.').default(0),
  precioExcedente: decimal('Precio del excedente inválido.').default('0'),
  porEquipo: z.boolean().default(false),
  alicuotaIva: z.coerce.number().default(5),
  leyenda: texto,
  desde: fecha,
  hasta: fecha,
  estado: z.enum(['activo', 'suspendido', 'finalizado']).default('activo'),
  observaciones: texto,
})

export async function guardarContrato(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string) {
  const p = EsquemaContrato.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const d = p.data
  if (d.modalidad === 'cargo_fijo' && Number(d.cargoFijo) <= 0) {
    return { ok: false as const, error: 'Un contrato de cargo fijo necesita el cargo.' }
  }
  if (d.modalidad !== 'cargo_fijo' && Number(d.precioExcedente) <= 0) {
    return { ok: false as const, error: 'Falta el precio de cada copia excedente.' }
  }
  let contratoId = id
  if (id) {
    const [c] = await tx.update(contratos).set(d).where(eq(contratos.id, id)).returning()
    if (!c) return { ok: false as const, error: 'Ese contrato ya no existe.' }
  } else {
    contratoId = (
      await tx
        .insert(contratos)
        .values({ ...d, numero: await siguienteNumero(tx, 'contrato') })
        .returning()
    )[0].id
  }
  await auditar(tx, { usuarioId, accion: id ? 'modificacion' : 'alta', entidad: 'contrato', entidadId: contratoId, despues: d })
  return { ok: true as const, id: contratoId! }
}

export async function listarContratos(tx: Transaccion, filtro: { q?: string; estado?: string } = {}) {
  const q = filtro.q?.trim()
  return tx
    .select({
      id: contratos.id,
      numero: contratos.numero,
      tipo: contratos.tipo,
      modalidad: contratos.modalidad,
      facturacion: contratos.facturacion,
      moneda: contratos.moneda,
      cargoFijo: contratos.cargoFijo,
      copiasLibres: contratos.copiasLibres,
      precioExcedente: contratos.precioExcedente,
      porEquipo: contratos.porEquipo,
      estado: contratos.estado,
      cliente: terceros.razonSocial,
      terceroId: contratos.terceroId,
      equipos: sql<number>`(select count(*)::int from equipos e where e.contrato_id = contratos.id and e.estado = 'instalado')`,
    })
    .from(contratos)
    .innerJoin(terceros, eq(terceros.id, contratos.terceroId))
    .where(
      and(
        filtro.estado ? eq(contratos.estado, filtro.estado) : undefined,
        q ? or(ilike(terceros.razonSocial, `%${q}%`), /^\d+$/.test(q) ? eq(contratos.numero, Number(q)) : undefined) : undefined,
      ),
    )
    .orderBy(asc(terceros.razonSocial), asc(contratos.numero))
}

export async function obtenerContrato(tx: Transaccion, id: string) {
  const [c] = await tx.select().from(contratos).where(eq(contratos.id, id))
  if (!c) return null
  const [[cliente], eqs, facts] = await Promise.all([
    tx.select().from(terceros).where(eq(terceros.id, c.terceroId)),
    equiposConLectura(tx, { contratoId: id }),
    tx
      .select()
      .from(facturacionesContrato)
      .where(eq(facturacionesContrato.contratoId, id))
      .orderBy(desc(facturacionesContrato.periodo))
      .limit(24),
  ])
  return { ...c, cliente, equipos: eqs, facturaciones: facts }
}

// ------------------------------------------------------------------ Equipos

const EsquemaEquipo = z.object({
  serie: z.string().trim().min(3, { error: 'Escribí el número de serie.' }),
  modeloId: opcionalUuid,
  terceroId: opcionalUuid,
  contratoId: opcionalUuid,
  comercializacion: z.enum(Object.keys(COMERCIALIZACIONES) as [string, ...string[]]).default('venta'),
  fechaInstalacion: fecha,
  garantiaHasta: fecha,
  domicilio: texto,
  localidad: texto,
  sector: texto,
  contacto: texto,
  telefono: texto,
  horario: texto,
  ip: texto,
  tecnico: texto,
  contadorInicial: z.coerce.number().int().min(0).default(0),
  observaciones: texto,
})

export async function guardarEquipo(tx: Transaccion, usuarioId: string, entrada: unknown, id?: string) {
  const p = EsquemaEquipo.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const d = p.data
  if (d.contratoId) {
    const [c] = await tx.select().from(contratos).where(eq(contratos.id, d.contratoId))
    if (!c) return { ok: false as const, error: 'Ese contrato ya no existe.' }
    if (d.terceroId && c.terceroId !== d.terceroId) return { ok: false as const, error: 'El contrato es de otro cliente.' }
    d.terceroId = c.terceroId
    d.comercializacion = 'contrato'
  }
  let equipoId = id
  if (id) {
    const [e] = await tx.update(equipos).set(d).where(eq(equipos.id, id)).returning()
    if (!e) return { ok: false as const, error: 'Ese equipo ya no existe.' }
  } else {
    const [repetido] = await tx
      .select({ id: equipos.id })
      .from(equipos)
      .where(and(eq(equipos.serie, d.serie), eq(equipos.estado, 'instalado')))
    if (repetido) return { ok: false as const, error: `Ya hay un equipo instalado con la serie ${d.serie}.` }
    equipoId = (await tx.insert(equipos).values(d).returning())[0].id
  }
  await auditar(tx, { usuarioId, accion: id ? 'modificacion' : 'alta', entidad: 'equipo', entidadId: equipoId, despues: d })
  return { ok: true as const, id: equipoId! }
}

export async function retirarEquipo(tx: Transaccion, usuarioId: string, id: string, fechaRetiro: string, motivo: string | null) {
  const [e] = await tx.select().from(equipos).where(eq(equipos.id, id))
  if (!e) return { ok: false as const, error: 'Ese equipo ya no existe.' }
  if (e.estado === 'retirado') return { ok: false as const, error: 'El equipo ya está retirado.' }
  await tx.update(equipos).set({ estado: 'retirado', fechaRetiro, motivoRetiro: motivo }).where(eq(equipos.id, id))
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'equipo', entidadId: id, despues: { fechaRetiro, motivo } })
  return { ok: true as const }
}

/** Equipos con su última lectura y lo último facturado (para pantallas y para facturar). */
export async function equiposConLectura(
  tx: Transaccion,
  filtro: {
    contratoId?: string
    terceroId?: string
    q?: string
    estado?: string
    ids?: string[]
    enContrato?: boolean
    limite?: number
  },
) {
  const q = filtro.q?.trim()
  return tx
    .select({
      id: equipos.id,
      serie: equipos.serie,
      modelo: modelosEquipo.nombre,
      cliente: terceros.razonSocial,
      terceroId: equipos.terceroId,
      contratoId: equipos.contratoId,
      comercializacion: equipos.comercializacion,
      estado: equipos.estado,
      domicilio: equipos.domicilio,
      localidad: equipos.localidad,
      sector: equipos.sector,
      fechaInstalacion: equipos.fechaInstalacion,
      contadorInicial: equipos.contadorInicial,
      ultimaLectura: sql<
        number | null
      >`(select l.contador from lecturas l where l.equipo_id = equipos.id order by l.fecha desc limit 1)`,
      fechaUltimaLectura: sql<
        string | null
      >`(select l.fecha::text from lecturas l where l.equipo_id = equipos.id order by l.fecha desc limit 1)`,
    })
    .from(equipos)
    .leftJoin(modelosEquipo, eq(modelosEquipo.id, equipos.modeloId))
    .leftJoin(terceros, eq(terceros.id, equipos.terceroId))
    .where(
      and(
        filtro.contratoId ? eq(equipos.contratoId, filtro.contratoId) : undefined,
        filtro.terceroId ? eq(equipos.terceroId, filtro.terceroId) : undefined,
        filtro.estado ? eq(equipos.estado, filtro.estado) : undefined,
        filtro.enContrato ? isNotNull(equipos.contratoId) : undefined,
        filtro.ids ? inArray(equipos.id, filtro.ids.length ? filtro.ids : ['00000000-0000-0000-0000-000000000000']) : undefined,
        q
          ? or(ilike(equipos.serie, `%${q}%`), ilike(terceros.razonSocial, `%${q}%`), ilike(modelosEquipo.nombre, `%${q}%`))
          : undefined,
      ),
    )
    .orderBy(asc(terceros.razonSocial), asc(equipos.serie))
    .limit(filtro.limite ?? 500)
}

export async function obtenerEquipo(tx: Transaccion, id: string) {
  const [e] = await equiposConLectura(tx, { ids: [id] })
  if (!e) return null
  const [[datos], lects] = await Promise.all([
    tx.select().from(equipos).where(eq(equipos.id, id)),
    tx.select().from(lecturas).where(eq(lecturas.equipoId, id)).orderBy(desc(lecturas.fecha)).limit(36),
  ])
  return { ...e, ...datos, modelo: e.modelo, cliente: e.cliente, lecturas: lects }
}

export async function listarModelos(tx: Transaccion) {
  return tx.select().from(modelosEquipo).where(eq(modelosEquipo.activo, true)).orderBy(asc(modelosEquipo.nombre))
}

// ----------------------------------------------------------------- Lecturas

const EsquemaLectura = z.object({
  equipoId: z.uuid(),
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  contador: entero('El contador es un número entero.'),
  creditos: entero('Las copias de prueba son un número entero.').default(0),
})

export async function registrarLectura(
  tx: Transaccion,
  usuarioId: string,
  entrada: unknown,
  origen: 'manual' | 'archivo' | 'mps' = 'manual',
) {
  const p = EsquemaLectura.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const d = p.data
  const [anterior] = await tx
    .select()
    .from(lecturas)
    .where(and(eq(lecturas.equipoId, d.equipoId), sql`${lecturas.fecha} < ${d.fecha}`))
    .orderBy(desc(lecturas.fecha))
    .limit(1)
  if (anterior && d.contador < anterior.contador) {
    return {
      ok: false as const,
      error: `El contador (${d.contador}) es menor que la lectura del ${anterior.fecha} (${anterior.contador}). Si se cambió la placa, cargalo como equipo con contador inicial nuevo.`,
    }
  }
  await tx
    .insert(lecturas)
    .values({ ...d, origen, usuarioId })
    .onConflictDoUpdate({
      target: [lecturas.empresaId, lecturas.equipoId, lecturas.fecha],
      set: { contador: d.contador, creditos: d.creditos, origen, usuarioId },
    })
  return { ok: true as const }
}

/**
 * Lecturas desde un archivo (el que exporta MPS Monitor u otra planilla):
 * se busca cada equipo por su serie. Devuelve cuántas se cargaron y los
 * problemas fila por fila.
 */
export async function importarLecturas(
  tx: Transaccion,
  usuarioId: string,
  filas: { serie: string; fecha: string; contador: number }[],
  origen: 'archivo' | 'mps' = 'archivo',
) {
  const series = [...new Set(filas.map((f) => f.serie.trim().toUpperCase()))]
  const eqs = series.length
    ? await tx
        .select({ id: equipos.id, serie: equipos.serie })
        .from(equipos)
        .where(and(inArray(sql`upper(${equipos.serie})`, series), eq(equipos.estado, 'instalado')))
    : []
  const porSerie = new Map(eqs.map((e) => [e.serie.trim().toUpperCase(), e.id]))
  let cargadas = 0
  const errores: string[] = []
  for (const f of filas) {
    const equipoId = porSerie.get(f.serie.trim().toUpperCase())
    if (!equipoId) {
      errores.push(`${f.serie}: no hay un equipo instalado con esa serie.`)
      continue
    }
    const r = await registrarLectura(tx, usuarioId, { equipoId, fecha: f.fecha, contador: f.contador }, origen)
    if (r.ok) cargadas++
    else errores.push(`${f.serie}: ${r.error}`)
  }
  return { cargadas, errores }
}

/** Suma un equipo instalado del cliente a un contrato, o lo saca (contratoId nulo). */
export async function asignarEquipo(tx: Transaccion, usuarioId: string, equipoId: string, contratoId: string | null) {
  const [e] = await tx.select().from(equipos).where(eq(equipos.id, equipoId))
  if (!e || e.estado !== 'instalado') return { ok: false as const, error: 'Ese equipo no está instalado.' }
  if (contratoId) {
    const [c] = await tx.select().from(contratos).where(eq(contratos.id, contratoId))
    if (!c) return { ok: false as const, error: 'Ese contrato ya no existe.' }
    if (e.terceroId && e.terceroId !== c.terceroId)
      return { ok: false as const, error: 'El equipo está instalado en otro cliente.' }
    await tx
      .update(equipos)
      .set({ contratoId, terceroId: c.terceroId, comercializacion: 'contrato' })
      .where(eq(equipos.id, equipoId))
  } else {
    await tx.update(equipos).set({ contratoId: null, comercializacion: 'venta' }).where(eq(equipos.id, equipoId))
  }
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'equipo', entidadId: equipoId, despues: { contratoId } })
  return { ok: true as const }
}

/**
 * Interpreta la planilla de contadores (la de MPS Monitor u otra): busca las
 * columnas de serie, fecha y contador por el nombre. Sin columna de fecha,
 * usa la que se indique.
 */
export function interpretarLecturas(filas: Record<string, string>[], fechaPorDefecto: string) {
  const errores: string[] = []
  if (!filas.length) return { filas: [], errores: ['El archivo está vacío.'] }
  const columnas = Object.keys(filas[0])
  const buscar = (...nombres: RegExp[]) => columnas.find((c) => nombres.some((n) => n.test(c.trim())))
  const cSerie = buscar(/serie|serial/i)
  const cFecha = buscar(/fecha|date/i)
  const cContador = buscar(/^total$/i, /contador|counter|total/i)
  if (!cSerie || !cContador) {
    return {
      filas: [],
      errores: ['No encontré las columnas de serie y contador (tienen que llamarse "Serie" y "Contador" o "Total").'],
    }
  }
  const salida: { serie: string; fecha: string; contador: number }[] = []
  filas.forEach((f, i) => {
    const serie = (f[cSerie] ?? '').trim()
    if (!serie) return
    const contador = Number((f[cContador] ?? '').replace(/[.\s]/g, '').replace(',', '.'))
    let fecha = cFecha ? (f[cFecha] ?? '').trim().slice(0, 10) : fechaPorDefecto
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(fecha)
    if (dmy) fecha = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) fecha = fechaPorDefecto
    if (!Number.isInteger(contador) || contador < 0) {
      errores.push(`Fila ${i + 2} (${serie}): contador inválido.`)
      return
    }
    salida.push({ serie, fecha, contador })
  })
  return { filas: salida, errores }
}
