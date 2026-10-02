import { asc, eq } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import {
  condicionesPago,
  depositos,
  listasPrecios,
  marcas,
  monedas,
  puntosVenta,
  rubros,
  tecnicos,
  transportes,
  vendedores,
  zonas,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { normalizarNumero } from '../../lib/dinero'
import { validarCuit } from '../../lib/cuit'

/**
 * Maestros simples de la empresa, definidos como configuración: una sola
 * pantalla y un solo motor de alta y modificación sirven para todos. Cada
 * definición dice qué campos tiene, cómo se validan y de dónde salen las
 * opciones de los desplegables.
 */

type Opcion = { valor: string; texto: string }

export type CampoCatalogo = {
  nombre: string
  etiqueta: string
  tipo: 'texto' | 'numero' | 'booleano' | 'seleccion' | 'fecha'
  requerido?: boolean
  ayuda?: string
  /** Opciones fijas o una consulta (para referencias a otras tablas). */
  opciones?: Opcion[] | ((tx: Transaccion, idPropio?: string) => Promise<Opcion[]>)
  /** Validación extra con mensaje para el usuario. */
  validar?: (valor: unknown) => string | null
  enListado?: boolean
}

export type DefinicionCatalogo = {
  clave: string
  titulo: string
  singular: string
  descripcion: string
  tabla: PgTable
  id: PgColumn
  orden: PgColumn
  /** Columna de activo/activa: se da de baja sin borrar. */
  activo: PgColumn
  nombreActivo: 'activo' | 'activa'
  campos: CampoCatalogo[]
  /** Restricción única → mensaje cuando choca. */
  duplicado?: { indice: string; mensaje: string }
}

const numeroPositivo = (v: unknown) =>
  v === null || v === undefined || v === '' || Number(v) >= 0 ? null : 'Tiene que ser cero o más.'

async function opcionesDe(tx: Transaccion, tabla: PgTable, id: PgColumn, texto: PgColumn, excluir?: string) {
  const filas = (await tx.select({ valor: id, texto }).from(tabla).orderBy(asc(texto))) as { valor: string; texto: string }[]
  return filas.filter((f) => f.valor !== excluir)
}

export const CATALOGOS: DefinicionCatalogo[] = [
  {
    clave: 'depositos',
    titulo: 'Depósitos',
    singular: 'depósito',
    descripcion: 'Lugares donde hay stock. Cada punto de venta descuenta de un depósito.',
    tabla: depositos,
    id: depositos.id,
    orden: depositos.codigo,
    activo: depositos.activo,
    nombreActivo: 'activo',
    duplicado: { indice: 'depositos_empresa_id_codigo', mensaje: 'Ya hay un depósito con ese código.' },
    campos: [
      { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, enListado: true },
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, enListado: true },
      { nombre: 'domicilio', etiqueta: 'Domicilio', tipo: 'texto', enListado: true },
    ],
  },
  {
    clave: 'puntos-venta',
    titulo: 'Puntos de venta',
    singular: 'punto de venta',
    descripcion: 'Los mismos que están dados de alta en ARCA. El número va en cada comprobante.',
    tabla: puntosVenta,
    id: puntosVenta.id,
    orden: puntosVenta.numero,
    activo: puntosVenta.activo,
    nombreActivo: 'activo',
    duplicado: { indice: 'puntos_venta_empresa_id_numero', mensaje: 'Ya hay un punto de venta con ese número.' },
    campos: [
      {
        nombre: 'numero',
        etiqueta: 'Número',
        tipo: 'numero',
        requerido: true,
        enListado: true,
        validar: (v) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 99998 ? null : 'Entre 1 y 99998.'),
      },
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, enListado: true },
      {
        nombre: 'tipo',
        etiqueta: 'Tipo',
        tipo: 'seleccion',
        requerido: true,
        enListado: true,
        opciones: [
          { valor: 'electronico', texto: 'Factura electrónica (WSFE)' },
          { valor: 'fce', texto: 'Factura de crédito electrónica MiPyME' },
          { valor: 'manual', texto: 'Talonario manual' },
          { valor: 'remitos', texto: 'Solo remitos' },
        ],
      },
      {
        nombre: 'depositoId',
        etiqueta: 'Depósito',
        tipo: 'seleccion',
        enListado: true,
        opciones: (tx) => opcionesDe(tx, depositos, depositos.id, depositos.nombre),
      },
    ],
  },
  {
    clave: 'listas-precios',
    titulo: 'Listas de precios',
    singular: 'lista de precios',
    descripcion:
      'Una lista base tiene precios propios. Una derivada se calcula sobre otra con un porcentaje: por ejemplo, Tarjeta 6 cuotas = Lista general + 49 %.',
    tabla: listasPrecios,
    id: listasPrecios.id,
    orden: listasPrecios.codigo,
    activo: listasPrecios.activa,
    nombreActivo: 'activa',
    duplicado: { indice: 'listas_precios_empresa_id_codigo', mensaje: 'Ya hay una lista con ese código.' },
    campos: [
      { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, enListado: true },
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, enListado: true },
      {
        nombre: 'moneda',
        etiqueta: 'Moneda',
        tipo: 'seleccion',
        requerido: true,
        enListado: true,
        opciones: (tx) => opcionesDe(tx, monedas, monedas.codigo, monedas.nombre),
      },
      { nombre: 'incluyeIva', etiqueta: 'Los precios incluyen IVA', tipo: 'booleano' },
      {
        nombre: 'listaBaseId',
        etiqueta: 'Se calcula sobre',
        tipo: 'seleccion',
        enListado: true,
        ayuda: 'Vacío: lista base con precios propios.',
        opciones: (tx, propio) => opcionesDe(tx, listasPrecios, listasPrecios.id, listasPrecios.nombre, propio),
      },
      {
        nombre: 'porcentaje',
        etiqueta: 'Recargo o descuento (%)',
        tipo: 'numero',
        ayuda: 'Negativo para descuento.',
        enListado: true,
      },
      { nombre: 'vigenteHasta', etiqueta: 'Vigente hasta', tipo: 'fecha' },
    ],
  },
  {
    clave: 'condiciones-pago',
    titulo: 'Condiciones de pago',
    singular: 'condición de pago',
    descripcion: 'Definen el vencimiento de los comprobantes: contado, cuenta corriente a N días o en cuotas.',
    tabla: condicionesPago,
    id: condicionesPago.id,
    orden: condicionesPago.dias,
    activo: condicionesPago.activa,
    nombreActivo: 'activa',
    duplicado: { indice: 'condiciones_pago_empresa_id_nombre', mensaje: 'Ya hay una condición con ese nombre.' },
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, enListado: true },
      {
        nombre: 'dias',
        etiqueta: 'Días hasta el vencimiento',
        tipo: 'numero',
        requerido: true,
        enListado: true,
        validar: numeroPositivo,
      },
      {
        nombre: 'cuotas',
        etiqueta: 'Cuotas',
        tipo: 'numero',
        requerido: true,
        enListado: true,
        validar: (v) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 60 ? null : 'Entre 1 y 60.'),
      },
    ],
  },
  {
    clave: 'vendedores',
    titulo: 'Vendedores',
    singular: 'vendedor',
    descripcion: 'Con su comisión por venta y por cobranza.',
    tabla: vendedores,
    id: vendedores.id,
    orden: vendedores.nombre,
    activo: vendedores.activo,
    nombreActivo: 'activo',
    duplicado: { indice: 'vendedores_empresa_id_codigo', mensaje: 'Ya hay un vendedor con ese código.' },
    campos: [
      { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, enListado: true },
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, enListado: true },
      { nombre: 'email', etiqueta: 'Email', tipo: 'texto', enListado: true },
      { nombre: 'comisionVenta', etiqueta: 'Comisión por venta (%)', tipo: 'numero', enListado: true, validar: numeroPositivo },
      {
        nombre: 'comisionCobranza',
        etiqueta: 'Comisión por cobranza (%)',
        tipo: 'numero',
        enListado: true,
        validar: numeroPositivo,
      },
    ],
  },
  {
    clave: 'tecnicos',
    titulo: 'Técnicos',
    singular: 'técnico',
    descripcion: 'Quienes atienden las órdenes de servicio técnico de los equipos.',
    tabla: tecnicos,
    id: tecnicos.id,
    orden: tecnicos.nombre,
    activo: tecnicos.activo,
    nombreActivo: 'activo',
    duplicado: { indice: 'tecnicos_empresa_id_codigo', mensaje: 'Ya hay un técnico con ese código.' },
    campos: [
      { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, enListado: true },
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, enListado: true },
      { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'texto', enListado: true },
      { nombre: 'email', etiqueta: 'Email', tipo: 'texto', enListado: true },
    ],
  },
  {
    clave: 'rubros',
    titulo: 'Rubros',
    singular: 'rubro',
    descripcion: 'Agrupan los artículos. Un rubro puede estar dentro de otro (subrubro).',
    tabla: rubros,
    id: rubros.id,
    orden: rubros.nombre,
    activo: rubros.activo,
    nombreActivo: 'activo',
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, enListado: true },
      {
        nombre: 'padreId',
        etiqueta: 'Dentro de',
        tipo: 'seleccion',
        enListado: true,
        ayuda: 'Vacío: rubro principal.',
        opciones: (tx, propio) => opcionesDe(tx, rubros, rubros.id, rubros.nombre, propio),
      },
    ],
  },
  {
    clave: 'marcas',
    titulo: 'Marcas',
    singular: 'marca',
    descripcion: 'Marcas de los artículos.',
    tabla: marcas,
    id: marcas.id,
    orden: marcas.nombre,
    activo: marcas.activa,
    nombreActivo: 'activa',
    duplicado: { indice: 'marcas_empresa_id_nombre', mensaje: 'Esa marca ya existe.' },
    campos: [{ nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, enListado: true }],
  },
  {
    clave: 'zonas',
    titulo: 'Zonas',
    singular: 'zona',
    descripcion: 'Para ordenar clientes por recorrido o región.',
    tabla: zonas,
    id: zonas.id,
    orden: zonas.nombre,
    activo: zonas.activa,
    nombreActivo: 'activa',
    duplicado: { indice: 'zonas_empresa_id_nombre', mensaje: 'Esa zona ya existe.' },
    campos: [{ nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, enListado: true }],
  },
  {
    clave: 'transportes',
    titulo: 'Transportes',
    singular: 'transporte',
    descripcion: 'Transportes y formas de entrega habituales.',
    tabla: transportes,
    id: transportes.id,
    orden: transportes.nombre,
    activo: transportes.activo,
    nombreActivo: 'activo',
    duplicado: { indice: 'transportes_empresa_id_nombre', mensaje: 'Ese transporte ya existe.' },
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, enListado: true },
      {
        nombre: 'cuit',
        etiqueta: 'CUIT',
        tipo: 'texto',
        enListado: true,
        validar: (v) => {
          if (!v) return null
          const r = validarCuit(String(v))
          return r.valido ? null : r.error
        },
      },
      { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'texto', enListado: true },
    ],
  },
]

export function catalogo(clave: string): DefinicionCatalogo | null {
  return CATALOGOS.find((c) => c.clave === clave) ?? null
}

/** Convierte lo que llega del formulario al tipo de cada campo y lo valida. */
export function leerFormulario(
  def: DefinicionCatalogo,
  entrada: Record<string, unknown>,
): { ok: true; datos: Record<string, unknown> } | { ok: false; errores: Record<string, string> } {
  const datos: Record<string, unknown> = {}
  const errores: Record<string, string> = {}
  for (const campo of def.campos) {
    const crudo = entrada[campo.nombre]
    let valor: unknown
    if (campo.tipo === 'booleano') valor = crudo === true || crudo === 'on' || crudo === 'true'
    else {
      const texto = typeof crudo === 'string' ? crudo.trim() : ''
      if (!texto) valor = null
      else if (campo.tipo === 'numero') {
        const normal = normalizarNumero(texto)
        const r = z
          .string()
          .regex(/^-?\d+(\.\d+)?$/)
          .safeParse(normal)
        if (!r.success) {
          errores[campo.nombre] = 'Escribí un número.'
          continue
        }
        valor = normal
      } else if (campo.tipo === 'fecha') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
          errores[campo.nombre] = 'Fecha inválida.'
          continue
        }
        valor = texto
      } else valor = texto
    }
    if (campo.requerido && (valor === null || valor === '')) {
      errores[campo.nombre] = `Completá ${campo.etiqueta.toLowerCase()}.`
      continue
    }
    const problema = valor !== null && campo.validar ? campo.validar(valor) : null
    if (problema) {
      errores[campo.nombre] = problema
      continue
    }
    datos[campo.nombre] = campo.nombre === 'cuit' && valor ? String(valor).replace(/\D/g, '') : valor
  }
  // Una lista derivada necesita el porcentaje, y una base no lo lleva.
  if (def.clave === 'listas-precios') {
    if (datos.listaBaseId && datos.porcentaje === null) errores.porcentaje = 'Una lista derivada necesita el porcentaje.'
    if (!datos.listaBaseId) datos.porcentaje = null
  }
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true, datos }
}

export async function listarCatalogo(tx: Transaccion, def: DefinicionCatalogo) {
  return (await tx.select().from(def.tabla).orderBy(asc(def.orden))) as Record<string, unknown>[]
}

export async function opcionesCatalogo(tx: Transaccion, def: DefinicionCatalogo, idPropio?: string) {
  const resultado: Record<string, Opcion[]> = {}
  for (const campo of def.campos) {
    if (campo.tipo !== 'seleccion') continue
    resultado[campo.nombre] = typeof campo.opciones === 'function' ? await campo.opciones(tx, idPropio) : (campo.opciones ?? [])
  }
  return resultado
}

export type ResultadoCatalogo = { ok: true; id: string } | { ok: false; errores: Record<string, string>; mensaje?: string }

export async function guardarCatalogo(
  tx: Transaccion,
  usuarioId: string,
  def: DefinicionCatalogo,
  entrada: Record<string, unknown>,
  id?: string,
): Promise<ResultadoCatalogo> {
  const leido = leerFormulario(def, entrada)
  if (!leido.ok) return leido
  // Un rubro o una lista no pueden colgar de sí mismos.
  if (id && (leido.datos.padreId === id || leido.datos.listaBaseId === id)) {
    return {
      ok: false,
      errores: { padreId: 'No puede depender de sí mismo.', listaBaseId: 'No puede calcularse sobre sí misma.' },
    }
  }
  try {
    if (id) {
      const [antes] = await tx.select().from(def.tabla).where(eq(def.id, id))
      if (!antes) return { ok: false, errores: {}, mensaje: 'Ese registro ya no existe.' }
      const [despues] = (await tx.update(def.tabla).set(leido.datos).where(eq(def.id, id)).returning()) as Record<
        string,
        unknown
      >[]
      await auditar(tx, { usuarioId, accion: 'modificacion', entidad: def.clave, entidadId: id, antes, despues })
      return { ok: true, id }
    }
    const [nuevo] = (await tx.insert(def.tabla).values(leido.datos).returning()) as { id: string }[]
    await auditar(tx, { usuarioId, accion: 'alta', entidad: def.clave, entidadId: nuevo.id, despues: nuevo })
    return { ok: true, id: nuevo.id }
  } catch (e) {
    const mensaje = (e as { cause?: { message?: string } }).cause?.message ?? ''
    if (def.duplicado && mensaje.includes(def.duplicado.indice)) return { ok: false, errores: {}, mensaje: def.duplicado.mensaje }
    if (mensaje.includes('violates foreign key'))
      return { ok: false, errores: {}, mensaje: 'Una de las opciones elegidas ya no existe.' }
    throw e
  }
}

/** Baja lógica (o reactivación): los registros con historia no se borran. */
export async function cambiarEstadoCatalogo(
  tx: Transaccion,
  usuarioId: string,
  def: DefinicionCatalogo,
  id: string,
  activo: boolean,
) {
  const [despues] = (await tx
    .update(def.tabla)
    .set({ [def.nombreActivo]: activo })
    .where(eq(def.id, id))
    .returning()) as Record<string, unknown>[]
  if (despues)
    await auditar(tx, { usuarioId, accion: activo ? 'modificacion' : 'baja', entidad: def.clave, entidadId: id, despues })
  return Boolean(despues)
}
