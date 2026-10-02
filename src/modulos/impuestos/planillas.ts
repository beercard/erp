import type { Transaccion } from '../../db/conexion'
import type { Hoja } from '../../lib/xlsx'
import { libroCompras, libroVentas, type FilaSubdiario } from './libroIva'
import {
  baseIibb,
  percepcionesPracticadas,
  percepcionesSufridas,
  retencionesPracticadas,
  retencionesSufridas,
} from './retenciones'

/** Las planillas de Excel de impuestos (las usan las descargas y el paquete del contador). */

const subdiario = (nombre: string, filas: FilaSubdiario[], tercero: string): Hoja => {
  const suma = (k: keyof FilaSubdiario) => Math.round(filas.reduce((s, f) => s + (f[k] as number), 0) * 100) / 100
  return {
    nombre,
    filas: [
      [
        'Fecha',
        'Comprobante',
        tercero,
        'Documento',
        'Neto gravado',
        'No gravado',
        'Exento',
        'IVA',
        'Percepciones y otros',
        'Total',
      ],
      ...filas.map((f) => [
        f.fecha,
        f.comprobante,
        f.tercero,
        f.documento,
        f.neto,
        f.noGravado,
        f.exento,
        f.iva,
        f.percepciones,
        f.total,
      ]),
      [
        null,
        'Total',
        null,
        null,
        suma('neto'),
        suma('noGravado'),
        suma('exento'),
        suma('iva'),
        suma('percepciones'),
        suma('total'),
      ],
    ],
  }
}

export async function hojasSubdiarios(tx: Transaccion, periodo: string): Promise<Hoja[]> {
  const [v, c] = await Promise.all([libroVentas(tx, periodo), libroCompras(tx, periodo)])
  return [subdiario('IVA Ventas', v.filas, 'Cliente'), subdiario('IVA Compras', c.filas, 'Proveedor')]
}

export async function hojasIibb(tx: Transaccion, periodo: string): Promise<Hoja[]> {
  const [base, percepciones, sufridas, retenidas] = await Promise.all([
    baseIibb(tx, periodo),
    percepcionesPracticadas(tx, periodo),
    percepcionesSufridas(tx, periodo).then((l) => l.filter((p) => p.tipo === 'percepcion_iibb')),
    retencionesSufridas(tx, periodo).then((l) => l.filter((r) => r.impuesto === 'iibb')),
  ])
  return [
    {
      nombre: 'Base por provincia',
      filas: [
        ['Provincia', 'Comprobantes', 'Ventas netas', '%'],
        ...base.lista.map((f) => [f.jurisdiccion ?? 'Sin provincia', f.cantidad, f.neto, f.porcentaje]),
      ],
    },
    {
      nombre: 'Percepciones cobradas',
      filas: [
        ['Fecha', 'Comprobante', 'Cliente', 'CUIT', 'Jurisdicción', 'Base', 'Alícuota', 'Percibido'],
        ...percepciones.map((p) => [p.fecha, p.comprobante, p.cliente, p.cuit, p.jurisdiccion, p.base, p.alicuota, p.importe]),
      ],
    },
    {
      nombre: 'Percepciones sufridas',
      filas: [
        ['Jurisdicción', 'Comprobantes', 'Importe'],
        ...sufridas.map((s) => [s.jurisdiccion ?? 'Sin jurisdicción', s.cantidad, s.importe]),
      ],
    },
    {
      nombre: 'Retenciones sufridas',
      filas: [
        ['Fecha', 'Recibo', 'Cliente', 'CUIT', 'Certificado', 'Importe'],
        ...retenidas.map((r) => [r.fecha, r.recibo, r.cliente, r.cuit, r.certificado, r.importe]),
      ],
    },
  ]
}

export async function hojasRetenciones(tx: Transaccion, periodo: string): Promise<Hoja[]> {
  const [p, s] = await Promise.all([retencionesPracticadas(tx, periodo), retencionesSufridas(tx, periodo)])
  return [
    {
      nombre: 'Practicadas',
      filas: [
        ['Fecha', 'Impuesto', 'Régimen', 'Certificado', 'Orden de pago', 'Proveedor', 'CUIT', 'Base', 'Alícuota', 'Retenido'],
        ...p.map((r) => [
          r.fecha,
          r.impuesto,
          r.regimen,
          r.certificado,
          r.pago,
          r.proveedor,
          r.cuit,
          Number(r.base),
          r.alicuota === null ? null : Number(r.alicuota),
          Number(r.importe),
        ]),
      ],
    },
    {
      nombre: 'Sufridas',
      filas: [
        ['Fecha', 'Impuesto', 'Recibo', 'Cliente', 'CUIT', 'Certificado', 'Importe'],
        ...s.map((r) => [r.fecha, r.impuesto, r.recibo, r.cliente, r.cuit, r.certificado, r.importe]),
      ],
    },
  ]
}
