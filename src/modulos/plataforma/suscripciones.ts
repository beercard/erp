import { and, count, desc, eq, gt, gte, inArray, isNull, sql } from 'drizzle-orm'
import * as z from 'zod'

import { conEmpresa, comoPlataforma } from '../../db/empresa'
import {
  comprobantes,
  condicionesPago,
  depositos,
  empresas,
  eventosSuscripcion,
  invitaciones,
  listasPrecios,
  membresias,
  puntosVenta,
  roles,
  suscripciones,
  usuarios,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { validarCuit } from '../../lib/cuit'
import { hoyArgentina, sumarDias } from '../../lib/fechas'
import {
  APLICACIONES,
  DIAS_DE_PRUEBA,
  ORDEN_PLANES,
  PLAN_DE_PRUEBA,
  planPorId,
  situacion,
  type DatosSuscripcion,
  type PlanId,
} from '../../lib/planes'

/**
 * Suscripción de cada empresa: alta (con la prueba gratis), uso contra los
 * límites del plan, pedidos de cambio y la administración desde la
 * plataforma. Lo que incluye cada plan está en src/lib/planes.ts.
 */

type Resultado = { ok: true } | { ok: false; error: string }

export async function suscripcionDe(empresaId: string): Promise<
  DatosSuscripcion & {
    ciclo: string
    precioAcordado: string | null
    observaciones: string | null
    mpEstado: string | null
  }
> {
  const [s] = await comoPlataforma((tx) => tx.select().from(suscripciones).where(eq(suscripciones.empresaId, empresaId)))
  // Una empresa sin suscripción (no debería pasar) queda en el plan gratis.
  return (
    s ?? {
      plan: 'gratis',
      estado: 'activa',
      ciclo: 'mensual',
      aplicaciones: [],
      usuariosAdicionales: 0,
      pruebaHasta: null,
      pagadoHasta: null,
      precioAcordado: null,
      observaciones: null,
      mpEstado: null,
    }
  )
}

/** Primer y último día del mes de una fecha. */
function mesDe(fecha: string) {
  const [a, m] = fecha.split('-').map(Number)
  return { desde: `${fecha.slice(0, 7)}-01`, hasta: new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10) }
}

/** Lo usado de cada límite: usuarios (con las invitaciones pendientes), comprobantes con CAE del mes y puntos de venta. */
export async function usoDe(empresaId: string, hoy: string = hoyArgentina()) {
  const [usuariosActivos, pendientes] = await comoPlataforma(async (tx) => [
    (
      await tx
        .select({ n: count() })
        .from(membresias)
        .where(and(eq(membresias.empresaId, empresaId), eq(membresias.activa, true)))
    )[0].n,
    (
      await tx
        .select({ n: count() })
        .from(invitaciones)
        .where(and(eq(invitaciones.empresaId, empresaId), isNull(invitaciones.aceptada), gt(invitaciones.vence, new Date())))
    )[0].n,
  ])
  const { desde, hasta } = mesDe(hoy)
  const [comprobantesMes, puntos] = await conEmpresa(empresaId, async (tx) => [
    (
      await tx
        .select({ n: count() })
        .from(comprobantes)
        .where(
          and(
            inArray(comprobantes.estado, ['autorizado', 'pendiente_verificacion']),
            gte(comprobantes.fecha, desde),
            sql`${comprobantes.fecha} <= ${hasta}`,
          ),
        )
    )[0].n,
    (
      await tx
        .select({ n: count() })
        .from(puntosVenta)
        .where(and(eq(puntosVenta.activo, true), inArray(puntosVenta.tipo, ['electronico', 'fce'])))
    )[0].n,
  ])
  return { usuarios: usuariosActivos + pendientes, comprobantesMes, puntosVenta: puntos }
}

/**
 * Control de un límite antes de sumar algo. Devuelve el mensaje para el
 * usuario si no entra en el plan.
 */
export async function controlarLimite(
  empresaId: string,
  limite: 'usuarios' | 'comprobantesMes' | 'puntosVenta',
  hoy: string = hoyArgentina(),
): Promise<string | null> {
  const sit = situacion(await suscripcionDe(empresaId), hoy)
  const tope = sit.limites[limite]
  if (tope === null) return null
  const uso = (await usoDe(empresaId, hoy))[limite]
  if (uso < tope) return null
  const que = {
    usuarios: `usuarios (${tope})`,
    comprobantesMes: `comprobantes con CAE este mes (${tope})`,
    puntosVenta: `puntos de venta electrónicos (${tope})`,
  }[limite]
  return `El plan ${sit.plan.nombre} llegó al máximo de ${que}. Podés mejorar el plan en Configuración › Suscripción.`
}

// ------------------------------------------------------- Alta de empresas

const EsquemaAlta = z.object({
  razonSocial: z.string().trim().min(3, { error: 'Escribí la razón social.' }),
  cuit: z.string(),
  condicionIva: z.coerce
    .number()
    .int()
    .refine((v) => [1, 4, 6].includes(v), { error: 'Elegí la condición frente al IVA.' }),
})

/**
 * Da de alta una empresa para un usuario: la crea, lo hace Dueño, abre la
 * prueba gratis y deja lo mínimo para empezar (depósito, lista y condiciones
 * de pago). Los puntos de venta y el certificado de ARCA los carga la empresa.
 */
export async function crearEmpresa(
  usuarioId: string,
  entrada: unknown,
  hoy: string = hoyArgentina(),
): Promise<{ ok: true; empresaId: string } | { ok: false; error: string }> {
  const p = EsquemaAlta.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const cuit = validarCuit(p.data.cuit)
  if (!cuit.valido) return { ok: false, error: cuit.error }
  const r = await comoPlataforma(async (tx) => {
    const [ya] = await tx.select({ id: empresas.id }).from(empresas).where(eq(empresas.cuit, cuit.cuit))
    if (ya) return { error: 'Esa empresa ya usa el sistema. Pedile a quien la administra que te invite.' }
    const [empresa] = await tx
      .insert(empresas)
      .values({ razonSocial: p.data.razonSocial, cuit: cuit.cuit, condicionIva: p.data.condicionIva })
      .returning()
    const [dueno] = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.nombre, 'Dueño'), isNull(roles.empresaId)))
    await tx.insert(membresias).values({ usuarioId, empresaId: empresa.id, rolId: dueno.id })
    const pruebaHasta = sumarDias(hoy, DIAS_DE_PRUEBA)
    await tx.insert(suscripciones).values({ empresaId: empresa.id, plan: PLAN_DE_PRUEBA, estado: 'prueba', pruebaHasta })
    await tx
      .insert(eventosSuscripcion)
      .values({ empresaId: empresa.id, tipo: 'alta', detalle: { plan: PLAN_DE_PRUEBA, pruebaHasta }, usuarioId })
    return { empresaId: empresa.id }
  })
  if ('error' in r) return { ok: false, error: r.error! }
  await conEmpresa(r.empresaId, async (tx) => {
    await tx.insert(depositos).values({ codigo: '001', nombre: 'Depósito central' })
    await tx.insert(listasPrecios).values({ codigo: '001', nombre: 'Lista general', moneda: 'PES' })
    await tx.insert(condicionesPago).values([
      { nombre: 'Contado', dias: 0 },
      { nombre: 'Cuenta corriente 30 días', dias: 30 },
    ])
    await auditar(tx, { usuarioId, accion: 'alta', entidad: 'empresa', entidadId: r.empresaId, despues: p.data })
  })
  return { ok: true, empresaId: r.empresaId }
}

// ------------------------------------------------- Cambios desde la empresa

const EsquemaCambio = z.object({
  plan: z.enum(ORDEN_PLANES as [PlanId, ...PlanId[]]),
  ciclo: z.enum(['mensual', 'anual']).default('mensual'),
  aplicaciones: z.array(z.enum(APLICACIONES.map((a) => a.id) as ['contratos', 'tienda'])).default([]),
  usuariosAdicionales: z.coerce.number().int().min(0).max(200).default(0),
})

export type ResultadoCambio = { ok: true; aplicado: boolean } | { ok: false; error: string }

/**
 * Cambio de plan pedido por la empresa. Durante la prueba, o al pasar al plan
 * gratis, se aplica en el momento. Si hay que cobrar, queda como pedido para
 * que la plataforma lo confirme con el pago.
 */
export async function pedirCambio(
  empresaId: string,
  usuarioId: string,
  entrada: unknown,
  hoy = hoyArgentina(),
): Promise<ResultadoCambio> {
  const p = EsquemaCambio.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const pedido = p.data
  const plan = planPorId(pedido.plan)
  for (const id of pedido.aplicaciones) {
    const app = APLICACIONES.find((a) => a.id === id)!
    if (!app.disponible) return { ok: false, error: 'Esa aplicación todavía no está disponible.' }
    if (ORDEN_PLANES.indexOf(plan.id) < ORDEN_PLANES.indexOf(app.desde)) {
      return { ok: false, error: `La aplicación necesita el plan ${planPorId(app.desde).nombre} o superior.` }
    }
  }
  const actual = await suscripcionDe(empresaId)
  // No se puede bajar por debajo de lo que ya se usa.
  const uso = await usoDe(empresaId, hoy)
  const usuariosDelPlan = plan.limites.usuarios + pedido.usuariosAdicionales
  if (uso.usuarios > usuariosDelPlan) {
    return {
      ok: false,
      error: `Hay ${uso.usuarios} usuarios con acceso o invitados y el plan ${plan.nombre} permite ${usuariosDelPlan}. Quitá accesos o sumá usuarios adicionales.`,
    }
  }
  if (uso.puntosVenta > plan.limites.puntosVenta) {
    return {
      ok: false,
      error: `Hay ${uso.puntosVenta} puntos de venta electrónicos activos y el plan ${plan.nombre} permite ${plan.limites.puntosVenta}.`,
    }
  }

  const enPrueba = actual.estado === 'prueba'
  const aplicarYa = enPrueba || plan.precioMensual === 0
  await comoPlataforma(async (tx) => {
    if (aplicarYa) {
      await tx
        .update(suscripciones)
        .set({
          plan: pedido.plan,
          ciclo: pedido.ciclo,
          aplicaciones: plan.admiteAplicaciones ? pedido.aplicaciones : [],
          usuariosAdicionales: pedido.usuariosAdicionales,
          // El plan gratis no vence.
          ...(plan.precioMensual === 0 ? { estado: 'activa', pruebaHasta: null, pagadoHasta: null } : {}),
          actualizado: new Date(),
        })
        .where(eq(suscripciones.empresaId, empresaId))
      await tx
        .insert(eventosSuscripcion)
        .values({ empresaId, tipo: 'cambio', detalle: { ...pedido, desde: actual.plan }, usuarioId })
    } else {
      // Un pedido nuevo reemplaza al que estuviera pendiente.
      await tx
        .update(eventosSuscripcion)
        .set({ estado: 'rechazado' })
        .where(
          and(
            eq(eventosSuscripcion.empresaId, empresaId),
            eq(eventosSuscripcion.tipo, 'pedido'),
            eq(eventosSuscripcion.estado, 'pendiente'),
          ),
        )
      await tx.insert(eventosSuscripcion).values({ empresaId, tipo: 'pedido', detalle: pedido, estado: 'pendiente', usuarioId })
    }
  })
  await conEmpresa(empresaId, (tx) =>
    auditar(tx, { usuarioId, accion: aplicarYa ? 'modificacion' : 'alta', entidad: 'suscripcion', despues: pedido }),
  )
  return { ok: true, aplicado: aplicarYa }
}

export async function historial(empresaId: string) {
  return comoPlataforma((tx) =>
    tx
      .select({
        id: eventosSuscripcion.id,
        tipo: eventosSuscripcion.tipo,
        detalle: eventosSuscripcion.detalle,
        estado: eventosSuscripcion.estado,
        creado: eventosSuscripcion.creado,
        usuario: usuarios.nombre,
      })
      .from(eventosSuscripcion)
      .leftJoin(usuarios, eq(usuarios.id, eventosSuscripcion.usuarioId))
      .where(eq(eventosSuscripcion.empresaId, empresaId))
      .orderBy(desc(eventosSuscripcion.creado))
      .limit(30),
  )
}

// ------------------------------------------------------------ Plataforma

/** Todas las empresas con su suscripción y pedidos pendientes, para el panel de la plataforma. */
export async function listarSuscripciones() {
  return comoPlataforma(async (tx) => {
    const filas = await tx
      .select({
        empresaId: empresas.id,
        razonSocial: empresas.razonSocial,
        cuit: empresas.cuit,
        alta: empresas.creado,
        activa: empresas.activa,
        plan: suscripciones.plan,
        estado: suscripciones.estado,
        ciclo: suscripciones.ciclo,
        aplicaciones: suscripciones.aplicaciones,
        usuariosAdicionales: suscripciones.usuariosAdicionales,
        pruebaHasta: suscripciones.pruebaHasta,
        pagadoHasta: suscripciones.pagadoHasta,
        precioAcordado: suscripciones.precioAcordado,
        observaciones: suscripciones.observaciones,
        pedidos: sql<number>`(select count(*)::int from eventos_suscripcion e where e.empresa_id = empresas.id and e.estado = 'pendiente')`,
        usuarios: sql<number>`(select count(*)::int from membresias m where m.empresa_id = empresas.id and m.activa)`,
      })
      .from(empresas)
      .leftJoin(suscripciones, eq(suscripciones.empresaId, empresas.id))
      .orderBy(desc(empresas.creado))
    return filas
  })
}

export async function pedidosPendientes() {
  return comoPlataforma((tx) =>
    tx
      .select({
        id: eventosSuscripcion.id,
        empresaId: eventosSuscripcion.empresaId,
        empresa: empresas.razonSocial,
        detalle: eventosSuscripcion.detalle,
        creado: eventosSuscripcion.creado,
        usuario: usuarios.nombre,
        email: usuarios.email,
      })
      .from(eventosSuscripcion)
      .innerJoin(empresas, eq(empresas.id, eventosSuscripcion.empresaId))
      .leftJoin(usuarios, eq(usuarios.id, eventosSuscripcion.usuarioId))
      .where(eq(eventosSuscripcion.estado, 'pendiente'))
      .orderBy(eventosSuscripcion.creado),
  )
}

const EsquemaAdmin = z.object({
  plan: z.enum(ORDEN_PLANES as [PlanId, ...PlanId[]]),
  estado: z.enum(['prueba', 'activa', 'impaga', 'suspendida', 'cancelada']),
  ciclo: z.enum(['mensual', 'anual']),
  aplicaciones: z.array(z.string()).default([]),
  usuariosAdicionales: z.coerce.number().int().min(0).max(500),
  pruebaHasta: z.iso.date().nullable(),
  pagadoHasta: z.iso.date().nullable(),
  precioAcordado: z
    .string()
    .trim()
    .nullable()
    .transform((v) => (v ? v.replace(/\./g, '').replace(',', '.') : null))
    .pipe(
      z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/, { error: 'Precio inválido.' })
        .nullable(),
    ),
  observaciones: z
    .string()
    .trim()
    .nullable()
    .transform((v) => v || null),
})

/** Cambio hecho por la plataforma (alta de un pago, cambio de plan, suspensión…). */
export async function actualizarSuscripcion(adminId: string, empresaId: string, entrada: unknown): Promise<Resultado> {
  const p = EsquemaAdmin.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const d = p.data
  const antes = await suscripcionDe(empresaId)
  await comoPlataforma(async (tx) => {
    await tx
      .insert(suscripciones)
      .values({ empresaId, ...d })
      .onConflictDoUpdate({ target: suscripciones.empresaId, set: { ...d, actualizado: new Date() } })
    await tx.insert(eventosSuscripcion).values({ empresaId, tipo: 'cambio', detalle: { antes, despues: d }, usuarioId: adminId })
  })
  return { ok: true }
}

/** Registra un pago: corre la fecha de pago un mes o un año y deja la suscripción activa. */
export async function registrarPago(
  adminId: string | null,
  empresaId: string,
  entrada: { importe: string; medio: string; referencia?: string },
  hoy = hoyArgentina(),
): Promise<Resultado> {
  const s = await suscripcionDe(empresaId)
  const desde = s.pagadoHasta && s.pagadoHasta > hoy ? s.pagadoHasta : hoy
  const [a, m, dia] = desde.split('-').map(Number)
  const meses = s.ciclo === 'anual' ? 12 : 1
  const fin = new Date(Date.UTC(a, m - 1 + meses, Math.min(dia, 28))).toISOString().slice(0, 10)
  await comoPlataforma(async (tx) => {
    await tx
      .update(suscripciones)
      .set({ estado: 'activa', pagadoHasta: fin, pruebaHasta: null, actualizado: new Date() })
      .where(eq(suscripciones.empresaId, empresaId))
    await tx
      .insert(eventosSuscripcion)
      .values({ empresaId, tipo: 'pago', detalle: { ...entrada, hasta: fin }, usuarioId: adminId })
  })
  return { ok: true }
}

/** Aplica un pedido pendiente (después de cobrar) o lo rechaza. */
export async function resolverPedido(adminId: string | null, pedidoId: string, aceptar: boolean): Promise<Resultado> {
  const [pedido] = await comoPlataforma((tx) =>
    tx
      .select()
      .from(eventosSuscripcion)
      .where(and(eq(eventosSuscripcion.id, pedidoId), eq(eventosSuscripcion.estado, 'pendiente'))),
  )
  if (!pedido) return { ok: false, error: 'El pedido ya se resolvió.' }
  const d = pedido.detalle as z.infer<typeof EsquemaCambio>
  await comoPlataforma(async (tx) => {
    await tx
      .update(eventosSuscripcion)
      .set({ estado: aceptar ? 'atendido' : 'rechazado' })
      .where(eq(eventosSuscripcion.id, pedidoId))
    if (aceptar) {
      await tx
        .update(suscripciones)
        .set({
          plan: d.plan,
          ciclo: d.ciclo,
          aplicaciones: d.aplicaciones,
          usuariosAdicionales: d.usuariosAdicionales,
          actualizado: new Date(),
        })
        .where(eq(suscripciones.empresaId, pedido.empresaId))
      await tx.insert(eventosSuscripcion).values({ empresaId: pedido.empresaId, tipo: 'cambio', detalle: d, usuarioId: adminId })
    }
  })
  return { ok: true }
}

/** Suscripciones que vencieron la prueba o el pago (para avisar y para el panel). */
export async function vencidas(hoy = hoyArgentina()) {
  return comoPlataforma((tx) =>
    tx
      .select({ empresaId: suscripciones.empresaId, estado: suscripciones.estado })
      .from(suscripciones)
      .where(
        sql`(${suscripciones.estado} = 'prueba' and ${suscripciones.pruebaHasta} < ${hoy}) or (${suscripciones.estado} = 'activa' and ${suscripciones.pagadoHasta} < ${hoy})`,
      ),
  )
}
