import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm'
import * as z from 'zod'

import { controlarBloqueo } from '../empresa/bloqueos'
import type { Transaccion } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import {
  comprobantes,
  comprobantesAsociados,
  comprobantesItems,
  comprobantesIva,
  comprobantesTributos,
  condicionesIva,
  empresas,
  numeradores,
  percepcionesIibb,
  puntosVenta,
  terceros,
  arcaConfiguracion,
} from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { controlarPeriodoIva } from '../impuestos/presentaciones'
import { validarCuit } from '../../lib/cuit'
import { aImporte, D, monto } from '../../lib/dinero'
import { hoyArgentina, sumarDias } from '../../lib/fechas'
import type { ClienteArca } from '../arca/cliente'
import { ErrorArca, ErrorIncierto, ErrorSinEnviar } from '../arca/soap'
import type { SolicitudCae } from '../arca/wsfe'
import { calcularTotales } from '../comercial/calculo'
import { decimal, EsquemaItem, errorDeBase, opcionalUuid, primerError } from '../comercial/documentos'
import { controlarLimite } from '../plataforma/suscripciones'
import { enPesos, imputarNotaCreditoAsociada } from './cuentas'
import {
  codigoComprobante,
  LEYENDA_CBU_INFORMADA,
  LEYENDA_SUJETA_RETENCION,
  type RegimenClaseA,
  datosTipo,
  documentoReceptor,
  letraPara,
  nombreComprobante,
  rangoFecha,
  type Clase,
  type Letra,
} from './tipos'

/**
 * Comprobantes fiscales de venta. Ciclo de vida:
 *
 *   borrador ──emitir──▶ pendiente_verificacion ──CAE──▶ autorizado
 *       ▲                         │
 *       └──── rechazo de ARCA ────┘
 *
 * El número lo da ARCA (último autorizado + 1). Antes de pedir el CAE el
 * comprobante queda "pendiente de verificación" con ese número, en una
 * transacción ya confirmada: si la conexión se corta y no se sabe si ARCA lo
 * autorizó, se consulta antes de volver a pedir. Así nunca se autoriza dos
 * veces la misma venta.
 */

const fechaOpcional = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .pipe(z.iso.date({ error: 'Fecha inválida.' }).nullable())

const EsquemaComprobante = z.object({
  clase: z.enum(['factura', 'nota_debito', 'nota_credito']),
  fce: z.boolean().default(false),
  puntoVenta: z.coerce.number().int().min(1, { error: 'Elegí el punto de venta.' }).max(99998),
  terceroId: z.uuid({ error: 'Elegí el cliente.' }),
  fecha: z.iso.date({ error: 'Fecha inválida.' }),
  moneda: z.enum(['PES', 'DOL']),
  cotizacion: decimal('Escribí la cotización.').refine((v) => Number(v) > 0, {
    error: 'La cotización tiene que ser mayor que cero.',
  }),
  listaPreciosId: opcionalUuid,
  vendedorId: opcionalUuid,
  condicionPagoId: opcionalUuid,
  observaciones: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
  concepto: z.coerce.number().int().min(1).max(3).default(1),
  servicioDesde: fechaOpcional,
  servicioHasta: fechaOpcional,
  vencimiento: fechaOpcional,
  pedidoId: opcionalUuid,
  asociadoId: opcionalUuid,
  cbu: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v ?? '').replace(/\D/g, '') || null),
  transferencia: z.enum(['SCA', 'ADC']).nullable().optional(),
  anulacion: z.boolean().optional(),
  items: z.array(EsquemaItem).min(1, { error: 'Agregá al menos un renglón.' }),
})

export type ResultadoGuardar = { ok: true; id: string } | { ok: false; error: string }

/** Empresa de la transacción (la emisora). */
export async function empresaEmisora(tx: Transaccion) {
  const [e] = await tx
    .select()
    .from(empresas)
    .where(sql`${empresas.id} = nullif(current_setting('app.empresa_id', true), '')::uuid`)
  return e
}

type Percepcion = typeof percepcionesIibb.$inferSelect

/**
 * Totales del comprobante con IVA por alícuota y percepciones. En los C no se
 * discrimina IVA: el precio es final.
 *
 * Percepción: manda la alícuota de la ficha del cliente (0 = no se le
 * percibe). Sin alícuota en la ficha, la general se aplica solo a clientes de
 * la provincia de la percepción: un régimen provincial alcanza a los que
 * están en esa jurisdicción, no a todos.
 */
export function calcularComprobante(
  letra: Letra,
  items: { cantidad: string; precioUnitario: string; descuento?: string | null; alicuotaIva: number }[],
  percepcion: { alicuotaCliente: string | null; provinciaCliente: string | null; activas: Percepcion[] },
) {
  const { lineas, totales } = calcularTotales(items)
  const iva = letra === 'C' ? [] : totales.porAlicuota
  const neto = monto(totales.neto)
  const ivaTotal = letra === 'C' ? new D(0) : monto(totales.iva)
  const tributos = []
  for (const p of percepcion.activas) {
    if (p.soloLetraA && letra !== 'A') continue
    const deLaProvincia = !p.provincia || p.provincia === percepcion.provinciaCliente
    const alicuota = percepcion.alicuotaCliente ?? (deLaProvincia ? p.alicuota : '0')
    if (monto(alicuota).lte(0) || neto.lt(p.minimoBase)) continue
    const importe = aImporte(neto.times(alicuota).dividedBy(100))
    if (monto(importe).lte(0)) continue
    tributos.push({
      tributo: p.tributoArca,
      descripcion: p.nombre,
      base: aImporte(neto),
      alicuota: monto(alicuota).toFixed(4),
      importe,
      percepcionId: p.id,
    })
  }
  const totalTributos = tributos.reduce((s, x) => s.plus(x.importe), new D(0))
  return {
    lineas: letra === 'C' ? lineas.map((l) => ({ ...l, iva: '0.00' })) : lineas,
    iva,
    tributos,
    totales: {
      neto: aImporte(neto),
      noGravado: '0.00',
      exento: '0.00',
      iva: aImporte(ivaTotal),
      tributos: aImporte(totalTributos),
      total: aImporte(neto.plus(ivaTotal).plus(totalTributos)),
    },
  }
}

/** Datos del receptor que se informan a ARCA, tomados de la ficha actual. */
function datosReceptor(t: typeof terceros.$inferSelect) {
  const { docTipo, docNumero } = documentoReceptor(t.tipoDocumento, t.numeroDocumento)
  return {
    receptorNombre: t.razonSocial,
    receptorDocTipo: docTipo,
    receptorDocNumero: docNumero,
    // Sin condición cargada es consumidor final (5).
    receptorCondicionIva: t.condicionIva ?? 5,
    receptorDomicilio: [t.domicilio, t.localidad].filter(Boolean).join(', ') || null,
  }
}

export async function guardarComprobante(
  tx: Transaccion,
  usuarioId: string,
  entrada: unknown,
  id?: string,
): Promise<ResultadoGuardar> {
  const p = EsquemaComprobante.safeParse(entrada)
  if (!p.success) return { ok: false, error: primerError(p.error) }
  const d = p.data
  const empresa = await empresaEmisora(tx)
  const [tercero] = await tx.select().from(terceros).where(eq(terceros.id, d.terceroId))
  if (!tercero) return { ok: false, error: 'Ese cliente ya no existe.' }
  const [condicion] = await tx
    .select()
    .from(condicionesIva)
    .where(eq(condicionesIva.codigo, tercero.condicionIva ?? 5))
  const letra = letraPara(empresa.condicionIva, condicion?.letraDesdeInscripto)

  const [pv] = await tx.select().from(puntosVenta).where(eq(puntosVenta.numero, d.puntoVenta))
  if (!pv || !pv.activo || !['electronico', 'fce'].includes(pv.tipo)) {
    return { ok: false, error: `El punto de venta ${d.puntoVenta} no está habilitado para factura electrónica.` }
  }

  // Notas de crédito y débito: siempre sobre un comprobante autorizado del mismo cliente y letra.
  let asociado: typeof comprobantes.$inferSelect | undefined
  if (d.clase !== 'factura') {
    if (!d.asociadoId) return { ok: false, error: 'Elegí el comprobante que corrige esta nota.' }
    ;[asociado] = await tx.select().from(comprobantes).where(eq(comprobantes.id, d.asociadoId))
    if (!asociado || asociado.estado !== 'autorizado') return { ok: false, error: 'El comprobante asociado no está autorizado.' }
    if (asociado.terceroId !== d.terceroId) return { ok: false, error: 'El comprobante asociado es de otro cliente.' }
    if (asociado.letra !== letra) {
      return {
        ok: false,
        error: `El comprobante asociado es ${asociado.letra} y esta nota sería ${letra}: revisá la condición de IVA del cliente.`,
      }
    }
    if (asociado.clase === 'nota_credito') return { ok: false, error: 'Una nota no se asocia a una nota de crédito.' }
  }

  // RG 5762/2025: la A puede ir con leyenda (y la sujeta a retención con los códigos 51 a 53).
  // Las notas siguen a su comprobante; las facturas, al régimen que ARCA le asignó a la empresa.
  const [arca] = await tx
    .select({ regimen: arcaConfiguracion.regimenClaseA, cbu: arcaConfiguracion.cbuInformada })
    .from(arcaConfiguracion)
  const regimen = (arca?.regimen ?? 'comun') as RegimenClaseA
  const sujetaRetencion =
    letra === 'A' && !d.fce && (asociado ? datosTipo(asociado.tipo).sujetaRetencion : regimen === 'sujeta_retencion')
  const tipo = codigoComprobante(letra, d.clase, d.fce, sujetaRetencion)
  const conCbu =
    letra === 'A' &&
    !d.fce &&
    !sujetaRetencion &&
    (asociado ? asociado.leyenda === LEYENDA_CBU_INFORMADA : regimen === 'cbu_informada')
  if ((sujetaRetencion || conCbu) && !asociado && arca?.cbu?.length !== 22) {
    return { ok: false, error: 'Los comprobantes A con leyenda se cobran en la CBU informada: cargala en Configuración → ARCA.' }
  }
  const leyenda = sujetaRetencion ? LEYENDA_SUJETA_RETENCION : conCbu ? LEYENDA_CBU_INFORMADA : null

  if (d.concepto !== 1 && (!d.servicioDesde || !d.servicioHasta || !d.vencimiento)) {
    return { ok: false, error: 'Para servicios, ARCA pide el período facturado (desde y hasta) y el vencimiento del pago.' }
  }
  if (d.servicioDesde && d.servicioHasta && d.servicioDesde > d.servicioHasta) {
    return { ok: false, error: 'El período de servicio termina antes de empezar.' }
  }

  const opcionales: { id: string; valor: string }[] = []
  if (d.fce) {
    if (d.clase === 'factura') {
      if (!d.cbu || d.cbu.length !== 22)
        return { ok: false, error: 'La factura de crédito electrónica lleva el CBU de la empresa (22 dígitos).' }
      if (!d.vencimiento) return { ok: false, error: 'La factura de crédito electrónica lleva fecha de vencimiento del pago.' }
      opcionales.push({ id: '2101', valor: d.cbu }, { id: '27', valor: d.transferencia ?? 'SCA' })
    } else {
      opcionales.push({ id: '22', valor: d.anulacion ? 'S' : 'N' })
    }
  }

  const activas = await tx.select().from(percepcionesIibb).where(eq(percepcionesIibb.activa, true))
  const calculo = calcularComprobante(
    letra,
    d.items.map((i) => ({ ...i, descuento: i.descuento ?? '0' })),
    {
      alicuotaCliente: tercero.percepcionIibb,
      provinciaCliente: tercero.provincia,
      activas,
    },
  )

  const cabecera = {
    clase: d.clase,
    letra,
    tipo,
    leyenda,
    puntoVenta: d.puntoVenta,
    fecha: d.fecha,
    terceroId: d.terceroId,
    ...datosReceptor(tercero),
    concepto: d.concepto,
    servicioDesde: d.concepto === 1 ? null : d.servicioDesde,
    servicioHasta: d.concepto === 1 ? null : d.servicioHasta,
    vencimiento: d.vencimiento,
    moneda: d.moneda,
    cotizacion: d.moneda === 'PES' ? '1' : d.cotizacion,
    listaPreciosId: d.listaPreciosId,
    vendedorId: d.vendedorId,
    condicionPagoId: d.condicionPagoId,
    pedidoId: d.pedidoId,
    observaciones: d.observaciones,
    opcionales: opcionales.length ? opcionales : null,
    respuestaArca: null,
    ...calculo.totales,
  }
  const items = d.items.map((i, n) => ({
    orden: n + 1,
    articuloId: i.articuloId ?? null,
    descripcion: i.descripcion,
    cantidad: i.cantidad,
    precioUnitario: i.precioUnitario,
    descuento: i.descuento ?? '0',
    alicuotaIva: i.alicuotaIva,
    neto: calculo.lineas[n].neto,
    iva: calculo.lineas[n].iva,
  }))

  try {
    // Punto de guardado: si algo falla, se deshace solo esto y la transacción sigue sana.
    return await tx.transaction(async (tx) => {
      let comprobanteId = id
      if (id) {
        const [antes] = await tx.select().from(comprobantes).where(eq(comprobantes.id, id))
        if (!antes) return { ok: false, error: 'Ese comprobante ya no existe.' }
        if (antes.estado !== 'borrador') return { ok: false, error: 'Solo se modifica un borrador.' }
        await tx.update(comprobantes).set(cabecera).where(eq(comprobantes.id, id))
        for (const tabla of [comprobantesItems, comprobantesIva, comprobantesTributos, comprobantesAsociados]) {
          await tx.delete(tabla).where(eq(tabla.comprobanteId, id))
        }
      } else {
        const [nuevo] = await tx
          .insert(comprobantes)
          .values({ ...cabecera, usuarioId })
          .returning({ id: comprobantes.id })
        comprobanteId = nuevo.id
      }
      await tx.insert(comprobantesItems).values(items.map((i) => ({ ...i, comprobanteId: comprobanteId! })))
      if (calculo.iva.length) {
        await tx
          .insert(comprobantesIva)
          .values(
            calculo.iva.map((a) => ({ comprobanteId: comprobanteId!, alicuotaIva: a.alicuotaIva, base: a.base, importe: a.iva })),
          )
      }
      if (calculo.tributos.length) {
        await tx.insert(comprobantesTributos).values(calculo.tributos.map((x) => ({ ...x, comprobanteId: comprobanteId! })))
      }
      if (asociado) await tx.insert(comprobantesAsociados).values({ comprobanteId: comprobanteId!, asociadoId: asociado.id })
      await auditar(tx, {
        usuarioId,
        accion: id ? 'modificacion' : 'alta',
        entidad: 'comprobante',
        entidadId: comprobanteId,
        despues: { cabecera, items },
      })
      return { ok: true, id: comprobanteId! }
    })
  } catch (e) {
    const m = errorDeBase(e)
    if (m) return { ok: false, error: m }
    throw e
  }
}

export async function eliminarBorrador(tx: Transaccion, usuarioId: string, id: string) {
  const [c] = await tx.select().from(comprobantes).where(eq(comprobantes.id, id))
  if (!c) return { ok: false as const, error: 'Ese comprobante ya no existe.' }
  if (c.estado !== 'borrador') return { ok: false as const, error: 'Solo se borra un borrador.' }
  await tx.delete(comprobantes).where(eq(comprobantes.id, id))
  await auditar(tx, { usuarioId, accion: 'baja', entidad: 'comprobante', entidadId: id, antes: c })
  return { ok: true as const }
}

// ------------------------------------------------------------------ Emisión

/** Pedido de CAE a partir del comprobante guardado. */
export async function armarSolicitud(
  tx: Transaccion,
  c: typeof comprobantes.$inferSelect,
  numero: number,
  cuit: string,
): Promise<SolicitudCae> {
  const iva = await tx
    .select()
    .from(comprobantesIva)
    .where(eq(comprobantesIva.comprobanteId, c.id))
    .orderBy(asc(comprobantesIva.alicuotaIva))
  const tributos = await tx.select().from(comprobantesTributos).where(eq(comprobantesTributos.comprobanteId, c.id))
  const asociados = await tx
    .select({
      tipo: comprobantes.tipo,
      puntoVenta: comprobantes.puntoVenta,
      numero: comprobantes.numero,
      fecha: comprobantes.fecha,
    })
    .from(comprobantesAsociados)
    .innerJoin(comprobantes, eq(comprobantes.id, comprobantesAsociados.asociadoId))
    .where(eq(comprobantesAsociados.comprobanteId, c.id))
  const f2 = (v: string) => monto(v).toFixed(2)
  return {
    puntoVenta: c.puntoVenta,
    tipo: c.tipo,
    numero,
    concepto: c.concepto,
    docTipo: c.receptorDocTipo ?? 99,
    docNumero: c.receptorDocNumero ?? '0',
    fecha: c.fecha,
    total: f2(c.total),
    noGravado: f2(c.noGravado),
    neto: f2(c.neto),
    exento: f2(c.exento),
    tributos: f2(c.tributos),
    iva: f2(c.iva),
    servicioDesde: c.servicioDesde,
    servicioHasta: c.servicioHasta,
    vencimientoPago: c.concepto !== 1 || datosTipo(c.tipo).fce ? c.vencimiento : null,
    moneda: c.moneda,
    cotizacion: monto(c.cotizacion).toFixed(6),
    condicionIvaReceptor: c.receptorCondicionIva ?? 5,
    asociados: asociados.map((a) => ({ tipo: a.tipo, puntoVenta: a.puntoVenta, numero: a.numero!, cuit, fecha: a.fecha })),
    detalleIva: iva.map((a) => ({ id: a.alicuotaIva, base: f2(a.base), importe: f2(a.importe) })),
    detalleTributos: tributos.map((x) => ({
      id: x.tributo,
      descripcion: x.descripcion,
      base: f2(x.base),
      alicuota: monto(x.alicuota).toFixed(2),
      importe: f2(x.importe),
    })),
    opcionales: (c.opcionales as { id: string; valor: string }[] | null) ?? [],
  }
}

/** Controles previos al pedido de CAE, con mensajes para el usuario. */
async function controlar(tx: Transaccion, c: typeof comprobantes.$inferSelect, hoy: string): Promise<string | null> {
  const tolerancia = rangoFecha(c.concepto)
  if (c.fecha < sumarDias(hoy, -tolerancia) || c.fecha > sumarDias(hoy, tolerancia)) {
    return `ARCA acepta fechas de hasta ${tolerancia} días antes o después de hoy. Cambiá la fecha del comprobante.`
  }
  if (c.letra === 'A' && (c.receptorDocTipo !== 80 || !validarCuit(c.receptorDocNumero ?? ''))) {
    return 'Un comprobante A necesita el CUIT del cliente. Completalo en su ficha.'
  }
  if (c.receptorDocTipo === 99) {
    const [config] = await tx.select().from(arcaConfiguracion)
    const umbral = config?.umbralConsumidorFinal ?? '10000000'
    if (monto(enPesos(c)).gte(umbral)) {
      return `Desde $ ${Number(umbral).toLocaleString('es-AR')} hay que identificar al consumidor final: cargá su DNI o CUIT en la ficha.`
    }
  }
  if (monto(c.total).lte(0)) return 'El total tiene que ser mayor que cero.'
  // ARCA no acepta una fecha anterior a la del último comprobante del mismo tipo y punto de venta.
  const [ultimo] = await tx
    .select({ fecha: comprobantes.fecha })
    .from(comprobantes)
    .where(
      and(
        eq(comprobantes.tipo, c.tipo),
        eq(comprobantes.puntoVenta, c.puntoVenta),
        eq(comprobantes.estado, 'autorizado'),
        eq(comprobantes.origen, 'erp'),
      ),
    )
    .orderBy(desc(comprobantes.fecha))
    .limit(1)
  if (ultimo && c.fecha < ultimo.fecha) {
    return `Ya hay un ${nombreComprobante(c.tipo)} autorizado con fecha ${ultimo.fecha.split('-').reverse().join('/')}: este no puede tener una fecha anterior.`
  }
  return null
}

export type ResultadoEmision =
  { ok: true; numero: number; cae: string; observaciones: string[] } | { ok: false; error: string; pendiente?: boolean }

type CrearCliente = (tx: Transaccion, cuit: string) => Promise<ClienteArca>

const textoMensajes = (ms: { codigo: string; mensaje: string }[]) => ms.map((m) => `${m.mensaje} (${m.codigo})`)

/** Bloquea el numerador del tipo y punto de venta hasta el fin de la transacción. */
async function bloquearNumerador(tx: Transaccion, tipo: number, puntoVenta: number) {
  const clave = `arca-${tipo}`
  await tx.insert(numeradores).values({ tipo: clave, puntoVenta, ultimo: 0 }).onConflictDoNothing()
  await tx
    .select()
    .from(numeradores)
    .where(and(eq(numeradores.tipo, clave), eq(numeradores.puntoVenta, puntoVenta)))
    .for('update')
}

/**
 * Pide el CAE de un borrador. Usa tres transacciones: reservar el número
 * (queda pendiente de verificación), pedir el CAE fuera de toda transacción,
 * y guardar la respuesta.
 */
export async function emitirComprobante(
  empresaId: string,
  usuarioId: string,
  id: string,
  crearCliente: CrearCliente,
  hoy: string = hoyArgentina(),
): Promise<ResultadoEmision> {
  // Cada comprobante con CAE cuenta para el límite mensual del plan.
  const limite = await controlarLimite(empresaId, 'comprobantesMes', hoy)
  if (limite) return { ok: false, error: limite }
  const preparado = await conEmpresa(empresaId, async (tx) => {
    const [c] = await tx.select().from(comprobantes).where(eq(comprobantes.id, id)).for('update')
    if (!c) return { error: 'Ese comprobante ya no existe.' }
    if (c.estado === 'autorizado') return { error: 'El comprobante ya está autorizado.' }
    if (c.estado === 'pendiente_verificacion') return { verificar: true as const }
    const cerrado = (await controlarBloqueo(tx, 'ventas', c.fecha)) ?? (await controlarPeriodoIva(tx, c.fecha.slice(0, 7)))
    if (cerrado) return { error: cerrado }
    // La ficha del cliente pudo cambiar desde que se armó el borrador.
    const [tercero] = await tx.select().from(terceros).where(eq(terceros.id, c.terceroId))
    const receptor = datosReceptor(tercero)
    const actual = { ...c, ...receptor }
    const problema = await controlar(tx, actual, hoy)
    if (problema) return { error: problema }

    await bloquearNumerador(tx, c.tipo, c.puntoVenta)
    const [enCurso] = await tx
      .select({ id: comprobantes.id })
      .from(comprobantes)
      .where(
        and(
          eq(comprobantes.tipo, c.tipo),
          eq(comprobantes.puntoVenta, c.puntoVenta),
          eq(comprobantes.estado, 'pendiente_verificacion'),
          ne(comprobantes.id, c.id),
        ),
      )
    if (enCurso) {
      return {
        error: 'Hay otro comprobante del mismo tipo esperando confirmación de ARCA. Verificalo primero (o esperá unos segundos).',
      }
    }

    const empresa = await empresaEmisora(tx)
    let arca: ClienteArca
    let numero: number
    try {
      arca = await crearCliente(tx, empresa.cuit)
      numero = (await arca.ultimoAutorizado(c.puntoVenta, c.tipo)) + 1
    } catch (e) {
      return { error: mensajeError(e) }
    }
    await tx
      .update(comprobantes)
      .set({ ...receptor, estado: 'pendiente_verificacion', numero, respuestaArca: null })
      .where(eq(comprobantes.id, id))
    const solicitud = await armarSolicitud(tx, actual, numero, empresa.cuit)
    return { arca, solicitud, numero }
  })
  if ('verificar' in preparado) return verificarComprobante(empresaId, usuarioId, id, crearCliente)
  if ('error' in preparado) return { ok: false, error: preparado.error! }

  const { arca, solicitud, numero } = preparado
  let respuesta
  try {
    respuesta = await arca.solicitarCae(solicitud)
  } catch (e) {
    if (e instanceof ErrorIncierto) {
      return {
        ok: false,
        pendiente: true,
        error:
          'ARCA no respondió y no se sabe si autorizó el comprobante. Quedó pendiente: tocá "Verificar en ARCA" en un momento.',
      }
    }
    // No llegó o ARCA lo rechazó de plano: vuelve a borrador sin consumir el número.
    await conEmpresa(empresaId, (tx) =>
      tx
        .update(comprobantes)
        .set({ estado: 'borrador', numero: null, respuestaArca: { errores: [mensajeError(e)] } })
        .where(eq(comprobantes.id, id)),
    )
    return { ok: false, error: mensajeError(e) }
  }

  return conEmpresa(empresaId, async (tx) => {
    if (respuesta.resultado === 'A' && respuesta.cae) {
      await tx
        .update(comprobantes)
        .set({
          estado: 'autorizado',
          cae: respuesta.cae,
          caeVence: respuesta.caeVence,
          respuestaArca: { observaciones: respuesta.observaciones },
          autorizado: new Date(),
        })
        .where(eq(comprobantes.id, id))
      await tx
        .update(numeradores)
        .set({ ultimo: sql`greatest(${numeradores.ultimo}, ${numero})` })
        .where(and(eq(numeradores.tipo, `arca-${solicitud.tipo}`), eq(numeradores.puntoVenta, solicitud.puntoVenta)))
      await auditar(tx, {
        usuarioId,
        accion: 'emision',
        entidad: 'comprobante',
        entidadId: id,
        despues: { numero, cae: respuesta.cae, ambiente: arca.ambiente },
      })
      await aplicarNota(tx, usuarioId, id)
      return { ok: true as const, numero, cae: respuesta.cae, observaciones: textoMensajes(respuesta.observaciones) }
    }
    await tx
      .update(comprobantes)
      .set({
        estado: 'borrador',
        numero: null,
        respuestaArca: { errores: respuesta.errores, observaciones: respuesta.observaciones },
      })
      .where(eq(comprobantes.id, id))
    const motivos = textoMensajes([...respuesta.errores, ...respuesta.observaciones])
    return { ok: false as const, error: `ARCA rechazó el comprobante: ${motivos.join(' · ') || 'sin motivo informado'}` }
  })
}

/**
 * Resuelve un comprobante pendiente de verificación consultando a ARCA: si lo
 * tiene, lo marca autorizado con su CAE; si no, vuelve a borrador.
 */
export async function verificarComprobante(
  empresaId: string,
  usuarioId: string,
  id: string,
  crearCliente: CrearCliente,
): Promise<ResultadoEmision> {
  return conEmpresa(empresaId, async (tx) => {
    const [c] = await tx.select().from(comprobantes).where(eq(comprobantes.id, id)).for('update')
    if (!c || c.estado !== 'pendiente_verificacion' || !c.numero)
      return { ok: false as const, error: 'No hay nada que verificar.' }
    const empresa = await empresaEmisora(tx)
    let consultado
    try {
      const arca = await crearCliente(tx, empresa.cuit)
      consultado = await arca.consultar(c.puntoVenta, c.tipo, c.numero)
    } catch (e) {
      return { ok: false as const, pendiente: true, error: `No se pudo consultar a ARCA: ${mensajeError(e)}` }
    }
    const coincide =
      consultado &&
      consultado.cae &&
      monto(consultado.total).eq(c.total) &&
      consultado.docNumero.replace(/\D/g, '') === (c.receptorDocNumero ?? '0').replace(/\D/g, '')
    if (coincide) {
      await tx
        .update(comprobantes)
        .set({ estado: 'autorizado', cae: consultado!.cae, caeVence: consultado!.caeVence || null, autorizado: new Date() })
        .where(eq(comprobantes.id, id))
      await auditar(tx, {
        usuarioId,
        accion: 'emision',
        entidad: 'comprobante',
        entidadId: id,
        despues: { numero: c.numero, cae: consultado!.cae, verificado: true },
      })
      await aplicarNota(tx, usuarioId, id)
      return { ok: true as const, numero: c.numero, cae: consultado!.cae, observaciones: [] }
    }
    await tx
      .update(comprobantes)
      .set({
        estado: 'borrador',
        numero: null,
        respuestaArca: consultado
          ? {
              errores: [
                `ARCA tiene el número ${c.numero} con otros datos (total ${consultado.total}). Revisar antes de volver a emitir.`,
              ],
            }
          : null,
      })
      .where(eq(comprobantes.id, id))
    return {
      ok: false as const,
      error: consultado
        ? `ARCA tiene ese número con otros datos. El comprobante volvió a borrador: revisalo con el administrador antes de emitir.`
        : 'ARCA no llegó a recibirlo. El comprobante volvió a borrador: podés emitirlo de nuevo.',
    }
  })
}

/** Una nota de crédito recién autorizada cancela la deuda del comprobante que corrige. */
async function aplicarNota(tx: Transaccion, usuarioId: string, id: string) {
  const [c] = await tx.select().from(comprobantes).where(eq(comprobantes.id, id))
  if (c.clase !== 'nota_credito') return
  const asociados = await tx.select().from(comprobantesAsociados).where(eq(comprobantesAsociados.comprobanteId, id))
  for (const a of asociados) await imputarNotaCreditoAsociada(tx, usuarioId, id, a.asociadoId, c.fecha)
}

function mensajeError(e: unknown): string {
  if (e instanceof ErrorArca) return `ARCA: ${e.message}`
  if (e instanceof ErrorSinEnviar || e instanceof ErrorIncierto) return e.message
  if (e instanceof Error && e.name === 'SinConfiguracionArca') return e.message
  if (e instanceof Error) return e.message
  return 'Error desconocido al hablar con ARCA.'
}

// ---------------------------------------------------------------- Consultas

export async function obtenerComprobante(tx: Transaccion, id: string) {
  const [c] = await tx.select().from(comprobantes).where(eq(comprobantes.id, id))
  if (!c) return null
  const [items, detalleIva, detalleTributos, asociados, notas] = await Promise.all([
    tx.select().from(comprobantesItems).where(eq(comprobantesItems.comprobanteId, id)).orderBy(asc(comprobantesItems.orden)),
    tx.select().from(comprobantesIva).where(eq(comprobantesIva.comprobanteId, id)).orderBy(asc(comprobantesIva.alicuotaIva)),
    tx.select().from(comprobantesTributos).where(eq(comprobantesTributos.comprobanteId, id)),
    tx
      .select({
        id: comprobantes.id,
        tipo: comprobantes.tipo,
        puntoVenta: comprobantes.puntoVenta,
        numero: comprobantes.numero,
        fecha: comprobantes.fecha,
      })
      .from(comprobantesAsociados)
      .innerJoin(comprobantes, eq(comprobantes.id, comprobantesAsociados.asociadoId))
      .where(eq(comprobantesAsociados.comprobanteId, id)),
    // Notas que corrigen a este comprobante.
    tx
      .select({
        id: comprobantes.id,
        tipo: comprobantes.tipo,
        puntoVenta: comprobantes.puntoVenta,
        numero: comprobantes.numero,
        estado: comprobantes.estado,
        total: comprobantes.total,
      })
      .from(comprobantesAsociados)
      .innerJoin(comprobantes, eq(comprobantes.id, comprobantesAsociados.comprobanteId))
      .where(eq(comprobantesAsociados.asociadoId, id)),
  ])
  const [cliente] = await tx.select().from(terceros).where(eq(terceros.id, c.terceroId))
  return { ...c, items, detalleIva, detalleTributos, asociados, notas, cliente }
}

export async function listarComprobantes(tx: Transaccion, filtro: { q?: string; estado?: string; terceroId?: string } = {}) {
  const q = filtro.q?.trim()
  const condiciones = [
    filtro.estado ? eq(comprobantes.estado, filtro.estado) : undefined,
    filtro.terceroId ? eq(comprobantes.terceroId, filtro.terceroId) : undefined,
    q
      ? or(
          ilike(terceros.razonSocial, `%${q}%`),
          /^\d+$/.test(q) ? eq(comprobantes.numero, Number(q)) : undefined,
          ilike(comprobantes.cae, `${q}%`),
        )
      : undefined,
  ]
  return tx
    .select({
      id: comprobantes.id,
      tipo: comprobantes.tipo,
      puntoVenta: comprobantes.puntoVenta,
      numero: comprobantes.numero,
      fecha: comprobantes.fecha,
      estado: comprobantes.estado,
      moneda: comprobantes.moneda,
      total: comprobantes.total,
      cliente: terceros.razonSocial,
      origen: comprobantes.origen,
    })
    .from(comprobantes)
    .innerJoin(terceros, eq(terceros.id, comprobantes.terceroId))
    .where(and(...condiciones))
    .orderBy(desc(comprobantes.fecha), desc(comprobantes.creado))
    .limit(300)
}

/** Facturas y notas de débito autorizadas del cliente, para asociar una nota. */
export async function comprobantesParaAsociar(tx: Transaccion, terceroId: string) {
  return tx
    .select({
      id: comprobantes.id,
      tipo: comprobantes.tipo,
      puntoVenta: comprobantes.puntoVenta,
      numero: comprobantes.numero,
      fecha: comprobantes.fecha,
      total: comprobantes.total,
    })
    .from(comprobantes)
    .where(
      and(
        eq(comprobantes.terceroId, terceroId),
        eq(comprobantes.estado, 'autorizado'),
        inArray(comprobantes.clase, ['factura', 'nota_debito'] satisfies Clase[]),
      ),
    )
    .orderBy(desc(comprobantes.fecha))
    .limit(50)
}
