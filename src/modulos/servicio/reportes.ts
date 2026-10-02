import { and, asc, eq, gte, isNotNull, lt, lte } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import {
  enviosFormulario,
  equipos,
  estadosBandeja,
  formularios,
  ordenesServicio,
  plantillasOrden,
  tecnicos,
  terceros,
  tiposOrden,
} from '../../db/schema'
import type { Celda, Hoja } from '../../lib/xlsx'
import { textoDe, type Campo, type Material, type Valores } from './formularios'
import { diaArgentina } from './jornada'
import { CIERRES, ESTADOS_ORDEN } from './tipos'

/**
 * Reportes por formulario (como los de Persat): una fila por orden o por
 * envío y una columna por campo. Si el formulario cambió de versión, van las
 * columnas de todas las versiones (un campo se reconoce por su
 * identificador; el título es el de la versión más nueva).
 */

const SIN_COLUMNA: Campo['tipo'][] = ['seccion', 'estatico']

/** Columnas de varias versiones de un formulario, sin repetir y en orden. */
export function columnas(versiones: Campo[][]): Campo[] {
  const porId = new Map<string, Campo>()
  // De la más nueva a la más vieja: el título que queda es el más nuevo; los campos que ya no están van al final.
  for (const campos of [...versiones].reverse())
    for (const c of campos) if (!SIN_COLUMNA.includes(c.tipo) && !porId.has(c.id)) porId.set(c.id, c)
  return [...porId.values()]
}

/** Valor de la celda: números como números; lo demás, como texto legible. */
export function celda(c: Campo, v: unknown, equipos?: Map<string, string>): Celda {
  if (v === undefined || v === null || v === '') return null
  switch (c.tipo) {
    case 'numero': {
      const n = Number(String(v).replace(',', '.'))
      return Number.isFinite(n) ? n : String(v)
    }
    case 'contador':
      return (v as { contador: number }).contador
    case 'si_no':
    case 'texto':
    case 'parrafo':
    case 'seleccion':
    case 'link':
    case 'hora':
      return String(v)
    case 'fecha':
      return String(v)
    case 'equipo':
      return equipos?.get(String(v)) ?? String(v)
    case 'tabla':
      return (v as string[][]).map((fila) => fila.join(' · ')).join('\n')
    case 'materiales':
      return (v as Material[]).map((m) => `${m.cantidad.replace('.', ',')} × ${m.descripcion}`).join('\n')
    default:
      return textoDe(c, v) || null
  }
}

const fechaHora = (d: Date | null) =>
  d
    ? d.toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        dateStyle: 'short',
        timeStyle: 'short',
        hour12: false,
      })
    : null

/** Órdenes de un tipo entre dos fechas (de apertura): instrucciones y devolución, columna por campo. */
export async function reporteTipoOrden(tx: Transaccion, tipoId: string, desde: string, hasta: string): Promise<Hoja | null> {
  const [tipo] = await tx.select().from(tiposOrden).where(eq(tiposOrden.id, tipoId))
  if (!tipo) return null
  const versiones = await tx
    .select()
    .from(plantillasOrden)
    .where(eq(plantillasOrden.tipoId, tipoId))
    .orderBy(asc(plantillasOrden.version))
  const instrucciones = columnas(versiones.map((v) => v.instrucciones as Campo[])).filter((c) => c.tipo !== 'equipo')
  const devolucion = columnas(versiones.map((v) => v.devolucion as Campo[]))
  const filas = await tx
    .select({
      o: ordenesServicio,
      cliente: terceros.razonSocial,
      serie: equipos.serie,
      tecnico: tecnicos.nombre,
    })
    .from(ordenesServicio)
    .innerJoin(terceros, eq(terceros.id, ordenesServicio.terceroId))
    .leftJoin(equipos, eq(equipos.id, ordenesServicio.equipoId))
    .leftJoin(tecnicos, eq(tecnicos.id, ordenesServicio.tecnicoId))
    .where(and(eq(ordenesServicio.tipoOrdenId, tipoId), gte(ordenesServicio.fecha, desde), lte(ordenesServicio.fecha, hasta)))
    .orderBy(asc(ordenesServicio.numero))
  const titulos: Celda[] = [
    'N°',
    'Fecha',
    'Cliente',
    'Equipo',
    'Técnico',
    'Estado',
    'Programada',
    'Llegada',
    'Informada',
    'Cierre del técnico',
    'Falla',
    'Solución',
    ...instrucciones.map((c) => c.etiqueta),
    ...devolucion.map((c) => c.etiqueta),
  ]
  return {
    nombre: tipo.nombre,
    filas: [
      titulos,
      ...filas.map(({ o, cliente, serie, tecnico }) => {
        const ins = (o.instrucciones ?? {}) as Valores
        const dev = (o.resultados ?? {}) as Valores
        return [
          o.numero,
          o.fecha,
          cliente,
          serie,
          tecnico,
          ESTADOS_ORDEN[o.estado as keyof typeof ESTADOS_ORDEN] ?? o.estado,
          o.programada ? `${o.programada}${o.hora ? ` ${o.hora}` : ''}` : null,
          fechaHora(o.llegada),
          fechaHora(o.informada),
          o.cierreTecnico ? (CIERRES[o.cierreTecnico as keyof typeof CIERRES] ?? o.cierreTecnico) : null,
          o.falla,
          o.solucion,
          ...instrucciones.map((c) => celda(c, ins[c.id])),
          ...devolucion.map((c) => celda(c, dev[c.id])),
        ]
      }),
    ],
  }
}

/** Envíos de un formulario suelto entre dos fechas (de envío). */
export async function reporteFormulario(
  tx: Transaccion,
  formularioId: string,
  desde: string,
  hasta: string,
): Promise<Hoja | null> {
  const [f] = await tx.select().from(formularios).where(eq(formularios.id, formularioId))
  if (!f) return null
  const filas = await tx
    .select({
      e: enviosFormulario,
      cliente: terceros.razonSocial,
      serie: equipos.serie,
      tecnico: tecnicos.nombre,
      estado: estadosBandeja.nombre,
    })
    .from(enviosFormulario)
    .leftJoin(terceros, eq(terceros.id, enviosFormulario.terceroId))
    .leftJoin(equipos, eq(equipos.id, enviosFormulario.equipoId))
    .leftJoin(tecnicos, eq(tecnicos.id, enviosFormulario.tecnicoId))
    .leftJoin(estadosBandeja, eq(estadosBandeja.id, enviosFormulario.estadoId))
    .where(
      and(
        eq(enviosFormulario.formularioId, formularioId),
        isNotNull(enviosFormulario.enviado),
        gte(enviosFormulario.enviado, diaArgentina(desde).desde),
        lt(enviosFormulario.enviado, diaArgentina(hasta).hasta),
      ),
    )
    .orderBy(asc(enviosFormulario.numero))
  // Las versiones que de verdad se usaron (cada envío guarda la suya), más la actual.
  const porVersion = new Map<number, Campo[]>([[f.version, f.campos as Campo[]]])
  for (const { e } of filas) if (!porVersion.has(e.version)) porVersion.set(e.version, e.campos as Campo[])
  const cols = columnas([...porVersion.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c)).filter(
    (c) => c.tipo !== 'equipo',
  )
  const ORIGEN: Record<string, string> = { oficina: 'Oficina', tecnico: 'Técnico', portal: 'Portal' }
  return {
    nombre: f.nombre,
    filas: [
      [
        'N°',
        'Enviado',
        'De',
        'Técnico',
        'Cliente',
        'Equipo',
        'Estado',
        'Nota interna',
        'Latitud',
        'Longitud',
        ...cols.map((c) => c.etiqueta),
      ],
      ...filas.map(({ e, cliente, serie, tecnico, estado }) => {
        const v = (e.valores ?? {}) as Valores
        return [
          e.numero,
          fechaHora(e.enviado),
          ORIGEN[e.origen] ?? e.origen,
          tecnico,
          cliente,
          serie,
          estado,
          e.nota,
          e.lat === null ? null : Number(e.lat),
          e.lng === null ? null : Number(e.lng),
          ...cols.map((c) => celda(c, v[c.id])),
        ]
      }),
    ],
  }
}
