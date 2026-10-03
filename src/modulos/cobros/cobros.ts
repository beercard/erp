import { randomBytes } from 'node:crypto'

import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { comoPlataforma, conEmpresa } from '../../db/empresa'
import { clavesCobro, cuentasTesoreria, empresas, pagosOnline, pasarelasPago, recibos, terceros } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { aImporte, D, monto } from '../../lib/dinero'
import { hoyArgentina } from '../../lib/fechas'
import { cifrar, descifrar } from '../arca/certificado'
import { emitirRecibo, pendientes } from '../facturacion/cuentas'
import { MEDIOS } from '../facturacion/medios'
import { pasarela, PROVEEDORES, type DatosAviso, type Fetch, type Proveedor } from './pasarelas'

/**
 * Cobros online. La empresa conecta sus pasarelas y crea links de pago del
 * ERP (/pago/<clave>) por una o varias facturas o por un importe. El cliente
 * abre el link, elige con qué pagar y el ERP arma el checkout en ese momento
 * (así el link no vence aunque el de la pasarela sí). Cuando la pasarela
 * confirma, se emite el recibo solo y se imputa a las facturas.
 *
 * Lo que va por la red queda fuera de las transacciones.
 */

type Resultado<T = { id: string }> = ({ ok: true } & T) | { ok: false; error: string }

const nuevaClave = () => randomBytes(18).toString('base64url')
export const CLAVE_VALIDA = /^[A-Za-z0-9_-]{20,40}$/

export const base = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
export const urlPago = (clave: string) => `${base()}/pago/${clave}`
export const urlAviso = (clave: string) => `${base()}/api/cobros/aviso/${clave}`

/** Cuánto dura un link de pago del ERP. */
const DIAS_LINK = 30

// ------------------------------------------------------------------ Pasarelas

export async function listarPasarelas(tx: Transaccion) {
  const filas = await tx.select().from(pasarelasPago)
  const claves = filas.length
    ? await tx
        .select()
        .from(clavesCobro)
        .where(
          and(
            eq(clavesCobro.tipo, 'pasarela'),
            inArray(
              clavesCobro.id,
              filas.map((f) => f.id),
            ),
          ),
        )
    : []
  return filas.map(({ credenciales, secretoAvisos, ...p }) => {
    let visibles: Record<string, string> = {}
    try {
      // Solo lo que no es secreto, para mostrar qué cuenta está conectada.
      const c = JSON.parse(descifrar(credenciales)) as Record<string, string>
      const ocultos = new Set(PROVEEDORES[p.proveedor as Proveedor].campos.filter((x) => x.secreto).map((x) => x.clave))
      visibles = Object.fromEntries(Object.entries(c).filter(([k]) => !ocultos.has(k)))
    } catch {
      // Credenciales ilegibles (cambió la clave maestra): se muestran vacías.
    }
    return {
      ...p,
      visibles,
      conSecreto: Boolean(secretoAvisos),
      aviso: urlAviso(claves.find((k) => k.id === p.id)?.clave ?? ''),
    }
  })
}

export async function guardarPasarela(
  tx: Transaccion,
  usuarioId: string,
  proveedor: string,
  entrada: Record<string, unknown>,
): Promise<Resultado> {
  if (!(proveedor in PROVEEDORES)) return { ok: false, error: 'Pasarela desconocida.' }
  const def = PROVEEDORES[proveedor as Proveedor]
  const [actual] = await tx.select().from(pasarelasPago).where(eq(pasarelasPago.proveedor, proveedor))
  const anteriores = actual ? (JSON.parse(descifrar(actual.credenciales)) as Record<string, string>) : {}
  const credenciales: Record<string, string> = {}
  let secreto: string | null | undefined
  for (const campo of def.campos) {
    const v = String(entrada[campo.clave] ?? '').trim()
    if (v.length > 500 || /\s/.test(v)) return { ok: false, error: `Revisá "${campo.etiqueta}".` }
    if (campo.clave === 'secreto') {
      // El secreto de los avisos se guarda aparte. Vacío al editar: queda el que estaba.
      secreto = v || undefined
      continue
    }
    // Los secretos no se muestran: vacío al editar es "dejar el que estaba".
    const valor = v || (campo.secreto ? anteriores[campo.clave] : '')
    if (!valor) return { ok: false, error: `Completá "${campo.etiqueta}".` }
    credenciales[campo.clave] = valor
  }
  if (proveedor === 'clover' && !secreto && !actual?.secretoAvisos) {
    return { ok: false, error: 'Clover necesita el "signing secret" de los webhooks para confirmar los pagos.' }
  }
  const medio = String(entrada.medio ?? def.medio)
  if (!(medio in MEDIOS) || medio.startsWith('retencion') || ['cheque', 'echeq'].includes(medio)) {
    return { ok: false, error: 'Elegí con qué medio quedan los recibos.' }
  }
  const cuentaId = String(entrada.cuentaId ?? '') || null
  if (cuentaId) {
    const [c] = await tx.select({ id: cuentasTesoreria.id }).from(cuentasTesoreria).where(eq(cuentasTesoreria.id, cuentaId))
    if (!c) return { ok: false, error: 'Esa cuenta no existe.' }
  }
  const valores = {
    credenciales: cifrar(JSON.stringify(credenciales)),
    ...(secreto !== undefined ? { secretoAvisos: secreto ? cifrar(secreto) : null } : {}),
    activa: entrada.activa !== false,
    prueba: entrada.prueba === true,
    medio,
    cuentaId,
    actualizado: new Date(),
  }
  let id: string
  if (actual) {
    await tx.update(pasarelasPago).set(valores).where(eq(pasarelasPago.id, actual.id))
    id = actual.id
  } else {
    const [n] = await tx
      .insert(pasarelasPago)
      .values({ ...valores, proveedor })
      .returning()
    id = n.id
    const [{ empresaId }] = await tx
      .select({ empresaId: pasarelasPago.empresaId })
      .from(pasarelasPago)
      .where(eq(pasarelasPago.id, id))
    await tx.insert(clavesCobro).values({ clave: nuevaClave(), tipo: 'pasarela', empresaId, id })
  }
  await auditar(tx, {
    usuarioId,
    accion: actual ? 'modificacion' : 'alta',
    entidad: 'pasarela_pago',
    entidadId: id,
    despues: { proveedor, activa: valores.activa, prueba: valores.prueba, medio, cuentaId },
  })
  return { ok: true, id }
}

export async function quitarPasarela(tx: Transaccion, usuarioId: string, id: string) {
  await tx.delete(clavesCobro).where(and(eq(clavesCobro.tipo, 'pasarela'), eq(clavesCobro.id, id)))
  await tx.delete(pasarelasPago).where(eq(pasarelasPago.id, id))
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'pasarela_pago', entidadId: id })
  return { ok: true as const }
}

export async function hayPasarelas(tx: Transaccion) {
  const [f] = await tx.select({ id: pasarelasPago.id }).from(pasarelasPago).where(eq(pasarelasPago.activa, true)).limit(1)
  return Boolean(f)
}

// ------------------------------------------------------------------ Links de pago

const EsquemaPago = z.object({
  terceroId: z.uuid({ error: 'Elegí el cliente.' }),
  comprobanteIds: z.array(z.uuid()).max(50).default([]),
  /** Sin facturas: un importe libre (o el saldo de la cuenta si viene vacío). */
  importe: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) =>
      String(v ?? '')
        .trim()
        .replace(/\./g, '')
        .replace(',', '.'),
    )
    .pipe(z.string().regex(/^(\d+(\.\d{1,2})?)?$/, { error: 'Escribí el importe en pesos.' })),
  concepto: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
  origen: z.enum(['erp', 'portal', 'whatsapp']).default('erp'),
})

/** Crea un link de pago: por facturas (su saldo), por un importe, o por todo lo que debe el cliente. */
export async function crearPago(
  tx: Transaccion,
  usuarioId: string | null,
  entrada: unknown,
): Promise<Resultado<{ id: string; clave: string; importe: string }>> {
  const p = EsquemaPago.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const d = p.data
  const [cliente] = await tx
    .select({ id: terceros.id, razonSocial: terceros.razonSocial })
    .from(terceros)
    .where(eq(terceros.id, d.terceroId))
  if (!cliente) return { ok: false, error: 'Ese cliente no existe.' }
  let importe: InstanceType<typeof D>
  let comprobanteIds = d.comprobanteIds
  let concepto = d.concepto
  const deuda = await pendientes(tx, { terceroId: d.terceroId })
  if (comprobanteIds.length) {
    const elegidas = deuda.filter((x) => comprobanteIds.includes(x.id))
    if (elegidas.length !== comprobanteIds.length)
      return { ok: false, error: 'Alguna de las facturas ya está pagada o no es de este cliente.' }
    importe = elegidas.reduce((s, x) => s.plus(x.saldo), new D(0))
    concepto ??=
      elegidas.length === 1
        ? `Factura ${String(elegidas[0].puntoVenta).padStart(5, '0')}-${String(elegidas[0].numero ?? 0).padStart(8, '0')}`
        : `${elegidas.length} facturas`
  } else if (d.importe) {
    importe = monto(d.importe)
    concepto ??= 'Pago a cuenta'
  } else {
    importe = deuda.reduce((s, x) => s.plus(x.saldo), new D(0))
    comprobanteIds = deuda.map((x) => x.id)
    concepto ??= 'Saldo de la cuenta'
  }
  if (!importe.gt(0)) return { ok: false, error: 'No hay nada para cobrar.' }
  if (importe.gt('100000000')) return { ok: false, error: 'El importe es demasiado alto para un link de pago.' }
  const clave = nuevaClave()
  const claveAviso = nuevaClave()
  const [pago] = await tx
    .insert(pagosOnline)
    .values({
      terceroId: d.terceroId,
      concepto,
      importe: aImporte(importe),
      comprobanteIds,
      clave,
      claveAviso,
      origen: d.origen,
      vence: new Date(Date.now() + DIAS_LINK * 86_400_000),
      usuarioId,
    })
    .returning()
  await tx.insert(clavesCobro).values([
    { clave, tipo: 'pago', empresaId: pago.empresaId, id: pago.id },
    { clave: claveAviso, tipo: 'aviso', empresaId: pago.empresaId, id: pago.id },
  ])
  await auditar(tx, {
    usuarioId,
    accion: 'alta',
    entidad: 'pago_online',
    entidadId: pago.id,
    despues: { importe: pago.importe, concepto, comprobanteIds },
  })
  return { ok: true, id: pago.id, clave, importe: pago.importe }
}

export async function cancelarPago(tx: Transaccion, usuarioId: string, id: string) {
  const [p] = await tx
    .update(pagosOnline)
    .set({ estado: 'cancelado', actualizado: new Date() })
    .where(and(eq(pagosOnline.id, id), eq(pagosOnline.estado, 'pendiente')))
    .returning()
  if (!p) return { ok: false as const, error: 'Ese link ya no está pendiente.' }
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'pago_online', entidadId: id })
  return { ok: true as const }
}

export async function listarPagos(tx: Transaccion, filtro: { estado?: string; terceroId?: string } = {}) {
  return tx
    .select({
      id: pagosOnline.id,
      concepto: pagosOnline.concepto,
      importe: pagosOnline.importe,
      estado: pagosOnline.estado,
      proveedor: pagosOnline.proveedor,
      clave: pagosOnline.clave,
      origen: pagosOnline.origen,
      creado: pagosOnline.creado,
      aprobado: pagosOnline.aprobado,
      vence: pagosOnline.vence,
      reciboId: pagosOnline.reciboId,
      reciboNumero: recibos.numero,
      terceroId: pagosOnline.terceroId,
      cliente: terceros.razonSocial,
      telefono: terceros.telefono,
      detalle: pagosOnline.detalle,
    })
    .from(pagosOnline)
    .innerJoin(terceros, eq(terceros.id, pagosOnline.terceroId))
    .leftJoin(recibos, eq(recibos.id, pagosOnline.reciboId))
    .where(
      and(
        filtro.estado && filtro.estado !== 'todos' ? eq(pagosOnline.estado, filtro.estado) : undefined,
        filtro.terceroId ? eq(pagosOnline.terceroId, filtro.terceroId) : undefined,
      ),
    )
    .orderBy(desc(pagosOnline.creado))
    .limit(300)
}

// ------------------------------------------------------------------ El link público

/** A qué empresa (y a qué pago o pasarela) va una clave del link o de un aviso. Sin sesión. */
export async function buscarClave(clave: string) {
  if (!CLAVE_VALIDA.test(clave)) return null
  const [c] = await comoPlataforma((tx) => tx.select().from(clavesCobro).where(eq(clavesCobro.clave, clave)))
  return c ?? null
}

/** Lo que muestra la página /pago/<clave>: sin datos que no sean del propio pago. */
export async function verPago(clave: string) {
  const c = await buscarClave(clave)
  if (!c || c.tipo !== 'pago') return null
  const [empresa] = await comoPlataforma((tx) =>
    tx
      .select({ nombre: empresas.razonSocial, fantasia: empresas.nombreFantasia })
      .from(empresas)
      .where(eq(empresas.id, c.empresaId)),
  )
  return conEmpresa(c.empresaId, async (tx) => {
    const [p] = await tx
      .select({ pago: pagosOnline, cliente: terceros.razonSocial })
      .from(pagosOnline)
      .innerJoin(terceros, eq(terceros.id, pagosOnline.terceroId))
      .where(eq(pagosOnline.id, c.id))
    if (!p) return null
    const opciones = await tx
      .select({ id: pasarelasPago.id, proveedor: pasarelasPago.proveedor })
      .from(pasarelasPago)
      .where(eq(pasarelasPago.activa, true))
    const vencido = p.pago.estado === 'pendiente' && p.pago.vence && p.pago.vence < new Date()
    return {
      empresaId: c.empresaId,
      empresa: empresa?.fantasia || empresa?.nombre || '',
      id: p.pago.id,
      concepto: p.pago.concepto,
      importe: p.pago.importe,
      estado: vencido ? 'vencido' : p.pago.estado,
      cliente: p.cliente,
      proveedor: p.pago.proveedor,
      aprobado: p.pago.aprobado,
      opciones: opciones.map((o) => ({
        proveedor: o.proveedor as Proveedor,
        nombre: PROVEEDORES[o.proveedor as Proveedor].pagar,
      })),
    }
  })
}

/** El cliente eligió con qué pagar: se arma el checkout en la pasarela y se devuelve su link. */
export async function iniciarPago(clave: string, proveedor: string, f: Fetch = fetch): Promise<Resultado<{ url: string }>> {
  const c = await buscarClave(clave)
  if (!c || c.tipo !== 'pago') return { ok: false, error: 'Ese link de pago no existe.' }
  const datos = await conEmpresa(c.empresaId, async (tx) => {
    const [p] = await tx
      .select({ pago: pagosOnline, cliente: terceros })
      .from(pagosOnline)
      .innerJoin(terceros, eq(terceros.id, pagosOnline.terceroId))
      .where(eq(pagosOnline.id, c.id))
    const [pas] = await tx
      .select()
      .from(pasarelasPago)
      .where(and(eq(pasarelasPago.proveedor, proveedor), eq(pasarelasPago.activa, true)))
    return p && pas ? { ...p, pasarela: pas } : null
  })
  if (!datos) return { ok: false, error: 'Ese medio de pago no está disponible.' }
  const { pago, cliente, pasarela: pas } = datos
  if (pago.estado !== 'pendiente')
    return { ok: false, error: pago.estado === 'aprobado' ? 'Este pago ya está hecho.' : 'Este link ya no está disponible.' }
  if (pago.vence && pago.vence < new Date())
    return { ok: false, error: 'Este link de pago venció. Pedile uno nuevo a quien te lo mandó.' }
  try {
    const ch = await pasarela(f, proveedor as Proveedor, JSON.parse(descifrar(pas.credenciales)), pas.prueba).crear({
      referencia: pago.id,
      importe: Number(pago.importe),
      concepto: pago.concepto,
      comprador: { nombre: cliente.razonSocial, email: cliente.email, telefono: cliente.telefono },
      vuelta: `${urlPago(clave)}?vuelta=1`,
      aviso: urlAviso(pago.claveAviso),
      // El checkout de la pasarela dura poco: si el cliente vuelve más tarde, se arma otro.
      vence: new Date(Math.min(Date.now() + 2 * 86_400_000, pago.vence?.getTime() ?? Infinity)),
    })
    await conEmpresa(c.empresaId, (tx) =>
      tx
        .update(pagosOnline)
        .set({ pasarelaId: pas.id, proveedor, externoId: ch.externoId, urlPasarela: ch.url, actualizado: new Date() })
        .where(and(eq(pagosOnline.id, pago.id), eq(pagosOnline.estado, 'pendiente'))),
    )
    return { ok: true, url: ch.url }
  } catch (e) {
    console.error('[cobros] iniciar', proveedor, e instanceof Error ? e.message : e)
    return { ok: false, error: 'No se pudo abrir el pago. Probá de nuevo o elegí otro medio.' }
  }
}

// ------------------------------------------------------------------ Confirmación

/**
 * Pregunta a la pasarela cómo está el pago y, si se aprobó, emite el recibo
 * (una sola vez: el pago se bloquea mientras tanto) imputado a las facturas.
 */
export async function verificarPago(
  empresaId: string,
  pagoId: string,
  aviso?: DatosAviso,
  f: Fetch = fetch,
): Promise<{ estado: string; reciboId?: string | null }> {
  const datos = await conEmpresa(empresaId, async (tx) => {
    const [p] = await tx.select().from(pagosOnline).where(eq(pagosOnline.id, pagoId))
    if (!p?.pasarelaId) return p ? { pago: p, pasarela: null } : null
    const [pas] = await tx.select().from(pasarelasPago).where(eq(pasarelasPago.id, p.pasarelaId))
    return { pago: p, pasarela: pas ?? null }
  })
  if (!datos) return { estado: 'inexistente' }
  const { pago, pasarela: pas } = datos
  if (pago.estado !== 'pendiente' || !pas) return { estado: pago.estado, reciboId: pago.reciboId }
  const consulta = await pasarela(f, pas.proveedor as Proveedor, JSON.parse(descifrar(pas.credenciales)), pas.prueba).consultar({
    externoId: pago.externoId,
    referencia: pago.id,
    aviso,
  })
  if (consulta.estado !== 'aprobado') {
    await conEmpresa(empresaId, (tx) =>
      tx
        .update(pagosOnline)
        .set({
          detalle: { ultimo: consulta.estado, detalle: consulta.detalle ?? null, cuando: new Date().toISOString() },
          actualizado: new Date(),
        })
        .where(and(eq(pagosOnline.id, pago.id), eq(pagosOnline.estado, 'pendiente'))),
    )
    return { estado: 'pendiente' }
  }
  const r = await conEmpresa(empresaId, (tx) => registrarAprobado(tx, pago.id, pas, consulta))
  if (r.nuevo) {
    // Aviso al cliente por WhatsApp (si está conectado). Que falle no cambia el cobro.
    try {
      const { avisarPagoAcreditado } = await import('../whatsapp/whatsapp')
      await avisarPagoAcreditado(empresaId, pago.terceroId, pago.importe, pago.concepto, f)
    } catch (e) {
      console.error('[cobros] aviso WhatsApp', e instanceof Error ? e.message : e)
    }
  }
  return { estado: r.estado, reciboId: r.reciboId }
}

async function registrarAprobado(
  tx: Transaccion,
  pagoId: string,
  pas: typeof pasarelasPago.$inferSelect,
  consulta: { pagoExternoId?: string; importe?: number; detalle?: string },
) {
  const [pago] = await tx.select().from(pagosOnline).where(eq(pagosOnline.id, pagoId)).for('update')
  if (!pago || pago.estado !== 'pendiente')
    return { estado: pago?.estado ?? 'inexistente', reciboId: pago?.reciboId ?? null, nuevo: false }
  // Lo que cobró la pasarela (si lo informa); si no, lo pedido.
  const cobrado = consulta.importe && consulta.importe > 0 ? monto(String(consulta.importe)) : monto(pago.importe)
  let resto = cobrado
  const imputaciones: { comprobanteId: string; importe: string }[] = []
  if (pago.comprobanteIds.length) {
    const deuda = new Map((await pendientes(tx, { ids: pago.comprobanteIds })).map((x) => [x.id, x]))
    for (const id of pago.comprobanteIds) {
      const x = deuda.get(id)
      if (!x || x.terceroId !== pago.terceroId || !resto.gt(0)) continue
      const parte = D.min(resto, monto(x.saldo))
      if (parte.gt(0)) {
        imputaciones.push({ comprobanteId: id, importe: aImporte(parte) })
        resto = resto.minus(parte)
      }
    }
  }
  const nombre = PROVEEDORES[pas.proveedor as Proveedor].nombre
  const r = await emitirRecibo(tx, null, {
    terceroId: pago.terceroId,
    fecha: hoyArgentina(),
    valores: [
      {
        medio: pas.medio,
        importe: aImporte(cobrado),
        detalle: `${nombre}${consulta.pagoExternoId ? ` · operación ${consulta.pagoExternoId}` : ''}`,
        cuentaId: pas.cuentaId,
      },
    ],
    imputaciones,
    observaciones: `Pago online: ${pago.concepto}`,
  })
  if (!r.ok) {
    // No se pudo emitir (por ejemplo, falta la cuenta del medio): queda aprobado para cargarlo a mano.
    await tx
      .update(pagosOnline)
      .set({
        estado: 'aprobado',
        aprobado: new Date(),
        pagoExternoId: consulta.pagoExternoId ?? null,
        detalle: { ultimo: 'aprobado', error: r.error },
        actualizado: new Date(),
      })
      .where(eq(pagosOnline.id, pago.id))
    return { estado: 'aprobado', reciboId: null, nuevo: true }
  }
  await tx
    .update(pagosOnline)
    .set({
      estado: 'aprobado',
      aprobado: new Date(),
      pagoExternoId: consulta.pagoExternoId ?? null,
      reciboId: r.id,
      detalle: { ultimo: 'aprobado', detalle: consulta.detalle ?? null },
      actualizado: new Date(),
    })
    .where(eq(pagosOnline.id, pago.id))
  await auditar(tx, {
    usuarioId: null,
    accion: 'modificacion',
    entidad: 'pago_online',
    entidadId: pago.id,
    despues: { estado: 'aprobado', reciboId: r.id },
  })
  return { estado: 'aprobado', reciboId: r.id, nuevo: true }
}

/** Busca el pago de un aviso que llegó a la dirección de una pasarela (Clover): por el id del checkout. */
export async function pagoPorExterno(empresaId: string, pasarelaId: string, externoId: string) {
  const [p] = await conEmpresa(empresaId, (tx) =>
    tx
      .select({ id: pagosOnline.id })
      .from(pagosOnline)
      .where(and(eq(pagosOnline.pasarelaId, pasarelaId), eq(pagosOnline.externoId, externoId))),
  )
  return p?.id ?? null
}

export async function secretoDePasarela(empresaId: string, pasarelaId: string) {
  const [p] = await conEmpresa(empresaId, (tx) =>
    tx
      .select({ secreto: pasarelasPago.secretoAvisos, proveedor: pasarelasPago.proveedor })
      .from(pasarelasPago)
      .where(eq(pasarelasPago.id, pasarelaId)),
  )
  return p ? { proveedor: p.proveedor as Proveedor, secreto: p.secreto ? descifrar(p.secreto) : null } : null
}

export async function secretoDelPago(empresaId: string, pagoId: string) {
  const [p] = await conEmpresa(empresaId, (tx) =>
    tx
      .select({ secreto: pasarelasPago.secretoAvisos, proveedor: pasarelasPago.proveedor })
      .from(pagosOnline)
      .innerJoin(pasarelasPago, eq(pasarelasPago.id, pagosOnline.pasarelaId))
      .where(eq(pagosOnline.id, pagoId)),
  )
  return p ? { proveedor: p.proveedor as Proveedor, secreto: p.secreto ? descifrar(p.secreto) : null } : null
}

/**
 * Para la tarea periódica: vence los links viejos y vuelve a preguntar por
 * los pendientes que ya eligieron pasarela (por si se perdió un aviso).
 */
export async function revisarPendientes(empresaId: string, f: Fetch = fetch) {
  const ahora = new Date()
  const lista = await conEmpresa(empresaId, async (tx) => {
    await tx
      .update(pagosOnline)
      .set({ estado: 'vencido', actualizado: ahora })
      .where(and(eq(pagosOnline.estado, 'pendiente'), lt(pagosOnline.vence, ahora)))
    return tx
      .select({ id: pagosOnline.id, proveedor: pagosOnline.proveedor })
      .from(pagosOnline)
      .where(
        and(
          eq(pagosOnline.estado, 'pendiente'),
          sql`${pagosOnline.pasarelaId} is not null`,
          gte(pagosOnline.actualizado, new Date(ahora.getTime() - 7 * 86_400_000)),
        ),
      )
      .limit(50)
  })
  let aprobados = 0
  for (const p of lista) {
    // GoCuotas y Clover solo confirman con su aviso (con el id del pago): no hay a quién preguntar.
    if (p.proveedor === 'gocuotas' || p.proveedor === 'clover') continue
    try {
      if ((await verificarPago(empresaId, p.id, undefined, f)).estado === 'aprobado') aprobados++
    } catch (e) {
      console.error('[cobros] revisar', p.proveedor, e instanceof Error ? e.message : e)
    }
  }
  return { aprobados }
}
