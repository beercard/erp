/**
 * Migra una cuenta de Persat a una empresa del ERP: clientes (emparejados
 * con los del ERP), equipos, técnicos, etiquetas, el tipo de orden con sus
 * formularios y el historial de órdenes. Lee Persat SOLO con GET.
 *
 *   npm run persat:importar -- --empresa 30-71999001-7 [--desde 2020-01-01]
 *       [--aplicar] [--crear-clientes] [--fotos] [--archivo .data/persat/descarga.json]
 *       [--vincular UID_PERSAT=CODIGO_ERP ...]
 *
 * Sin --aplicar simula: hace todo dentro de una transacción que se deshace y
 * muestra el informe (cuántos clientes se emparejan, cuáles no y por qué).
 * La descarga se guarda en --archivo (por defecto .data/persat/descarga.json)
 * y se reusa si existe, así simular y aplicar bajan una sola vez (borrarla
 * para traer lo nuevo). Las fotos se bajan al aplicar (sus URL duran poco).
 * Se puede correr de nuevo: actualiza lo migrado y agrega lo nuevo. Los
 * clientes que no se emparejan se informan; se vinculan a mano con
 * --vincular (queda grabado al aplicar) o se crean con --crear-clientes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { eq, or } from 'drizzle-orm'

import { comoPlataforma, conEmpresa } from '../src/db/empresa'
import { empresas, terceros } from '../src/db/schema'
import { importarPersat, vincularCliente, type Informe } from '../src/modulos/importacion/persat'
import { bajarArchivo, clientePersat, descargarPersat, type DatosPersat } from '../src/modulos/importacion/persatApi'
import { SISTEMA } from '../src/modulos/servicio/avisos'

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 ? process.argv[i + 1] : undefined
}
const bandera = (n: string) => process.argv.includes(`--${n}`)

const empresaArg = arg('empresa')
if (!empresaArg) {
  console.error('Falta --empresa (CUIT o id de la empresa del ERP).')
  process.exit(1)
}
const aplicar = bandera('aplicar')
const archivo = arg('archivo') ?? '.data/persat/descarga.json'
const desde = new Date(`${arg('desde') ?? '2018-01-01'}T00:00:00-03:00`)

const cuit = empresaArg.replace(/\D/g, '')
const [empresa] = await comoPlataforma((tx) =>
  tx
    .select({ id: empresas.id, razonSocial: empresas.razonSocial })
    .from(empresas)
    .where(
      /^[0-9a-f-]{36}$/i.test(empresaArg)
        ? eq(empresas.id, empresaArg)
        : or(eq(empresas.cuit, cuit), eq(empresas.cuit, empresaArg)),
    ),
)
if (!empresa) {
  console.error(`No hay una empresa ${empresaArg} en el ERP.`)
  process.exit(1)
}

let datos: DatosPersat
if (existsSync(archivo)) {
  datos = JSON.parse(readFileSync(archivo, 'utf8'))
  console.log(`Usando la descarga guardada en ${archivo} (borrala para traer lo nuevo).`)
} else {
  const clave = process.env.PERSAT_API_KEY
  if (!clave) {
    console.error('Falta PERSAT_API_KEY.')
    process.exit(1)
  }
  datos = await descargarPersat(clientePersat(clave), { desde, avance: (t) => console.log(`Bajando ${t}…`) })
  mkdirSync(dirname(archivo), { recursive: true })
  writeFileSync(archivo, JSON.stringify(datos))
}
console.log(
  `Persat: ${datos.clientes.length} clientes, ${datos.equipos.length} equipos, ${datos.tecnicos.length} técnicos, ${datos.ordenes.length} órdenes.`,
)

class Simulacion extends Error {
  constructor(readonly informe: Informe) {
    super('simulación')
  }
}

let informe: Informe
try {
  informe = await conEmpresa(empresa.id, async (tx) => {
    // --vincular UID=CODIGO: un cliente de Persat con el cliente del ERP de ese código (se puede repetir).
    for (const [i, a] of process.argv.entries()) {
      if (a !== '--vincular') continue
      const [uid, codigo] = (process.argv[i + 1] ?? '').split('=')
      const [t] = await tx
        .select({ id: terceros.id })
        .from(terceros)
        .where(eq(terceros.codigo, codigo ?? ''))
      if (!uid || !t) throw new Error(`--vincular ${process.argv[i + 1]}: no hay un cliente del ERP con ese código.`)
      await vincularCliente(tx, uid.trim(), t.id)
    }
    const r = await importarPersat(tx, SISTEMA, datos, {
      crearClientes: bandera('crear-clientes'),
      bajarFoto: aplicar && bandera('fotos') ? (url) => bajarArchivo(url) : null,
    })
    if (!aplicar) throw new Simulacion(r)
    return r
  })
} catch (e) {
  if (!(e instanceof Simulacion)) throw e
  informe = e.informe
}

const { clientesSinPareja, avisos, ...cantidades } = informe
console.log(`\n${aplicar ? 'IMPORTADO' : 'SIMULACIÓN (no se grabó nada; con --aplicar se graba)'} en ${empresa.razonSocial}\n`)
console.log(JSON.stringify(cantidades, null, 2))
if (clientesSinPareja.length) {
  console.log(`\nClientes sin pareja (${clientesSinPareja.length}):`)
  for (const c of clientesSinPareja) console.log(`  ${c.uid.padEnd(12)} ${c.nombre} — ${c.motivo}`)
}
if (avisos.length) {
  console.log('\nAvisos:')
  for (const a of avisos) console.log(`  ${a}`)
}
process.exit(0)
