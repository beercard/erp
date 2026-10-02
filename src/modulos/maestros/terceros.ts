import { and, asc, eq, ilike, or, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import {
  gruposClientes,
  condicionesIva,
  condicionesPago,
  listasPrecios,
  provincias,
  regimenesGanancias,
  terceros,
  tiposDocumento,
  transportes,
  vendedores,
  zonas,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { normalizarNumero } from '../../lib/dinero'
import { soloDigitos, validarCuit } from '../../lib/cuit'
import { gruposDeQuienConsulta } from './grupos'

/**
 * Clientes y proveedores ("terceros"). Toda función recibe la transacción de
 * la empresa (conEmpresa / enLaEmpresa): el RLS ya limita a esa empresa.
 */

export type FiltroTerceros = { q?: string; tipo?: 'clientes' | 'proveedores' | 'todos'; inactivos?: boolean }

export async function listarTerceros(tx: Transaccion, filtro: FiltroTerceros = {}, limite = 200) {
  const condiciones = []
  if (!filtro.inactivos) condiciones.push(eq(terceros.activo, true))
  if (filtro.tipo === 'clientes') condiciones.push(eq(terceros.esCliente, true))
  if (filtro.tipo === 'proveedores') condiciones.push(eq(terceros.esProveedor, true))
  const q = filtro.q?.trim()
  if (q) {
    const patron = `%${q}%`
    const digitos = soloDigitos(q)
    condiciones.push(
      or(
        ilike(terceros.razonSocial, patron),
        ilike(terceros.nombreFantasia, patron),
        ilike(terceros.codigo, patron),
        ilike(terceros.email, patron),
        digitos.length >= 4 ? ilike(terceros.numeroDocumento, `%${digitos}%`) : undefined,
      ),
    )
  }
  return tx
    .select({
      id: terceros.id,
      codigo: terceros.codigo,
      razonSocial: terceros.razonSocial,
      nombreFantasia: terceros.nombreFantasia,
      esCliente: terceros.esCliente,
      esProveedor: terceros.esProveedor,
      tipoDocumento: tiposDocumento.abreviatura,
      numeroDocumento: terceros.numeroDocumento,
      condicionIva: condicionesIva.nombre,
      localidad: terceros.localidad,
      provincia: provincias.nombre,
      activo: terceros.activo,
    })
    .from(terceros)
    .innerJoin(tiposDocumento, eq(tiposDocumento.codigo, terceros.tipoDocumento))
    .innerJoin(condicionesIva, eq(condicionesIva.codigo, terceros.condicionIva))
    .leftJoin(provincias, eq(provincias.codigo, terceros.provincia))
    .where(and(...condiciones))
    .orderBy(asc(terceros.razonSocial))
    .limit(limite)
}

export async function obtenerTercero(tx: Transaccion, id: string) {
  const [fila] = await tx.select().from(terceros).where(eq(terceros.id, id))
  return fila ?? null
}

/** Opciones para los desplegables del formulario. */
export async function opcionesTercero(tx: Transaccion) {
  const [ivas, documentos, provs, listas, vends, condiciones, zns, transps, regs, grupos, propios] = await Promise.all([
    tx.select().from(condicionesIva).orderBy(asc(condicionesIva.codigo)),
    tx.select().from(tiposDocumento).orderBy(asc(tiposDocumento.codigo)),
    tx.select().from(provincias).orderBy(asc(provincias.nombre)),
    tx
      .select({ id: listasPrecios.id, nombre: listasPrecios.nombre })
      .from(listasPrecios)
      .where(eq(listasPrecios.activa, true))
      .orderBy(asc(listasPrecios.codigo)),
    tx
      .select({ id: vendedores.id, nombre: vendedores.nombre })
      .from(vendedores)
      .where(eq(vendedores.activo, true))
      .orderBy(asc(vendedores.nombre)),
    tx
      .select({ id: condicionesPago.id, nombre: condicionesPago.nombre })
      .from(condicionesPago)
      .where(eq(condicionesPago.activa, true))
      .orderBy(asc(condicionesPago.dias)),
    tx.select({ id: zonas.id, nombre: zonas.nombre }).from(zonas).where(eq(zonas.activa, true)).orderBy(asc(zonas.nombre)),
    tx
      .select({ id: transportes.id, nombre: transportes.nombre })
      .from(transportes)
      .where(eq(transportes.activo, true))
      .orderBy(asc(transportes.nombre)),
    tx
      .select({ codigo: regimenesGanancias.codigo, concepto: regimenesGanancias.concepto })
      .from(regimenesGanancias)
      .where(eq(regimenesGanancias.activo, true))
      .orderBy(asc(regimenesGanancias.codigo)),
    tx.select({ id: gruposClientes.id, nombre: gruposClientes.nombre }).from(gruposClientes).orderBy(asc(gruposClientes.nombre)),
    gruposDeQuienConsulta(tx),
  ])
  return {
    ivas,
    documentos,
    provincias: provs,
    listas,
    vendedores: vends,
    condiciones,
    zonas: zns,
    transportes: transps,
    regimenes: regs,
    // Quien solo ve algunos grupos elige entre los suyos.
    grupos: propios.length ? propios : grupos,
  }
}

const opcional = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()
  .optional()
const uuidOpcional = z
  .string()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable())
  .optional()
const numeroOpcional = z
  .string()
  .trim()
  .transform((v) => normalizarNumero(v) || null)
  .pipe(
    z
      .string()
      .regex(/^-?\d+(\.\d+)?$/, { error: 'Escribí un número.' })
      .nullable(),
  )
  .optional()

export const EsquemaTercero = z
  .object({
    codigo: opcional,
    razonSocial: z.string().trim().min(2, { error: 'Escribí la razón social o el nombre.' }),
    nombreFantasia: opcional,
    esCliente: z.boolean(),
    esProveedor: z.boolean(),
    tipoDocumento: z.coerce.number().int(),
    numeroDocumento: opcional,
    condicionIva: z.coerce.number().int(),
    iibbRegimen: opcional,
    iibbNumero: opcional,
    email: z
      .string()
      .trim()
      .transform((v) => v || null)
      .pipe(z.email({ error: 'Ese email no es válido.' }).nullable())
      .optional(),
    telefono: opcional,
    domicilio: opcional,
    localidad: opcional,
    codigoPostal: opcional,
    provincia: opcional,
    listaPreciosId: uuidOpcional,
    vendedorId: uuidOpcional,
    condicionPagoId: uuidOpcional,
    zonaId: uuidOpcional,
    transporteId: uuidOpcional,
    grupoClienteId: uuidOpcional,
    descuento: numeroOpcional,
    limiteCredito: numeroOpcional,
    percepcionIibb: numeroOpcional,
    regimenGanancias: opcional,
    gananciasInscripto: z.boolean().default(true),
    notas: opcional,
  })
  .superRefine((d, ctx) => {
    if (!d.esCliente && !d.esProveedor) {
      ctx.addIssue({ code: 'custom', path: ['esCliente'], message: 'Marcá si es cliente, proveedor o ambos.' })
    }
    // CUIT y CUIL llevan dígito verificador: se valida acá, antes de grabar.
    if (d.tipoDocumento === 80 || d.tipoDocumento === 86) {
      const r = validarCuit(d.numeroDocumento ?? '')
      if (!r.valido) ctx.addIssue({ code: 'custom', path: ['numeroDocumento'], message: r.error })
    } else if (d.tipoDocumento === 96 && d.numeroDocumento) {
      const dni = soloDigitos(d.numeroDocumento)
      if (dni.length < 7 || dni.length > 8) {
        ctx.addIssue({ code: 'custom', path: ['numeroDocumento'], message: 'El DNI tiene 7 u 8 dígitos.' })
      }
    }
    // Un Responsable Inscripto se identifica sí o sí con CUIT.
    if (d.condicionIva === 1 && d.tipoDocumento !== 80) {
      ctx.addIssue({ code: 'custom', path: ['tipoDocumento'], message: 'Un Responsable Inscripto se identifica con CUIT.' })
    }
  })
  // Documento normalizado: CUIT, CUIL y DNI sin guiones ni puntos (un
  // pasaporte puede tener letras y queda como está); "sin identificar", sin número.
  .transform((d) => ({
    ...d,
    numeroDocumento:
      d.tipoDocumento === 99 || !d.numeroDocumento
        ? null
        : [80, 86, 96].includes(d.tipoDocumento)
          ? soloDigitos(d.numeroDocumento)
          : d.numeroDocumento.toUpperCase(),
  }))

export type DatosTercero = z.infer<typeof EsquemaTercero>

/** Próximo código numérico libre (00001, 00002…), para altas sin código. */
async function proximoCodigo(tx: Transaccion): Promise<string> {
  const [fila] = await tx
    .select({ maximo: sql<string | null>`max(${terceros.codigo}) filter (where ${terceros.codigo} ~ '^[0-9]+$')` })
    .from(terceros)
  const siguiente = Number(fila?.maximo ?? 0) + 1
  return String(siguiente).padStart(5, '0')
}

export type ResultadoGuardar =
  { ok: true; id: string } | { ok: false; errores: Partial<Record<keyof DatosTercero, string>>; mensaje?: string }

export async function guardarTercero(
  tx: Transaccion,
  usuarioId: string,
  entrada: unknown,
  id?: string,
): Promise<ResultadoGuardar> {
  const parseo = EsquemaTercero.safeParse(entrada)
  if (!parseo.success) {
    const errores: Partial<Record<keyof DatosTercero, string>> = {}
    for (const p of parseo.error.issues) {
      const campo = p.path[0] as keyof DatosTercero
      errores[campo] ??= p.message
    }
    return { ok: false, errores }
  }
  const datos = { ...parseo.data, codigo: parseo.data.codigo ?? (id ? undefined : await proximoCodigo(tx)) }
  // Quien solo ve algunos grupos no puede dejar un cliente fuera de ellos: va al primero.
  if (datos.esCliente && !datos.esProveedor && !datos.grupoClienteId) {
    const [g] = await gruposDeQuienConsulta(tx)
    if (g) datos.grupoClienteId = g.id
  }

  // Mismo documento en otro tercero de la empresa: casi seguro es un duplicado.
  if (datos.numeroDocumento) {
    const [repetido] = await tx
      .select({ id: terceros.id, razonSocial: terceros.razonSocial })
      .from(terceros)
      .where(eq(terceros.numeroDocumento, datos.numeroDocumento))
    if (repetido && repetido.id !== id) {
      return {
        ok: false,
        errores: { numeroDocumento: `Ya está cargado como "${repetido.razonSocial}".` },
      }
    }
  }

  try {
    if (id) {
      const anterior = await obtenerTercero(tx, id)
      if (!anterior) return { ok: false, errores: {}, mensaje: 'Ese cliente o proveedor ya no existe.' }
      const [actualizado] = await tx.update(terceros).set(datos).where(eq(terceros.id, id)).returning()
      await auditar(tx, {
        usuarioId,
        accion: 'modificacion',
        entidad: 'tercero',
        entidadId: id,
        antes: anterior,
        despues: actualizado,
      })
      return { ok: true, id }
    }
    const [nuevo] = await tx
      .insert(terceros)
      .values({ ...datos, codigo: datos.codigo! })
      .returning()
    await auditar(tx, { usuarioId, accion: 'alta', entidad: 'tercero', entidadId: nuevo.id, despues: nuevo })
    return { ok: true, id: nuevo.id }
  } catch (e) {
    const mensaje = (e as { cause?: { message?: string } }).cause?.message ?? ''
    if (mensaje.includes('terceros_empresa_id_codigo')) {
      return { ok: false, errores: { codigo: 'Ese código ya lo tiene otro cliente o proveedor.' } }
    }
    throw e
  }
}
