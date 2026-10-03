import { and, count, desc, eq, gt, gte, isNull, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { comoPlataforma, conEmpresa } from '../../db/empresa'
import {
  auditoria,
  auditoriaPlataforma,
  correos,
  empresas,
  erroresServidor,
  eventosSuscripcion,
  invitaciones,
  latidos,
  membresias,
  roles,
  sesiones,
  suscripciones,
  usuarios,
} from '../../db/schema'
import { hoyArgentina, sumarDias } from '../../lib/fechas'
import { DIAS_DE_PRUEBA, MESES_COBRADOS_EN_ANUAL, PLAN_DE_PRUEBA, precioDeLista, situacion } from '../../lib/planes'
import { estadoCron } from './monitoreo'
import { listarSuscripciones } from './suscripciones'

/**
 * Consola de la plataforma: métricas del servicio, gestión de empresas y
 * usuarios, operación del servidor y la auditoría de lo que hace quien
 * administra. Las páginas están en src/app/plataforma; cada página y cada
 * acción verifican que quien llama administre la plataforma (exigirAdmin).
 *
 * Los datos de negocio de cada empresa siguen aislados por RLS: lo único que
 * se lee "de adentro" son conteos (correos, actividad), empresa por empresa
 * con conEmpresa, como hace la tarea periódica.
 */

type Resultado = { ok: true } | { ok: false; error: string }

/** Quién hace un cambio desde la consola y desde dónde. */
export type Admin = { id: string; ip?: string | null }

// ---------------------------------------------------------------- Auditoría

export type AccionPlataforma =
  | 'suscripcion.cambio'
  | 'suscripcion.pago'
  | 'suscripcion.pedido'
  | 'suscripcion.suspender'
  | 'suscripcion.reactivar'
  | 'suscripcion.extender_prueba'
  | 'empresa.nota'
  | 'empresa.baja'
  | 'empresa.alta'
  | 'empresa.soporte'
  | 'empresa.codigo'
  | 'usuario.desactivar'
  | 'usuario.activar'
  | 'usuario.cerrar_sesiones'
  | 'consulta.atendida'
  | 'error.archivar'

export async function registrarAccion(
  admin: Admin,
  accion: AccionPlataforma,
  datos: { empresaId?: string | null; sobreUsuarioId?: string | null; detalle?: Record<string, unknown> } = {},
  tx?: Transaccion,
) {
  const fila = {
    usuarioId: admin.id,
    accion,
    empresaId: datos.empresaId ?? null,
    sobreUsuarioId: datos.sobreUsuarioId ?? null,
    detalle: datos.detalle ?? null,
    ip: admin.ip ?? null,
  }
  if (tx) await tx.insert(auditoriaPlataforma).values(fila)
  else await comoPlataforma((t) => t.insert(auditoriaPlataforma).values(fila))
}

export async function listarAuditoria(filtro: { empresaId?: string; limite?: number } = {}) {
  return comoPlataforma((tx) =>
    tx
      .select({
        id: auditoriaPlataforma.id,
        accion: auditoriaPlataforma.accion,
        detalle: auditoriaPlataforma.detalle,
        ip: auditoriaPlataforma.ip,
        creado: auditoriaPlataforma.creado,
        empresaId: auditoriaPlataforma.empresaId,
        empresa: empresas.razonSocial,
        usuario: usuarios.nombre,
        email: usuarios.email,
        sobreUsuario: sql<string | null>`(select u.email from usuarios u where u.id = "auditoria_plataforma"."sobre_usuario_id")`,
      })
      .from(auditoriaPlataforma)
      .leftJoin(usuarios, eq(usuarios.id, auditoriaPlataforma.usuarioId))
      .leftJoin(empresas, eq(empresas.id, auditoriaPlataforma.empresaId))
      .where(filtro.empresaId ? eq(auditoriaPlataforma.empresaId, filtro.empresaId) : undefined)
      .orderBy(desc(auditoriaPlataforma.creado))
      .limit(filtro.limite ?? 200),
  )
}

// ---------------------------------------------------------------- Métricas

/**
 * Importe de un pago tal como quedó en el historial: "121.000,50" (cargado a
 * mano) o "121000.5" (Mercado Pago).
 */
export function importeDePago(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const t = String(v ?? '')
    .trim()
    .replace(/[^\d.,-]/g, '')
  if (!t) return 0
  const normal = t.includes(',')
    ? t.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(t)
      ? t.replace(/\./g, '')
      : t
  const n = Number(normal)
  return Number.isFinite(n) ? n : 0
}

/** Los últimos `n` meses (AAAA-MM), del más viejo al actual. */
export function ultimosMeses(hoy: string, n = 12): string[] {
  const [a, m] = hoy.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1))
    return d.toISOString().slice(0, 7)
  })
}

export type FilaEmpresa = Awaited<ReturnType<typeof empresasConSituacion>>[number]

/** Todas las empresas con su situación, precio mensual y ingreso mensual recurrente. */
export async function empresasConSituacion(hoy = hoyArgentina()) {
  const todas = await listarSuscripciones()
  return todas.map((e) => {
    const datos = {
      plan: e.plan ?? 'gratis',
      estado: e.estado ?? 'activa',
      aplicaciones: e.aplicaciones ?? [],
      usuariosAdicionales: e.usuariosAdicionales ?? 0,
      pruebaHasta: e.pruebaHasta,
      pagadoHasta: e.pagadoHasta,
    }
    const sit = situacion(datos, hoy)
    const mensual = e.precioAcordado ? Number(e.precioAcordado) : precioDeLista(datos)
    // Lo que aporta por mes: el anual se cobra con descuento y se prorratea.
    const recurrente =
      datos.estado === 'activa' && mensual > 0 ? (e.ciclo === 'anual' ? (mensual * MESES_COBRADOS_EN_ANUAL) / 12 : mensual) : 0
    const vence = datos.estado === 'prueba' ? datos.pruebaHasta : datos.pagadoHasta
    return { ...e, ...datos, sit, mensual, recurrente, vence }
  })
}

export async function metricas(hoy = hoyArgentina()) {
  const filas = await empresasConSituacion(hoy)
  const meses = ultimosMeses(hoy)
  const desde = `${meses[0]}-01`

  const [pagos, ingresos] = await comoPlataforma(async (tx) => [
    await tx
      .select({ detalle: eventosSuscripcion.detalle, creado: eventosSuscripcion.creado })
      .from(eventosSuscripcion)
      .where(and(eq(eventosSuscripcion.tipo, 'pago'), gte(eventosSuscripcion.creado, new Date(`${desde}T03:00:00Z`)))),
    (
      await tx
        .select({
          semana: sql<number>`count(*) filter (where ${usuarios.ultimoIngreso} > now() - interval '7 days')::int`,
          mes: sql<number>`count(*) filter (where ${usuarios.ultimoIngreso} > now() - interval '30 days')::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(usuarios)
        .where(eq(usuarios.activo, true))
    )[0],
  ])

  const mesArgentina = (d: Date) => hoyArgentina(d).slice(0, 7)
  const cobrado = meses.map((mes) => ({
    mes,
    valor: pagos
      .filter((p) => mesArgentina(p.creado) === mes)
      .reduce((t, p) => t + importeDePago((p.detalle as { importe?: unknown }).importe), 0),
  }))
  const altas = meses.map((mes) => ({ mes, valor: filas.filter((f) => mesArgentina(f.alta) === mes).length }))

  const pagas = filas.filter((f) => f.recurrente > 0)
  const mrr = pagas.reduce((t, f) => t + f.recurrente, 0)
  // Conversión: de las que ya terminaron la prueba, cuántas pagan hoy.
  const corte = sumarDias(hoy, -DIAS_DE_PRUEBA)
  const maduras = filas.filter((f) => hoyArgentina(f.alta) <= corte)
  const convertidas = maduras.filter((f) => f.recurrente > 0).length
  const enSieteDias = sumarDias(hoy, 7)
  const porVencer = filas
    .filter((f) => f.vence && f.vence >= hoy && f.vence <= enSieteDias && ['prueba', 'activa'].includes(f.estado))
    .sort((a, b) => (a.vence! < b.vence! ? -1 : 1))

  const porPlan = new Map<string, number>()
  for (const f of filas) porPlan.set(f.plan, (porPlan.get(f.plan) ?? 0) + 1)

  return {
    mrr,
    arr: mrr * 12,
    empresas: filas.length,
    pagas: pagas.length,
    enPrueba: filas.filter((f) => f.estado === 'prueba').length,
    soloLectura: filas.filter((f) => f.sit.soloLectura).length,
    bajas: filas.filter((f) => ['suspendida', 'cancelada'].includes(f.estado) || !f.activa).length,
    conversion: maduras.length ? convertidas / maduras.length : null,
    maduras: maduras.length,
    ticketPromedio: pagas.length ? mrr / pagas.length : 0,
    usuarios: ingresos,
    cobrado,
    altas,
    porPlan: [...porPlan.entries()].map(([plan, n]) => ({ plan, n })),
    porVencer,
  }
}

// ---------------------------------------------------------------- Empresas

export type FiltroEmpresas = { q?: string; estado?: string; plan?: string; orden?: string }

export async function buscarEmpresas(filtro: FiltroEmpresas, hoy = hoyArgentina()) {
  const filas = await empresasConSituacion(hoy)
  const q = (filtro.q ?? '').trim().toLowerCase()
  const soloDigitos = q.replace(/\D/g, '')
  const visibles = filas.filter(
    (f) =>
      (!q || f.razonSocial.toLowerCase().includes(q) || (soloDigitos.length >= 3 && f.cuit.includes(soloDigitos))) &&
      (!filtro.estado ||
        (filtro.estado === 'solo_lectura'
          ? f.sit.soloLectura
          : filtro.estado === 'baja'
            ? !f.activa
            : f.estado === filtro.estado)) &&
      (!filtro.plan || f.plan === filtro.plan),
  )
  const orden: Record<string, (a: FilaEmpresa, b: FilaEmpresa) => number> = {
    alta: (a, b) => b.alta.getTime() - a.alta.getTime(),
    nombre: (a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es'),
    mensual: (a, b) => b.mensual - a.mensual,
    vence: (a, b) => (a.vence ?? '9999').localeCompare(b.vence ?? '9999'),
    usuarios: (a, b) => b.usuarios - a.usuarios,
  }
  return { total: filas.length, filas: visibles.sort(orden[filtro.orden ?? 'alta'] ?? orden.alta) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Todo lo que la plataforma sabe de una empresa, para su ficha. Nulo si no existe. */
export async function fichaEmpresa(empresaId: string) {
  if (!UUID.test(empresaId)) return null
  const datos = await comoPlataforma(async (tx) => {
    const [empresa] = await tx.select().from(empresas).where(eq(empresas.id, empresaId))
    if (!empresa) return null
    const miembros = await tx
      .select({
        id: usuarios.id,
        nombre: usuarios.nombre,
        email: usuarios.email,
        rol: roles.nombre,
        activa: membresias.activa,
        usuarioActivo: usuarios.activo,
        ultimoIngreso: usuarios.ultimoIngreso,
        desde: membresias.creado,
      })
      .from(membresias)
      .innerJoin(usuarios, eq(usuarios.id, membresias.usuarioId))
      .innerJoin(roles, eq(roles.id, membresias.rolId))
      .where(eq(membresias.empresaId, empresaId))
      .orderBy(desc(membresias.activa), usuarios.nombre)
    const pendientes = await tx
      .select({ email: invitaciones.email, vence: invitaciones.vence, creada: invitaciones.creada, rol: roles.nombre })
      .from(invitaciones)
      .innerJoin(roles, eq(roles.id, invitaciones.rolId))
      .where(and(eq(invitaciones.empresaId, empresaId), isNull(invitaciones.aceptada), gt(invitaciones.vence, new Date())))
      .orderBy(desc(invitaciones.creada))
    const notas = await tx
      .select({
        id: eventosSuscripcion.id,
        detalle: eventosSuscripcion.detalle,
        creado: eventosSuscripcion.creado,
        usuario: usuarios.nombre,
      })
      .from(eventosSuscripcion)
      .leftJoin(usuarios, eq(usuarios.id, eventosSuscripcion.usuarioId))
      .where(and(eq(eventosSuscripcion.empresaId, empresaId), eq(eventosSuscripcion.tipo, 'nota')))
      .orderBy(desc(eventosSuscripcion.creado))
      .limit(50)
    return { empresa, miembros, pendientes, notas }
  })
  if (!datos) return null
  // Actividad de adentro de la empresa: solo los últimos ingresos (quién y cuándo).
  const ingresos = await conEmpresa(empresaId, (tx) =>
    tx
      .select({ fecha: auditoria.fecha, usuarioId: auditoria.usuarioId, entidad: auditoria.entidad, ip: auditoria.ip })
      .from(auditoria)
      .where(eq(auditoria.accion, 'ingreso'))
      .orderBy(desc(auditoria.fecha))
      .limit(15),
  )
  const nombres = new Map(datos.miembros.map((m) => [m.id, m.nombre]))
  return {
    ...datos,
    ingresos: ingresos.map((i) => ({
      ...i,
      usuario:
        i.entidad === 'soporte'
          ? 'Soporte de la plataforma'
          : (i.usuarioId && nombres.get(i.usuarioId)) || 'Usuario que ya no es miembro',
    })),
  }
}

const EsquemaNota = z.string().trim().min(2, { error: 'Escribí la nota.' }).max(2000, { error: 'La nota es muy larga.' })

/** Nota interna sobre una empresa (solo la ve la plataforma). */
export async function agregarNota(admin: Admin, empresaId: string, texto: unknown): Promise<Resultado> {
  const p = EsquemaNota.safeParse(texto)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  await comoPlataforma(async (tx) => {
    await tx.insert(eventosSuscripcion).values({ empresaId, tipo: 'nota', detalle: { texto: p.data }, usuarioId: admin.id })
    await registrarAccion(admin, 'empresa.nota', { empresaId }, tx)
  })
  return { ok: true }
}

/**
 * Suspende la suscripción (la empresa queda en solo lectura) o la reactiva.
 * Reactivar deja "activa" si el pago está al día y "impaga" si no: los días de
 * gracia y el solo lectura los decide src/lib/planes.ts.
 */
export async function cambiarSuspension(
  admin: Admin,
  empresaId: string,
  suspender: boolean,
  hoy = hoyArgentina(),
): Promise<Resultado> {
  return comoPlataforma(async (tx) => {
    const [s] = await tx.select().from(suscripciones).where(eq(suscripciones.empresaId, empresaId))
    if (!s) return { ok: false as const, error: 'La empresa no tiene suscripción.' }
    if (suspender && s.estado === 'suspendida') return { ok: false as const, error: 'Ya está suspendida.' }
    if (!suspender && s.estado !== 'suspendida') return { ok: false as const, error: 'No está suspendida.' }
    const estado = suspender
      ? 'suspendida'
      : s.plan === 'gratis' || (s.pagadoHasta && s.pagadoHasta >= hoy)
        ? 'activa'
        : s.pruebaHasta && s.pruebaHasta >= hoy
          ? 'prueba'
          : 'impaga'
    await tx.update(suscripciones).set({ estado, actualizado: new Date() }).where(eq(suscripciones.empresaId, empresaId))
    await tx.insert(eventosSuscripcion).values({
      empresaId,
      tipo: 'cambio',
      detalle: { antes: { estado: s.estado }, despues: { estado } },
      usuarioId: admin.id,
    })
    await registrarAccion(
      admin,
      suspender ? 'suscripcion.suspender' : 'suscripcion.reactivar',
      { empresaId, detalle: { antes: s.estado, despues: estado } },
      tx,
    )
    return { ok: true as const }
  })
}

/** Extiende (o reabre) la prueba gratis `dias` días desde su fin o desde hoy. */
export async function extenderPrueba(admin: Admin, empresaId: string, dias: unknown, hoy = hoyArgentina()): Promise<Resultado> {
  const p = z.coerce.number().int().min(1).max(90).safeParse(dias)
  if (!p.success) return { ok: false, error: 'Entre 1 y 90 días.' }
  return comoPlataforma(async (tx) => {
    const [s] = await tx.select().from(suscripciones).where(eq(suscripciones.empresaId, empresaId))
    if (!s) return { ok: false as const, error: 'La empresa no tiene suscripción.' }
    if (s.estado === 'activa' && s.plan !== 'gratis' && s.pagadoHasta && s.pagadoHasta >= hoy) {
      return { ok: false as const, error: 'La suscripción está paga: no hace falta una prueba.' }
    }
    const base = s.estado === 'prueba' && s.pruebaHasta && s.pruebaHasta > hoy ? s.pruebaHasta : hoy
    const hasta = sumarDias(base, p.data)
    // Un plan gratis pasa a probar el plan de prueba habitual.
    const plan = s.plan === 'gratis' ? PLAN_DE_PRUEBA : s.plan
    await tx
      .update(suscripciones)
      .set({ estado: 'prueba', plan, pruebaHasta: hasta, actualizado: new Date() })
      .where(eq(suscripciones.empresaId, empresaId))
    await tx.insert(eventosSuscripcion).values({
      empresaId,
      tipo: 'cambio',
      detalle: {
        antes: { estado: s.estado, plan: s.plan, pruebaHasta: s.pruebaHasta },
        despues: { estado: 'prueba', plan, pruebaHasta: hasta },
      },
      usuarioId: admin.id,
    })
    await registrarAccion(admin, 'suscripcion.extender_prueba', { empresaId, detalle: { dias: p.data, hasta } }, tx)
    return { ok: true as const }
  })
}

/**
 * Da de baja una empresa (nadie puede entrar; los datos quedan) o la vuelve a
 * habilitar. Las sesiones abiertas en esa empresa quedan sin empresa.
 */
export async function cambiarBajaEmpresa(admin: Admin, empresaId: string, activa: boolean): Promise<Resultado> {
  return comoPlataforma(async (tx) => {
    const [e] = await tx.select({ activa: empresas.activa }).from(empresas).where(eq(empresas.id, empresaId))
    if (!e) return { ok: false as const, error: 'No existe esa empresa.' }
    if (e.activa === activa) return { ok: false as const, error: activa ? 'Ya está habilitada.' : 'Ya está dada de baja.' }
    await tx.update(empresas).set({ activa, actualizado: new Date() }).where(eq(empresas.id, empresaId))
    if (!activa) {
      await tx.update(sesiones).set({ empresaId: null, soporteHasta: null }).where(eq(sesiones.empresaId, empresaId))
    }
    await registrarAccion(admin, activa ? 'empresa.alta' : 'empresa.baja', { empresaId }, tx)
    return { ok: true as const }
  })
}

// ---------------------------------------------------------------- Usuarios

/** Las cuentas con sus empresas y sesiones; `total` es antes de filtrar (una sola lectura). */
export async function listarUsuarios(filtro: { q?: string; tipo?: string } = {}) {
  const q = (filtro.q ?? '').trim().toLowerCase()
  const filas = await comoPlataforma((tx) =>
    tx
      .select({
        id: usuarios.id,
        nombre: usuarios.nombre,
        email: usuarios.email,
        activo: usuarios.activo,
        adminPlataforma: usuarios.adminPlataforma,
        ultimoIngreso: usuarios.ultimoIngreso,
        creado: usuarios.creado,
        empresas: sql<
          { id: string; razonSocial: string; rol: string }[]
        >`coalesce((select json_agg(json_build_object('id', e.id, 'razonSocial', e.razon_social, 'rol', r.nombre) order by e.razon_social)
            from membresias m join empresas e on e.id = m.empresa_id join roles r on r.id = m.rol_id
            where m.usuario_id = "usuarios"."id" and m.activa), '[]'::json)`,
        sesiones: sql<number>`(select count(*)::int from sesiones s where s.usuario_id = "usuarios"."id" and s.vence > now())`,
      })
      .from(usuarios)
      // Quien nunca entró, al final (en Postgres, desc pone los nulos primero).
      .orderBy(sql`${usuarios.ultimoIngreso} desc nulls last`, usuarios.nombre),
  )
  const visibles = filas.filter(
    (u) =>
      (!q || u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
      (!filtro.tipo ||
        (filtro.tipo === 'admin' && u.adminPlataforma) ||
        (filtro.tipo === 'inactivo' && !u.activo) ||
        (filtro.tipo === 'sin_empresa' && u.empresas.length === 0) ||
        (filtro.tipo === 'nunca' && !u.ultimoIngreso)),
  )
  return { total: filas.length, filas: visibles }
}

/** Desactivar a alguien le cierra todas las sesiones; no se puede con uno mismo. */
export async function cambiarActivoUsuario(admin: Admin, usuarioId: string, activo: boolean): Promise<Resultado> {
  if (!activo && usuarioId === admin.id) return { ok: false, error: 'No podés desactivar tu propio usuario.' }
  return comoPlataforma(async (tx) => {
    const [u] = await tx.select({ activo: usuarios.activo }).from(usuarios).where(eq(usuarios.id, usuarioId))
    if (!u) return { ok: false as const, error: 'No existe ese usuario.' }
    if (u.activo === activo) return { ok: false as const, error: activo ? 'Ya está activo.' : 'Ya está desactivado.' }
    await tx.update(usuarios).set({ activo, actualizado: new Date() }).where(eq(usuarios.id, usuarioId))
    if (!activo) await tx.delete(sesiones).where(eq(sesiones.usuarioId, usuarioId))
    await registrarAccion(admin, activo ? 'usuario.activar' : 'usuario.desactivar', { sobreUsuarioId: usuarioId }, tx)
    return { ok: true as const }
  })
}

// Dar o quitar la administración de la plataforma NO se hace desde acá: la
// aplicación no tiene permiso para cambiar usuarios.admin_plataforma
// (drizzle/0055_endurecimiento.sql). Lo hace el dueño de la base con
// scripts/admin-plataforma.mjs; la consola solo muestra el comando.

export async function cerrarSesionesDe(admin: Admin, usuarioId: string): Promise<Resultado & { cerradas?: number }> {
  return comoPlataforma(async (tx) => {
    const borradas = await tx.delete(sesiones).where(eq(sesiones.usuarioId, usuarioId)).returning({ id: sesiones.id })
    await registrarAccion(
      admin,
      'usuario.cerrar_sesiones',
      { sobreUsuarioId: usuarioId, detalle: { cerradas: borradas.length } },
      tx,
    )
    return { ok: true as const, cerradas: borradas.length }
  })
}

// ---------------------------------------------------------------- Operación

/** Aplica `trabajo` a cada elemento con a lo sumo `cuantas` tareas a la vez, conservando el orden. */
async function deAPocas<T, R>(lista: T[], cuantas: number, trabajo: (x: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(lista.length)
  let siguiente = 0
  const obrero = async () => {
    while (siguiente < lista.length) {
      const i = siguiente++
      resultados[i] = await trabajo(lista[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(cuantas, lista.length) }, obrero))
  return resultados
}

/** Copias y pruebas de restauración: las dejan deploy/copia.sh y deploy/probar-restauracion.sh. */
const COPIA_ATRASADA_MS = 26 * 3_600_000
const RESTAURACION_ATRASADA_MS = 8 * 86_400_000

export async function estadoOperacion(ahora = new Date()) {
  const [cron, filas] = await Promise.all([
    estadoCron(ahora),
    comoPlataforma(async (tx) => ({
      latidos: await tx.select().from(latidos),
      errores: await tx.select().from(erroresServidor).orderBy(desc(erroresServidor.ultimo)).limit(100),
      sesionesActivas: (await tx.select({ n: count() }).from(sesiones).where(gt(sesiones.vence, ahora)))[0].n,
      soportesAbiertos: (
        await tx
          .select({ n: count() })
          .from(sesiones)
          .where(and(gt(sesiones.vence, ahora), gt(sesiones.soporteHasta, ahora)))
      )[0].n,
      base: await tx
        .execute<{ bytes: string }>(sql`select pg_database_size(current_database())::text as bytes`)
        .then((r) => (Array.isArray(r) ? r : (r as { rows: { bytes: string }[] }).rows)[0]),
      empresas: await tx
        .select({ id: empresas.id, razonSocial: empresas.razonSocial })
        .from(empresas)
        .where(eq(empresas.activa, true)),
    })),
  ])

  // Correo saliente: lo pendiente y lo que falló, empresa por empresa (sus correos tienen RLS).
  // De a pocas a la vez, para no ocupar todas las conexiones de la base.
  const porEmpresa = await deAPocas(filas.empresas, 4, async (e) => {
    const [c] = await conEmpresa(e.id, (tx) =>
      tx
        .select({
          pendientes: sql<number>`count(*) filter (where ${correos.estado} = 'pendiente')::int`,
          errores: sql<number>`count(*) filter (where ${correos.estado} = 'error')::int`,
          enviados: sql<number>`count(*) filter (where ${correos.estado} = 'enviado' and ${correos.enviado} > now() - interval '7 days')::int`,
          ultimoError: sql<
            string | null
          >`(select c2.error from correos c2 where c2.estado = 'error' order by c2.creado desc limit 1)`,
        })
        .from(correos),
    )
    return { empresaId: e.id, empresa: e.razonSocial, ...c }
  })
  const correo = porEmpresa.filter((c) => c.pendientes || c.errores || c.enviados)

  const latido = (nombre: string, atraso: number) => {
    const l = filas.latidos.find((x) => x.nombre === nombre)
    return l ? { ...l, atrasado: ahora.getTime() - l.ultimo.getTime() > atraso } : null
  }
  return {
    cron,
    copia: latido('copia', COPIA_ATRASADA_MS),
    restauracion: latido('restauracion', RESTAURACION_ATRASADA_MS),
    errores: filas.errores,
    sesionesActivas: filas.sesionesActivas,
    soportesAbiertos: filas.soportesAbiertos,
    tamanoBase: filas.base ? Number(filas.base.bytes) : null,
    smtp: Boolean(process.env.SMTP_URL),
    remitente: process.env.CORREO_REMITENTE ?? null,
    correo,
    servidor: {
      node: process.version,
      activoDesde: new Date(ahora.getTime() - process.uptime() * 1000),
      memoriaMb: Math.round(process.memoryUsage().rss / 1_048_576),
    },
  }
}

/** Saca un error de la lista (ya se resolvió). Si vuelve a pasar, aparece de nuevo. */
export async function archivarError(admin: Admin, huella: string): Promise<Resultado> {
  return comoPlataforma(async (tx) => {
    const [e] = await tx.delete(erroresServidor).where(eq(erroresServidor.huella, huella)).returning()
    if (!e) return { ok: false as const, error: 'Ese error ya no está.' }
    await registrarAccion(
      admin,
      'error.archivar',
      { detalle: { mensaje: e.mensaje.slice(0, 200), ruta: e.ruta, cantidad: e.cantidad } },
      tx,
    )
    return { ok: true as const }
  })
}
