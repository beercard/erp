import { eq } from 'drizzle-orm'
import * as z from 'zod'

import { comoPlataforma, conEmpresa } from '../../db/empresa'
import { empresas } from '../../db/schema'
import { auditar } from '../../lib/auditoria'

/**
 * Datos fiscales de la empresa. El CUIT no se cambia: identifica a la empresa
 * ante ARCA y en cada comprobante emitido; si cambia, es otra empresa.
 */
const texto = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()
  .optional()

export const EsquemaEmpresa = z.object({
  razonSocial: z.string().trim().min(2, { error: 'Escribí la razón social.' }),
  nombreFantasia: texto,
  // Un emisor solo puede ser Responsable Inscripto, Exento o Monotributo.
  condicionIva: z.coerce.number().refine((v) => [1, 4, 6].includes(v), { error: 'Elegí la condición frente al IVA.' }),
  iibbRegimen: texto,
  iibbNumero: texto,
  inicioActividades: z
    .string()
    .transform((v) => v || null)
    .pipe(z.iso.date({ error: 'Fecha inválida.' }).nullable())
    .optional(),
  domicilioFiscal: texto,
  localidad: texto,
  codigoPostal: texto,
  provincia: texto,
})

export async function datosEmpresa(empresaId: string) {
  const [e] = await comoPlataforma((tx) => tx.select().from(empresas).where(eq(empresas.id, empresaId)))
  return e ?? null
}

export async function actualizarEmpresa(
  empresaId: string,
  actor: string,
  entrada: unknown,
): Promise<{ ok: true } | { ok: false; errores: Record<string, string> }> {
  const p = EsquemaEmpresa.safeParse(entrada)
  if (!p.success) {
    const errores: Record<string, string> = {}
    for (const i of p.error.issues) errores[String(i.path[0])] ??= i.message
    return { ok: false, errores }
  }
  const antes = await datosEmpresa(empresaId)
  const [despues] = await comoPlataforma((tx) => tx.update(empresas).set(p.data).where(eq(empresas.id, empresaId)).returning())
  await conEmpresa(empresaId, (tx) =>
    auditar(tx, { usuarioId: actor, accion: 'modificacion', entidad: 'empresa', entidadId: empresaId, antes, despues }),
  )
  return { ok: true }
}
