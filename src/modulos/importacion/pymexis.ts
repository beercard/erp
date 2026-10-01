import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { eq, sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

import type { Transaccion } from '../../db/conexion'
import { conEmpresa } from '../../db/empresa'
import * as t from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { validarCuit } from '../../lib/cuit'
import { leerCsv } from '../../lib/csv'
import { aImporte, aplicarPorcentaje } from '../../lib/dinero'
import { hoyArgentina } from '../../lib/fechas'

/**
 * Importa los maestros exportados de PYMEXIS (modo exportar-maestros.txt del
 * agente) a una empresa del ERP. Es idempotente: actualiza por código, así se
 * puede correr de nuevo (y es la base de la copia diaria).
 *
 * Reglas, todas sacadas de los datos reales de KOMSA:
 * - Los "artículos" de tipo 2 de PYMEXIS son equipos individuales (una
 *   copiadora en contrato = un artículo con su serie). No van al catálogo:
 *   se informan y van al parque instalado en la etapa 5, salvo que tengan
 *   precio o stock.
 * - Cada precio trae su moneda; la lista toma la moneda mayoritaria.
 * - Las listas "002 + porcentaje" se importan como derivadas, y los artículos
 *   cuyo precio guardado no coincide con el calculado quedan como precio
 *   especial. Una lista que casi no coincide se importa como base.
 * - Un proveedor con el mismo CUIT que un cliente es el mismo tercero.
 */

type Fila = Record<string, string>
export type Informe = {
  empresaId: string
  cantidades: Record<string, number>
  avisos: string[]
}

const MONEDA: Record<string, string> = { '001': 'PES', '002': 'DOL' }
// Condiva de PYMEXIS → condición de IVA de ARCA.
const CONDICION_IVA: Record<string, number> = { '0': 1, '1': 7, '2': 5, '3': 4, '4': 10, '5': 6, '6': 9, '7': 15, '8': 7 }
// Códigos de tasa de PYMEXIS → alícuota de ARCA.
const ALICUOTA: Record<string, number> = { '900': 5, '901': 4, '902': 6, '903': 9, '904': 8, '910': 3 }
// Alícuota de ARCA → porcentaje (los fija ARCA; son los del catálogo alicuotas_iva).
const PORCENTAJE_ALICUOTA: Record<number, number> = { 3: 0, 4: 10.5, 5: 21, 6: 27, 8: 5, 9: 2.5 }

const limpio = (v: string | undefined) => (v ?? '').trim()
const nulo = (v: string | undefined) => limpio(v) || null
const numero = (v: string | undefined) => {
  const n = Number(limpio(v))
  return Number.isFinite(n) ? n : 0
}
const verdadero = (v: string | undefined) => ['true', '1'].includes(limpio(v).toLowerCase())

function leer(carpeta: string, nombre: string): Fila[] {
  return leerCsv(readFileSync(join(carpeta, `${nombre}.csv`), 'utf8'))
}

/** Inserta o actualiza por (empresa, código) en tandas, y devuelve código → id. */
async function volcar<T extends Record<string, unknown>>(
  tx: Transaccion,
  tabla: PgTable,
  filas: T[],
  claveConflicto: string = 'codigo',
): Promise<Map<string, string>> {
  const columnas = tabla as unknown as Record<string, unknown>
  const objetivo = [columnas.empresaId as never, columnas[claveConflicto] as never]
  for (let i = 0; i < filas.length; i += 400) {
    const tanda = filas.slice(i, i + 400)
    if (!tanda.length) continue
    const campos = Object.keys(tanda[0]).filter((k) => k !== claveConflicto)
    const insercion = tx.insert(tabla).values(tanda as never)
    // Si la tabla no tiene más que la clave (zonas, marcas), no hay nada que actualizar.
    if (campos.length) {
      const set = Object.fromEntries(campos.map((k) => [k, sql.raw(`excluded."${aSnake(k)}"`)]))
      await insercion.onConflictDoUpdate({ target: objetivo, set: set as never })
    } else {
      await insercion.onConflictDoNothing({ target: objetivo })
    }
  }
  // Clave → id de todo lo que hay (incluye lo que ya existía).
  const filasActuales = (await tx.select({ clave: columnas[claveConflicto] as never, id: columnas.id as never }).from(tabla)) as {
    clave: string | number
    id: string
  }[]
  return new Map(filasActuales.map((f) => [String(f.clave), f.id]))
}

const aSnake = (s: string) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)

export async function importarPymexis(
  carpeta: string,
  empresaId: string,
  usuarioId: string,
  hoy: string = hoyArgentina(),
): Promise<Informe> {
  const avisos: string[] = []
  const cantidades: Record<string, number> = {}
  const archivos = {
    provincias: leer(carpeta, 'provincias'),
    rubros: leer(carpeta, 'rubros'),
    subrubros: leer(carpeta, 'subrubros'),
    marcas: leer(carpeta, 'marcas'),
    vendedores: leer(carpeta, 'vendedores'),
    zonas: leer(carpeta, 'zonas'),
    transportes: leer(carpeta, 'transportes'),
    depositos: leer(carpeta, 'depositos'),
    condiciones: leer(carpeta, 'condiciones_pago'),
    puntos: leer(carpeta, 'puntos_venta'),
    listas: leer(carpeta, 'listas'),
    clientes: leer(carpeta, 'clientes'),
    proveedores: leer(carpeta, 'proveedores'),
    contactos: leer(carpeta, 'contactos'),
    articulos: leer(carpeta, 'articulos'),
    precios: leer(carpeta, 'precios'),
    stock: leer(carpeta, 'stock'),
  }

  return conEmpresa(empresaId, async (tx) => {
    // ---------------------------------------------------- Provincias (mapa)
    const provinciasErp = await tx.select().from(t.provincias)
    const porJurisdiccion = new Map(provinciasErp.map((p) => [String(p.jurisdiccionCm), p.codigo]))
    const provincia = new Map(
      archivos.provincias.map((p) => [limpio(p.IdProvincia), porJurisdiccion.get(limpio(p.JURISDICCION)) ?? null]),
    )

    // ------------------------------------------------------ Tablas simples
    const zonas = await volcar(
      tx,
      t.zonas,
      dedupe(
        archivos.zonas.map((z) => ({ nombre: limpio(z.Nombre) || `Zona ${limpio(z.IdZona)}` })),
        'nombre',
      ),
      'nombre',
    )
    const zonaDe = new Map(
      archivos.zonas.map((z) => [limpio(z.IdZona), zonas.get(limpio(z.Nombre) || `Zona ${limpio(z.IdZona)}`)]),
    )
    const transportes = await volcar(
      tx,
      t.transportes,
      dedupe(
        archivos.transportes.map((x) => ({
          nombre: limpio(x.Nombre) || `Transporte ${limpio(x.IdTransporte)}`,
          telefono: nulo(x.Telefono),
          cuit: validarCuit(x.Cuit).valido ? x.Cuit.replace(/\D/g, '') : null,
        })),
        'nombre',
      ),
      'nombre',
    )
    const transporteDe = new Map(
      archivos.transportes.map((x) => [
        limpio(x.IdTransporte),
        transportes.get(limpio(x.Nombre) || `Transporte ${limpio(x.IdTransporte)}`),
      ]),
    )
    const vendedores = await volcar(
      tx,
      t.vendedores,
      archivos.vendedores.map((v) => ({
        codigo: limpio(v.IdVendedor),
        nombre: limpio(v.Nombre),
        email: nulo(v.email),
        comisionVenta: String(numero(v.ComisionVta)),
        comisionCobranza: String(numero(v.ComisionCob)),
      })),
    )
    const condiciones = await volcar(
      tx,
      t.condicionesPago,
      dedupe(
        archivos.condiciones.map((c) => ({
          nombre: limpio(c.Nombre),
          dias: Math.max(0, Math.round(numero(c.cdiames))),
          cuotas: Math.max(1, Math.round(numero(c.cuotas))),
        })),
        'nombre',
      ),
      'nombre',
    )
    const condicionDe = new Map(archivos.condiciones.map((c) => [limpio(c.IdForma), condiciones.get(limpio(c.Nombre))]))
    const depositos = await volcar(
      tx,
      t.depositos,
      archivos.depositos.map((d) => ({
        codigo: limpio(d.IdDeposito),
        nombre: limpio(d.Nombre),
        domicilio: nulo(d.Domicilio),
        activo: !verdadero(d.INHABILITADO),
      })),
    )
    // Puntos de venta: solo los que no dicen "NO USAR".
    const puntos = archivos.puntos.filter((p) => !/no usar/i.test(p.Nombre))
    await volcar(
      tx,
      t.puntosVenta,
      puntos.map((p) => ({
        numero: Number(limpio(p.IdPuntoVenta)),
        nombre: limpio(p.Nombre),
        tipo: verdadero(p.ESFACTURADECREDITO) ? 'fce' : verdadero(p.ESELECTRONICA) ? 'electronico' : 'manual',
        depositoId: depositos.get('001') ?? null,
        activo: !/prueba/i.test(p.Nombre),
      })),
      'numero',
    )
    const marcas = await volcar(
      tx,
      t.marcas,
      dedupe(
        archivos.marcas.filter((m) => limpio(m.IDMARCA) !== '999').map((m) => ({ nombre: limpio(m.NOMBRE) })),
        'nombre',
      ),
      'nombre',
    )
    const marcaDe = new Map(archivos.marcas.map((m) => [limpio(m.IDMARCA), marcas.get(limpio(m.NOMBRE)) ?? null]))

    // Rubros y subrubros (el subrubro cuelga del rubro con el que se usa).
    const rubroDe = new Map<string, string>()
    for (const r of archivos.rubros) {
      const nombre = limpio(r.Nombre)
      const [existente] = await tx
        .select()
        .from(t.rubros)
        .where(sql`${t.rubros.nombre} = ${nombre} and ${t.rubros.padreId} is null`)
      const id = existente?.id ?? (await tx.insert(t.rubros).values({ nombre }).returning())[0].id
      rubroDe.set(limpio(r.IdRubro), id)
    }
    const nombreSub = new Map(archivos.subrubros.map((s) => [limpio(s.IdSubRubro), limpio(s.Nombre)]))
    const subrubroDe = new Map<string, string>()

    // PYMEXIS puede guardar el precio con IVA; en el ERP todo queda neto, y se
    // le saca la alícuota del artículo, no un 21 % fijo: un equipo al 10,5 %
    // quedaba con el neto un 9,5 % más bajo.
    const factorIva = new Map(
      archivos.articulos.map((a) => [
        limpio(a.IdArticulo),
        1 + (PORCENTAJE_ALICUOTA[ALICUOTA[limpio(a.CodIva)] ?? 5] ?? 21) / 100,
      ]),
    )
    const netoDe = (p: Fila) =>
      verdadero(p.IvaIncluido) ? numero(p.Precio) / (factorIva.get(limpio(p.IdArticulo)) ?? 1.21) : numero(p.Precio)

    // -------------------------------------------------------------- Listas
    const preciosPorLista = new Map<string, Fila[]>()
    for (const p of archivos.precios) {
      const l = limpio(p.IdLista)
      if (!preciosPorLista.has(l)) preciosPorLista.set(l, [])
      preciosPorLista.get(l)!.push(p)
    }
    const monedaMayoritaria = (filas: Fila[]) => {
      const cuenta = new Map<string, number>()
      for (const f of filas) cuenta.set(f.idmoneda, (cuenta.get(f.idmoneda) ?? 0) + 1)
      const [cod] = [...cuenta].sort((a, b) => b[1] - a[1])[0] ?? ['001']
      return MONEDA[cod] ?? 'PES'
    }

    // Una lista "desde otra + %" es derivada si sus precios coinciden con el
    // cálculo en la gran mayoría de los artículos. Se compara en neto: una
    // lista con IVA incluido y otra sin él tienen que poder coincidir.
    const coincidencia = (l: Fila) => {
      const base = new Map((preciosPorLista.get(limpio(l.DESDELISTA)) ?? []).map((p) => [limpio(p.IdArticulo), netoDe(p)]))
      const propios = preciosPorLista.get(limpio(l.IdLista)) ?? []
      if (!base.size || !propios.length) return 0
      const iguales = propios.filter((p) => {
        const b = base.get(limpio(p.IdArticulo))
        if (b === undefined) return false
        return Math.abs(b * (1 + numero(l.PORCLISTA) / 100) - netoDe(p)) <= Math.max(0.011, Math.abs(b) * 0.0005)
      }).length
      return iguales / propios.length
    }
    const listasOrdenadas = [...archivos.listas].sort(
      (a, b) => (limpio(a.DESDELISTA) === 'ZZZ' ? -1 : 1) - (limpio(b.DESDELISTA) === 'ZZZ' ? -1 : 1),
    )
    const listaDe = new Map<string, { id: string; derivada: boolean; porcentaje: number; base: string | null; moneda: string }>()
    for (const l of listasOrdenadas) {
      const codigo = limpio(l.IdLista)
      const desde = limpio(l.DESDELISTA)
      const esDerivada = desde !== 'ZZZ' && listaDe.has(desde) && coincidencia(l) >= 0.8
      if (desde !== 'ZZZ' && !esDerivada) {
        avisos.push(
          `Lista ${codigo} "${limpio(l.Nombre)}": sus precios no siguen a la ${desde} + ${numero(l.PORCLISTA)} %; se importó como lista con precios propios.`,
        )
      }
      const moneda = monedaMayoritaria(preciosPorLista.get(codigo) ?? [])
      const vence = nulo(l.FECHAVTO)
      const [fila] = await tx
        .insert(t.listasPrecios)
        .values({
          codigo,
          nombre: limpio(l.Nombre).replace(/\s{2,}/g, ' '),
          moneda: esDerivada ? listaDe.get(desde)!.moneda : moneda,
          listaBaseId: esDerivada ? listaDe.get(desde)!.id : null,
          porcentaje: esDerivada ? String(numero(l.PORCLISTA)) : null,
          vigenteHasta: vence,
          activa: !vence || vence >= hoy,
        })
        .onConflictDoUpdate({
          target: [t.listasPrecios.empresaId, t.listasPrecios.codigo],
          set: {
            nombre: sql`excluded.nombre`,
            moneda: sql`excluded.moneda`,
            listaBaseId: sql`excluded.lista_base_id`,
            porcentaje: sql`excluded.porcentaje`,
            vigenteHasta: sql`excluded.vigente_hasta`,
            activa: sql`excluded.activa`,
          },
        })
        .returning()
      listaDe.set(codigo, {
        id: fila.id,
        derivada: esDerivada,
        porcentaje: numero(l.PORCLISTA),
        base: esDerivada ? desde : null,
        moneda: fila.moneda,
      })
    }
    cantidades.listas = listaDe.size
    cantidades.listasDerivadas = [...listaDe.values()].filter((l) => l.derivada).length

    // ----------------------------------------------------------- Artículos
    const conPrecio = new Set(archivos.precios.map((p) => limpio(p.IdArticulo)))
    const conStock = new Set(archivos.stock.map((s) => limpio(s.IdArticulo)))
    const catalogo = archivos.articulos.filter((a) => {
      const codigo = limpio(a.IdArticulo)
      return limpio(a.tipoarti) !== '2' || conPrecio.has(codigo) || conStock.has(codigo)
    })
    cantidades.equiposNoImportados = archivos.articulos.length - catalogo.length
    const vistos = new Set<string>()
    const filasArticulos = []
    for (const a of catalogo) {
      let codigo = limpio(a.IdArticulo)
      if (vistos.has(codigo)) {
        avisos.push(`Artículo con código repetido "${codigo}" (${limpio(a.Nombre)}): se importó como "${codigo}-2".`)
        codigo = `${codigo}-2`
      }
      vistos.add(codigo)
      const alicuota = ALICUOTA[limpio(a.CodIva)]
      if (!alicuota) avisos.push(`Artículo ${codigo}: tasa de IVA "${limpio(a.CodIva)}" desconocida, quedó en 21 %.`)
      const idRubro = limpio(a.IdRubro)
      let rubroId = rubroDe.get(idRubro) ?? null
      const sub = limpio(a.IdSubRubro)
      if (rubroId && sub && nombreSub.has(sub)) {
        const clave = `${idRubro}/${sub}`
        if (!subrubroDe.has(clave)) {
          const nombre = nombreSub.get(sub)!
          const [existe] = await tx
            .select()
            .from(t.rubros)
            .where(sql`${t.rubros.nombre} = ${nombre} and ${t.rubros.padreId} = ${rubroId}`)
          subrubroDe.set(clave, existe?.id ?? (await tx.insert(t.rubros).values({ nombre, padreId: rubroId }).returning())[0].id)
        }
        rubroId = subrubroDe.get(clave)!
      }
      const esServicio = idRubro === '0005'
      filasArticulos.push({
        codigo,
        nombre: limpio(a.Nombre) || codigo,
        tipo: esServicio ? 'servicio' : 'producto',
        rubroId,
        marcaId: marcaDe.get(limpio(a.IDMARCA)) ?? null,
        unidad: limpio(a.UniMedi) || 'unidad',
        alicuotaIva: alicuota ?? 5,
        llevaStock: !esServicio,
        llevaSerie: limpio(a.tipoarti) === '2',
        codigoBarras: nulo(a.Codigobarra),
        costo: numero(a.COSTO) > 0 ? String(numero(a.COSTO)) : null,
        monedaCosto: MONEDA[limpio(a.idmoneda)] ?? 'PES',
        stockMinimo: numero(a.StockMinimo) > 0 ? String(numero(a.StockMinimo)) : null,
        activo: !verdadero(a.InHabilitado),
      })
    }
    const articuloDe = await volcar(tx, t.articulos, filasArticulos)
    cantidades.articulos = articuloDe.size

    // ------------------------------------------------------------- Precios
    // Vigentes desde hoy. En una derivada solo se guarda el precio si no
    // coincide con el calculado (precio especial).
    const filasPrecios: (typeof t.precios.$inferInsert)[] = []
    let especiales = 0
    for (const [codigoLista, filas] of preciosPorLista) {
      const lista = listaDe.get(codigoLista)
      if (!lista) continue
      const base = lista.derivada ? new Map((preciosPorLista.get(lista.base!) ?? []).map((p) => [limpio(p.IdArticulo), p])) : null
      for (const p of filas) {
        const articuloId = articuloDe.get(limpio(p.IdArticulo))
        if (!articuloId) continue
        const moneda = MONEDA[limpio(p.idmoneda)] ?? lista.moneda
        const neto = netoDe(p)
        if (base) {
          const b = base.get(limpio(p.IdArticulo))
          // Desde el neto de la base, que es lo que guarda el ERP: con el precio
          // con IVA de la base nunca coincidía y toda la lista quedaba como
          // precios especiales.
          const calculado = b ? Number(aImporte(aplicarPorcentaje(netoDe(b), lista.porcentaje))) : null
          const mismaMoneda = b ? (MONEDA[limpio(b.idmoneda)] ?? lista.moneda) === moneda : false
          if (calculado !== null && mismaMoneda && Math.abs(calculado - neto) <= Math.max(0.011, calculado * 0.0005)) continue
          especiales++
        }
        filasPrecios.push({
          listaId: lista.id,
          articuloId,
          precio: neto.toFixed(4),
          moneda: moneda === lista.moneda ? null : moneda,
          vigenteDesde: hoy,
        })
      }
    }
    for (let i = 0; i < filasPrecios.length; i += 500) {
      await tx
        .insert(t.precios)
        .values(filasPrecios.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [t.precios.empresaId, t.precios.listaId, t.precios.articuloId, t.precios.vigenteDesde],
          set: { precio: sql`excluded.precio`, moneda: sql`excluded.moneda` },
        })
    }
    cantidades.precios = filasPrecios.length
    cantidades.preciosEspeciales = especiales

    // ------------------------------------------------- Clientes y proveedores
    const filasTerceros: (typeof t.terceros.$inferInsert)[] = []
    const porCuit = new Map<string, number>()
    let riSinCuit = 0
    for (const c of archivos.clientes) {
      const cuit = c.Cuit.replace(/\D/g, '')
      const valido = cuit.length === 11 && validarCuit(cuit).valido
      const condicion = CONDICION_IVA[limpio(c.IdCondiva)] ?? 5
      if (condicion === 1 && !valido) riSinCuit++
      if (cuit && !valido)
        avisos.push(`Cliente ${limpio(c.idcliente)}: CUIT "${limpio(c.Cuit)}" inválido; quedó sin identificar.`)
      if (valido) porCuit.set(cuit, filasTerceros.length)
      filasTerceros.push({
        codigo: limpio(c.idcliente),
        razonSocial: limpio(c.nombre) || `Cliente ${limpio(c.idcliente)}`,
        esCliente: true,
        esProveedor: false,
        tipoDocumento: valido ? 80 : 99,
        numeroDocumento: valido ? cuit : null,
        condicionIva: condicion,
        iibbRegimen: verdadero(c.LiqIbrutos) ? 'local' : null,
        iibbNumero: nulo(c.Ingbrutos),
        email: nulo(c.email)?.split(/[;,\s]+/)[0] ?? null,
        telefono: nulo(c.Telefonos),
        domicilio: nulo(c.Domicilio),
        localidad: nulo(c.Localidad),
        codigoPostal: nulo(c.Cpostal),
        provincia: provincia.get(limpio(c.idprovincia)) ?? null,
        listaPreciosId: listaDe.get(limpio(c.IdLista))?.id ?? null,
        vendedorId: vendedores.get(limpio(c.IdVendedor)) ?? null,
        condicionPagoId: condicionDe.get(limpio(c.IdForma)) ?? null,
        zonaId: zonaDe.get(limpio(c.IdZona)) ?? null,
        transporteId: transporteDe.get(limpio(c.IdTransporte)) ?? null,
        descuento: numero(c.Descu1) ? String(numero(c.Descu1)) : null,
        limiteCredito: numero(c.LimiteCredito) ? numero(c.LimiteCredito).toFixed(2) : null,
        activo: !verdadero(c.inactivo),
      })
    }
    let fusionados = 0
    for (const p of archivos.proveedores) {
      const cuit = p.cuit.replace(/\D/g, '')
      const valido = cuit.length === 11 && validarCuit(cuit).valido
      const indice = valido ? porCuit.get(cuit) : undefined
      if (indice !== undefined) {
        filasTerceros[indice].esProveedor = true
        fusionados++
        continue
      }
      if (valido) porCuit.set(cuit, filasTerceros.length)
      filasTerceros.push({
        codigo: `P${limpio(p.IdProveedor)}`,
        razonSocial: limpio(p.nombre) || `Proveedor ${limpio(p.IdProveedor)}`,
        esCliente: false,
        esProveedor: true,
        tipoDocumento: valido ? 80 : 99,
        numeroDocumento: valido ? cuit : null,
        condicionIva: CONDICION_IVA[limpio(p.idcondiva)] ?? 1,
        iibbNumero: nulo(p.ingbrutos),
        email: nulo(p.email)?.split(/[;,\s]+/)[0] ?? null,
        telefono: nulo(p.telefonos),
        domicilio: nulo(p.domicilio),
        localidad: nulo(p.localidad),
        codigoPostal: nulo(p.cpostal),
        provincia: provincia.get(limpio(p.idprovincia)) ?? null,
        activo: !verdadero(p.Inactivo),
      })
    }
    const terceroDe = await volcar(tx, t.terceros, filasTerceros as Record<string, unknown>[])
    cantidades.terceros = terceroDe.size
    cantidades.clientesQueTambienSonProveedores = fusionados
    if (riSinCuit) avisos.push(`${riSinCuit} clientes Responsables Inscriptos sin CUIT válido: revisarlos antes de facturarles.`)

    // Contactos: se reemplazan los de cada cliente importado.
    const contactos = archivos.contactos
      .map((c) => ({ terceroId: terceroDe.get(limpio(c.idcliente)), nombre: limpio(c.contacto), telefono: nulo(c.telefono) }))
      .filter((c): c is { terceroId: string; nombre: string; telefono: string | null } => Boolean(c.terceroId && c.nombre))
    if (contactos.length) {
      await tx.execute(
        sql`delete from terceros_contactos where tercero_id in (${sql.join([...new Set(contactos.map((c) => sql`${c.terceroId}`))], sql`, `)})`,
      )
      for (let i = 0; i < contactos.length; i += 500) await tx.insert(t.tercerosContactos).values(contactos.slice(i, i + 500))
    }
    cantidades.contactos = contactos.length

    // El stock inicial se carga en la etapa 1 (movimientos de stock).
    cantidades.filasDeStockPendientes = archivos.stock.length

    await auditar(tx, { usuarioId, accion: 'importacion', entidad: 'pymexis', despues: { cantidades, avisos: avisos.length } })
    return { empresaId, cantidades, avisos }
  })
}

/** Quita repetidos por un campo (PYMEXIS tiene nombres de zona repetidos). */
function dedupe<T extends Record<string, unknown>>(filas: T[], campo: keyof T): T[] {
  const vistos = new Set<unknown>()
  return filas.filter((f) => !vistos.has(f[campo]) && vistos.add(f[campo]))
}

export async function empresaPorCuit(tx: Transaccion, cuit: string) {
  const [e] = await tx.select().from(t.empresas).where(eq(t.empresas.cuit, cuit))
  return e ?? null
}
