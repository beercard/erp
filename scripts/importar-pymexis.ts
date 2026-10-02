/**
 * Importa una exportación de PYMEXIS (carpeta con los CSV del agente) a una
 * empresa del ERP. Si la empresa no existe la crea. Se puede correr de nuevo:
 * actualiza por código.
 *
 *   npx tsx scripts/importar-pymexis.ts <carpeta> --cuit 30715974823 \
 *     --razon "KOMSA S.A." [--usuario admin@demo.local] [--saldos]
 *
 * --saldos migra además los comprobantes con saldo de proveedores y clientes
 * (saldos iniciales): se usa al pasar a trabajar con el ERP.
 * --usuario da acceso de Dueño a ese usuario (para revisar la importación).
 * Con PGlite, correrlo con el servidor de desarrollo APAGADO.
 * Deja el informe con los avisos en <carpeta>/informe.json.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { eq, sql } from 'drizzle-orm'

import { db } from '../src/db/conexion'
import { migrar } from '../src/db/migrar'
import { empresas, membresias, roles, usuarios } from '../src/db/schema'
import { validarCuit } from '../src/lib/cuit'
import { importarPymexis } from '../src/modulos/importacion/pymexis'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { cuit: { type: 'string' }, razon: { type: 'string' }, usuario: { type: 'string' }, saldos: { type: 'boolean' } },
})
const carpeta = positionals[0]
const cuit = validarCuit(values.cuit ?? '')
if (!carpeta || !cuit.valido || !values.razon) {
  console.error('Uso: tsx scripts/importar-pymexis.ts <carpeta> --cuit <CUIT> --razon "<razón social>" [--usuario <email>]')
  if (!cuit.valido && values.cuit) console.error(cuit.error)
  process.exit(1)
}

const base = db()
await migrar(base)

let [empresa] = await base.select().from(empresas).where(eq(empresas.cuit, cuit.cuit))
if (!empresa) {
  ;[empresa] = await base.insert(empresas).values({ razonSocial: values.razon, cuit: cuit.cuit, condicionIva: 1 }).returning()
  console.log(`Empresa creada: ${empresa.razonSocial}`)
}

let usuarioId = '00000000-0000-4000-8000-000000000000'
if (values.usuario) {
  const [u] = await base
    .select()
    .from(usuarios)
    .where(sql`lower(${usuarios.email}) = lower(${values.usuario})`)
  if (!u) {
    console.error(`No existe el usuario ${values.usuario}.`)
    process.exit(1)
  }
  const [dueno] = await base.select().from(roles).where(eq(roles.nombre, 'Dueño'))
  await base.insert(membresias).values({ usuarioId: u.id, empresaId: empresa.id, rolId: dueno.id }).onConflictDoNothing()
  usuarioId = u.id
}

const inicio = Date.now()
const informe = await importarPymexis(carpeta, empresa.id, usuarioId, undefined, { saldos: values.saldos })
writeFileSync(join(carpeta, 'informe.json'), JSON.stringify(informe, null, 2))
console.log(`Importación terminada en ${((Date.now() - inicio) / 1000).toFixed(1)} s.`)
console.table(informe.cantidades)
console.log(`${informe.avisos.length} avisos (detalle en ${join(carpeta, 'informe.json')}).`)
process.exit(0)
