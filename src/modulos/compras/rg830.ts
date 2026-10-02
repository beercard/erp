import { eq } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { escalaGanancias, regimenesGanancias, retencionesConfiguracion } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { decimal, primerError } from '../comercial/documentos'

/**
 * Valores del Anexo VIII de la RG (AFIP) 830, texto vigente consultado en la
 * Biblioteca Electrónica de ARCA en octubre de 2026. Los importes son los de
 * la RG 4525/2019 (no se actualizaron desde entonces). Las alícuotas de no
 * inscriptos son las de personas humanas (28 %); para sociedades es 25 %.
 * Retención mínima: $ 240 (art. 29).
 */
export const REGIMENES_RG830 = [
  {
    codigo: '78',
    concepto: 'Enajenación de bienes muebles y bienes de cambio',
    alicuotaInscripto: '2',
    alicuotaNoInscripto: '10',
    minimoNoSujeto: '224000',
    usaEscala: false,
  },
  {
    codigo: '94',
    concepto: 'Locaciones de obra y/o servicios no ejecutados en relación de dependencia',
    alicuotaInscripto: '2',
    alicuotaNoInscripto: '28',
    minimoNoSujeto: '67170',
    usaEscala: false,
  },
  {
    codigo: '30',
    concepto: 'Alquileres de bienes muebles',
    alicuotaInscripto: '6',
    alicuotaNoInscripto: '28',
    minimoNoSujeto: '11200',
    usaEscala: false,
  },
  {
    codigo: '31',
    concepto: 'Alquileres de inmuebles urbanos',
    alicuotaInscripto: '6',
    alicuotaNoInscripto: '28',
    minimoNoSujeto: '11200',
    usaEscala: false,
  },
  {
    codigo: '95',
    concepto: 'Transporte de carga',
    alicuotaInscripto: '0.25',
    alicuotaNoInscripto: '28',
    minimoNoSujeto: '67170',
    usaEscala: false,
  },
  {
    codigo: '25',
    concepto: 'Comisiones (comisionistas, rematadores, consignatarios)',
    alicuotaInscripto: '0',
    alicuotaNoInscripto: '28',
    minimoNoSujeto: '16830',
    usaEscala: true,
  },
].map((r) => ({ ...r, minimoRetencion: '240' }))

/** Escala general del Anexo VIII (sobre la base sujeta mensual). */
export const ESCALA_RG830 = [
  { desde: '0', hasta: '8000', fijo: '0', porcentaje: '5' },
  { desde: '8000', hasta: '16000', fijo: '400', porcentaje: '9' },
  { desde: '16000', hasta: '24000', fijo: '1120', porcentaje: '12' },
  { desde: '24000', hasta: '32000', fijo: '2080', porcentaje: '15' },
  { desde: '32000', hasta: '48000', fijo: '3280', porcentaje: '19' },
  { desde: '48000', hasta: '64000', fijo: '6320', porcentaje: '23' },
  { desde: '64000', hasta: '96000', fijo: '10000', porcentaje: '27' },
  { desde: '96000', hasta: null, fijo: '18640', porcentaje: '31' },
]

/** Carga (o pone al día) los regímenes y la escala con los valores oficiales. */
export async function cargarValoresRg830(tx: Transaccion, usuarioId: string) {
  for (const r of REGIMENES_RG830) {
    await tx
      .insert(regimenesGanancias)
      .values(r)
      .onConflictDoUpdate({
        target: [regimenesGanancias.empresaId, regimenesGanancias.codigo],
        set: {
          concepto: r.concepto,
          alicuotaInscripto: r.alicuotaInscripto,
          alicuotaNoInscripto: r.alicuotaNoInscripto,
          minimoNoSujeto: r.minimoNoSujeto,
          minimoRetencion: r.minimoRetencion,
          usaEscala: r.usaEscala,
        },
      })
  }
  await tx.delete(escalaGanancias)
  await tx.insert(escalaGanancias).values(ESCALA_RG830)
  await auditar(tx, {
    usuarioId,
    accion: 'modificacion',
    entidad: 'regimenes_ganancias',
    despues: { fuente: 'RG 830, Anexo VIII' },
  })
}

const EsquemaRegimen = z.object({
  codigo: z.string().trim().min(1, { error: 'Escribí el código de régimen (el de SICORE).' }),
  concepto: z.string().trim().min(1, { error: 'Escribí el concepto.' }),
  alicuotaInscripto: decimal('Alícuota inválida.'),
  alicuotaNoInscripto: decimal('Alícuota inválida.'),
  minimoNoSujeto: decimal('Mínimo inválido.'),
  minimoRetencion: decimal('Mínimo de retención inválido.'),
  usaEscala: z.boolean().default(false),
  activo: z.boolean().default(true),
})

export async function guardarRegimen(tx: Transaccion, usuarioId: string, entrada: unknown) {
  const p = EsquemaRegimen.safeParse(entrada)
  if (!p.success) return { ok: false as const, error: primerError(p.error) }
  const d = p.data
  await tx
    .insert(regimenesGanancias)
    .values(d)
    .onConflictDoUpdate({ target: [regimenesGanancias.empresaId, regimenesGanancias.codigo], set: d })
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'regimen_ganancias', despues: d })
  return { ok: true as const }
}

export async function configurarRetenciones(tx: Transaccion, usuarioId: string, gananciasActiva: boolean) {
  const [actual] = await tx.select().from(retencionesConfiguracion)
  if (actual) await tx.update(retencionesConfiguracion).set({ gananciasActiva }).where(eq(retencionesConfiguracion.id, actual.id))
  else await tx.insert(retencionesConfiguracion).values({ gananciasActiva })
  await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'retenciones_configuracion', despues: { gananciasActiva } })
}
