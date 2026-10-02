import { and, eq, inArray, sql } from 'drizzle-orm'

import type { Transaccion } from '../../db/conexion'
import * as t from '../../db/schema'
import { aImporte, monto } from '../../lib/dinero'
import { codigoCompra, type LetraCompra } from '../compras/tipos'
import { codigoComprobante, type Clase } from '../facturacion/tipos'

/**
 * Saldos iniciales: los comprobantes con saldo en las cuentas corrientes de
 * PYMEXIS (CtaCtePrv y CtaCteCli) pasan al ERP como comprobantes migrados
 * (origen "pymexis") por lo que les falta cancelar. No van a los libros de
 * IVA: ya se declararon desde PYMEXIS.
 *
 * - Saldo positivo: deuda (factura o nota de débito).
 * - Saldo negativo: crédito (nota de crédito, o un pago o recibo a cuenta).
 *   Lo que no es un comprobante fiscal (recibos, pagos, retenciones, a
 *   cuenta) entra con tipo 0 y letra X: "saldo inicial".
 */

type Fila = Record<string, string>

const limpio = (v: string | undefined) => (v ?? '').trim()
const MONEDA: Record<string, string> = { '001': 'PES', '002': 'DOL' }
const NOTA_DEBITO = new Set([1, 2, 13])
const NOTA_CREDITO = new Set([3, 4, 5])

function fecha(v: string | undefined): string | null {
  const m = limpio(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** Clase, letra y código de ARCA de un renglón de cuenta corriente de PYMEXIS. */
function clasificar(f: Fila, idUnico: string) {
  const tipoPymexis = Number(limpio(f.IdTipoComp))
  const saldo = monto(limpio(f.Saldo) || '0')
  const credito = saldo.lt(0)
  const letra = limpio(f.LetraComp).toUpperCase()
  const fiscal = Number(limpio(f.nTipo ?? f.ntipo) || 0) === 0 && ['A', 'B', 'C', 'M'].includes(letra)
  const clase: Clase = credito ? 'nota_credito' : NOTA_DEBITO.has(tipoPymexis) ? 'nota_debito' : 'factura'
  const comprobante = credito ? NOTA_CREDITO.has(tipoPymexis) : tipoPymexis !== 12
  if (fiscal && comprobante) {
    return {
      clase,
      letra,
      tipo: null as number | null,
      puntoVenta: Number(limpio(f.Sucursal) || 0),
      numero: Number(limpio(f.Numero) || 0),
      importe: saldo.abs(),
    }
  }
  // Recibos, pagos, retenciones, "a cuenta" y comprobantes no fiscales.
  return { clase, letra: 'X', tipo: 0, puntoVenta: 0, numero: Number(idUnico), importe: saldo.abs() }
}

export async function importarSaldosProveedores(
  tx: Transaccion,
  usuarioId: string,
  filas: Fila[],
  terceroDe: (idProveedor: string) => string | undefined,
  avisos: string[],
) {
  // Se reemplazan los saldos migrados antes, salvo los que ya se pagaron en el ERP.
  const anteriores = await tx
    .select({ id: t.compras.id })
    .from(t.compras)
    .where(and(eq(t.compras.origen, 'pymexis'), eq(t.compras.estado, 'registrado')))
  const conPagos = new Set(
    anteriores.length
      ? (
          await tx
            .select({ id: t.imputacionesCompras.compraId })
            .from(t.imputacionesCompras)
            .where(
              inArray(
                t.imputacionesCompras.compraId,
                anteriores.map((a) => a.id),
              ),
            )
        ).map((x) => x.id)
      : [],
  )
  const anular = anteriores.filter((a) => !conPagos.has(a.id)).map((a) => a.id)
  if (anular.length) {
    await tx
      .update(t.compras)
      .set({ estado: 'anulado', anulado: new Date(), anuladoPor: usuarioId })
      .where(inArray(t.compras.id, anular))
  }
  if (conPagos.size) avisos.push(`${conPagos.size} saldos de proveedores migrados antes ya tienen pagos en el ERP: se dejaron.`)

  let cargados = 0
  let sinProveedor = 0
  for (const f of filas) {
    const terceroId = terceroDe(limpio(f.IdProveedor))
    const fechaComp = fecha(f.fecha)
    if (!terceroId || !fechaComp) {
      sinProveedor++
      continue
    }
    const c = clasificar(f, limpio(f.idunico ?? f.IdUnico))
    if (c.importe.lte(0)) continue
    const tipo = c.tipo ?? codigoCompra(c.letra as LetraCompra, c.clase) ?? 0
    const moneda = MONEDA[limpio(f.idmoneda)] ?? 'PES'
    const importe = aImporte(c.importe)
    await tx
      .insert(t.compras)
      .values({
        clase: c.clase,
        letra: tipo === 0 ? 'X' : c.letra,
        tipo,
        puntoVenta: tipo === 0 ? 0 : c.puntoVenta,
        numero: tipo === 0 ? Number(limpio(f.idunico ?? f.IdUnico)) : c.numero,
        fecha: fechaComp,
        periodoIva: fechaComp.slice(0, 7),
        terceroId,
        vencimiento: fecha(f.FechaVto),
        moneda,
        cotizacion: moneda === 'PES' ? '1' : limpio(f.cotizacion) || '1',
        noGravado: importe,
        total: importe,
        origen: 'pymexis',
        observaciones: `Saldo migrado de PYMEXIS (comprobante por ${aImporte(monto(limpio(f.Importe) || '0').abs())}).`,
        usuarioId,
      })
      .onConflictDoNothing()
    cargados++
  }
  if (sinProveedor) avisos.push(`${sinProveedor} saldos de proveedores sin proveedor o sin fecha: no se migraron.`)
  return cargados
}

export async function importarSaldosClientes(
  tx: Transaccion,
  usuarioId: string,
  filas: Fila[],
  terceroDe: (idCliente: string) => string | undefined,
  avisos: string[],
) {
  // Los comprobantes de venta no se modifican ni se anulan: los saldos se migran una sola vez.
  const [ya] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(t.comprobantes)
    .where(eq(t.comprobantes.origen, 'pymexis'))
  if (ya.n > 0) {
    avisos.push('Los saldos de clientes ya se habían migrado: no se tocaron.')
    return 0
  }
  const clientes = new Map((await tx.select().from(t.terceros)).map((x) => [x.id, x]))
  let cargados = 0
  let sinCliente = 0
  for (const f of filas) {
    const terceroId = terceroDe(limpio(f.IdCliente))
    const fechaComp = fecha(f.fecha)
    const cliente = terceroId ? clientes.get(terceroId) : undefined
    if (!cliente || !fechaComp) {
      sinCliente++
      continue
    }
    const c = clasificar(f, limpio(f.IdUnico ?? f.idunico))
    if (c.importe.lte(0)) continue
    const tipo = c.tipo ?? (['A', 'B', 'C'].includes(c.letra) ? codigoComprobante(c.letra as 'A', c.clase) : 0)
    const moneda = MONEDA[limpio(f.idmoneda)] ?? 'PES'
    const importe = aImporte(c.importe)
    await tx
      .insert(t.comprobantes)
      .values({
        clase: c.clase,
        letra: tipo === 0 ? 'X' : c.letra,
        tipo,
        puntoVenta: tipo === 0 ? 0 : c.puntoVenta,
        numero: tipo === 0 ? Number(limpio(f.IdUnico ?? f.idunico)) : c.numero,
        fecha: fechaComp,
        estado: 'autorizado',
        origen: 'pymexis',
        terceroId: cliente.id,
        receptorNombre: cliente.razonSocial,
        receptorDocTipo: cliente.tipoDocumento,
        receptorDocNumero: cliente.numeroDocumento,
        receptorCondicionIva: cliente.condicionIva,
        vencimiento: fecha(f.FechaVto),
        moneda,
        cotizacion: moneda === 'PES' ? '1' : limpio(f.cotizacion) || '1',
        noGravado: importe,
        total: importe,
        observaciones: 'Saldo migrado de PYMEXIS.',
        usuarioId,
        autorizado: new Date(),
      })
      .onConflictDoNothing()
    cargados++
  }
  if (sinCliente) avisos.push(`${sinCliente} saldos de clientes sin cliente o sin fecha: no se migraron.`)
  return cargados
}
