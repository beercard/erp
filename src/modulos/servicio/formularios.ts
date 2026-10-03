/**
 * Formularios de las órdenes de servicio (como los de Persat): cada tipo de
 * orden tiene un formulario de instrucciones, que completa la oficina, y uno
 * de devolución, que completa el técnico. La definición es una lista de
 * campos en JSON; las respuestas, un objeto { idDelCampo: valor }.
 *
 * A diferencia de Persat, un campo puede mostrarse solo si otro tiene cierto
 * valor (`si`). Un campo oculto no se valida y su respuesta se descarta.
 *
 * No toca la base: lo usan el servidor (para validar) y el navegador (para
 * dibujar el formulario).
 */

export const TIPOS_CAMPO = {
  texto: 'Texto corto',
  parrafo: 'Párrafo',
  numero: 'Número',
  fecha: 'Fecha',
  hora: 'Hora',
  seleccion: 'Selección (una opción)',
  multiple: 'Selección múltiple',
  si_no: 'Sí / No',
  link: 'Link',
  estatico: 'Texto fijo (indicación)',
  seccion: 'Título de sección',
  fotos: 'Fotos',
  firma: 'Firma',
  tabla: 'Tabla',
  materiales: 'Materiales usados (artículos con stock)',
  equipo: 'Equipo del cliente',
  contador: 'Contador del equipo',
} as const

export type TipoCampo = keyof typeof TIPOS_CAMPO

export type Columna = { id: string; etiqueta: string; tipo: 'texto' | 'numero' | 'seleccion'; opciones?: string[] }

export type Campo = {
  id: string
  tipo: TipoCampo
  etiqueta: string
  requerido?: boolean
  ayuda?: string
  /** seleccion y multiple */
  opciones?: string[]
  /** tabla */
  columnas?: Columna[]
  /** tabla y materiales: filas mínimas si es requerido (por defecto 1) */
  minFilas?: number
  /** fotos: máximo (por defecto 10, como Persat) */
  maximo?: number
  /** Solo se muestra si el campo `campo` vale `valor` (o lo incluye, si es múltiple). */
  si?: { campo: string; valor: string }
}

/** Campos que no llevan respuesta. */
const SIN_VALOR: TipoCampo[] = ['estatico', 'seccion']
/** Campos que solo puede completar el técnico (piden el celular o mueven stock y lecturas). */
export const SOLO_DEVOLUCION: TipoCampo[] = ['fotos', 'firma', 'materiales', 'contador']
/** De estos, uno por formulario: cada uno tiene un efecto (stock, lectura, constancia). */
const UNO_POR_FORMULARIO: TipoCampo[] = ['materiales', 'contador', 'firma', 'equipo']

export type Material = { articuloId: string | null; descripcion: string; cantidad: string }
export type Firma = { archivoId: string; aclaracion: string }
export type Lectura = { contador: number; creditos: number }

export type Valores = Record<string, unknown>

// -------------------------------------------------------------- Definición

const ID = /^[a-z][a-z0-9_]{0,39}$/

/** Revisa que la definición de un formulario sea usable. Devuelve el primer problema. */
export function validarDefinicion(campos: unknown, donde: 'instrucciones' | 'devolucion' | 'suelto'): string | null {
  if (!Array.isArray(campos)) return 'El formulario tiene que ser una lista de campos.'
  if (campos.length > 80) return 'El formulario no puede tener más de 80 campos.'
  const vistos = new Map<string, Campo>()
  for (const [n, c] of (campos as Campo[]).entries()) {
    const donde_ = `Campo ${n + 1}`
    if (!c || typeof c !== 'object') return `${donde_}: inválido.`
    if (!(c.tipo in TIPOS_CAMPO)) return `${donde_}: tipo desconocido.`
    if (typeof c.etiqueta !== 'string' || !c.etiqueta.trim()) return `${donde_}: falta el título.`
    if (c.etiqueta.length > 200) return `“${c.etiqueta.slice(0, 30)}…”: el título es muy largo.`
    if (typeof c.id !== 'string' || !ID.test(c.id)) return `“${c.etiqueta}”: identificador inválido.`
    if (vistos.has(c.id)) return `“${c.etiqueta}”: hay dos campos con el mismo identificador.`
    if (donde === 'instrucciones' && SOLO_DEVOLUCION.includes(c.tipo)) {
      return `“${c.etiqueta}”: ${TIPOS_CAMPO[c.tipo].toLowerCase()} va en la devolución del técnico, no en las instrucciones.`
    }
    if (donde === 'suelto' && (c.tipo === 'materiales' || c.tipo === 'contador')) {
      return `“${c.etiqueta}”: ${TIPOS_CAMPO[c.tipo].toLowerCase()} solo va en la devolución de una orden.`
    }
    if (UNO_POR_FORMULARIO.includes(c.tipo) && [...vistos.values()].some((v) => v.tipo === c.tipo)) {
      return `Solo puede haber un campo de ${TIPOS_CAMPO[c.tipo].toLowerCase()} por formulario.`
    }
    if (c.tipo === 'seleccion' || c.tipo === 'multiple') {
      const ops = (c.opciones ?? []).map((o) => o.trim()).filter(Boolean)
      if (ops.length < 2) return `“${c.etiqueta}”: escribí al menos dos opciones.`
      if (new Set(ops).size !== ops.length) return `“${c.etiqueta}”: hay opciones repetidas.`
    }
    if (c.tipo === 'tabla') {
      if (!c.columnas?.length) return `“${c.etiqueta}”: la tabla necesita columnas.`
      if (c.columnas.length > 8) return `“${c.etiqueta}”: hasta 8 columnas.`
      for (const col of c.columnas) {
        if (!col.etiqueta?.trim()) return `“${c.etiqueta}”: a una columna le falta el título.`
        if (col.tipo === 'seleccion' && (col.opciones ?? []).filter((o) => o.trim()).length < 2) {
          return `“${c.etiqueta}”: la columna “${col.etiqueta}” necesita al menos dos opciones.`
        }
      }
    }
    if (c.si) {
      const base = vistos.get(c.si.campo)
      if (!base) return `“${c.etiqueta}”: la condición tiene que depender de un campo anterior.`
      if (!['seleccion', 'multiple', 'si_no'].includes(base.tipo)) {
        return `“${c.etiqueta}”: la condición solo puede depender de una selección o de un Sí / No.`
      }
      const posibles = base.tipo === 'si_no' ? ['Sí', 'No'] : (base.opciones ?? [])
      if (!posibles.includes(c.si.valor)) return `“${c.etiqueta}”: la condición usa una opción que no existe.`
    }
    vistos.set(c.id, c)
  }
  return null
}

/** Identificador estable a partir del título (para los campos nuevos del editor). */
export function idDesdeEtiqueta(etiqueta: string, usados: Set<string>): string {
  const base =
    etiqueta
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^(\d)/, 'c_$1')
      .slice(0, 32) || 'campo'
  let id = base
  for (let n = 2; usados.has(id); n++) id = `${base}_${n}`
  return id
}

// ------------------------------------------------------------- Respuestas

/** Si el campo se muestra con las respuestas actuales (y su condición, a su vez, se muestra). */
export function visible(campo: Campo, campos: Campo[], valores: Valores): boolean {
  if (!campo.si) return true
  const base = campos.find((c) => c.id === campo.si!.campo)
  if (!base || !visible(base, campos, valores)) return false
  const v = valores[base.id]
  return Array.isArray(v) ? v.includes(campo.si.valor) : v === campo.si.valor
}

const vacio = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0)

const NUMERO = /^-?\d+([.,]\d+)?$/
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Resultado = { ok: true; valores: Valores } | { ok: false; error: string }

/**
 * Valida las respuestas contra la definición y devuelve solo las de los
 * campos visibles, normalizadas (números con punto, textos recortados).
 */
export function validarValores(campos: Campo[], entrada: unknown): Resultado {
  const valores = (entrada && typeof entrada === 'object' ? entrada : {}) as Valores
  const limpios: Valores = {}
  for (const c of campos) {
    if (SIN_VALOR.includes(c.tipo) || !visible(c, campos, valores)) continue
    const v = valores[c.id]
    const nombre = `“${c.etiqueta}”`
    if (vacio(v)) {
      if (c.requerido) return { ok: false, error: `Falta completar ${nombre}.` }
      continue
    }
    switch (c.tipo) {
      case 'texto':
      case 'parrafo':
      case 'link': {
        if (typeof v !== 'string') return { ok: false, error: `${nombre} es inválido.` }
        const max = c.tipo === 'texto' ? 200 : c.tipo === 'link' ? 500 : 2000
        if (v.trim().length > max) return { ok: false, error: `${nombre}: hasta ${max} caracteres.` }
        if (c.tipo === 'link' && !/^https?:\/\/\S+$/i.test(v.trim())) {
          return { ok: false, error: `${nombre} tiene que empezar con http:// o https://.` }
        }
        limpios[c.id] = v.trim()
        break
      }
      case 'numero': {
        // "1.234,5" (con coma decimal, el punto es de miles) o "1234.5".
        const crudo = String(v).trim()
        const t = crudo.includes(',') ? crudo.replace(/\./g, '').replace(',', '.') : crudo
        if (!NUMERO.test(t)) return { ok: false, error: `${nombre} tiene que ser un número.` }
        limpios[c.id] = t
        break
      }
      case 'fecha':
        if (typeof v !== 'string' || !FECHA.test(v)) return { ok: false, error: `${nombre}: fecha inválida.` }
        limpios[c.id] = v
        break
      case 'hora':
        if (typeof v !== 'string' || !HORA.test(v)) return { ok: false, error: `${nombre}: hora inválida.` }
        limpios[c.id] = v
        break
      case 'seleccion':
      case 'si_no': {
        const ops = c.tipo === 'si_no' ? ['Sí', 'No'] : (c.opciones ?? [])
        if (typeof v !== 'string' || !ops.includes(v)) return { ok: false, error: `${nombre}: elegí una opción.` }
        limpios[c.id] = v
        break
      }
      case 'multiple': {
        if (!Array.isArray(v) || v.some((x) => !(c.opciones ?? []).includes(x))) {
          return { ok: false, error: `${nombre}: opción inválida.` }
        }
        limpios[c.id] = [...new Set(v as string[])]
        break
      }
      case 'fotos': {
        const max = c.maximo ?? 10
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !UUID.test(x))) {
          return { ok: false, error: `${nombre}: fotos inválidas.` }
        }
        if (v.length > max) return { ok: false, error: `${nombre}: hasta ${max} fotos.` }
        limpios[c.id] = v
        break
      }
      case 'firma': {
        const f = v as Partial<Firma>
        if (typeof f !== 'object' || typeof f.archivoId !== 'string' || !UUID.test(f.archivoId)) {
          return { ok: false, error: `${nombre}: falta la firma.` }
        }
        const aclaracion = String(f.aclaracion ?? '').trim()
        if (c.requerido && !aclaracion) return { ok: false, error: `${nombre}: escribí la aclaración de quien firma.` }
        limpios[c.id] = { archivoId: f.archivoId, aclaracion }
        break
      }
      case 'tabla': {
        if (!Array.isArray(v)) return { ok: false, error: `${nombre}: tabla inválida.` }
        const cols = c.columnas ?? []
        const filas: string[][] = []
        for (const fila of v as unknown[]) {
          if (!Array.isArray(fila)) return { ok: false, error: `${nombre}: tabla inválida.` }
          const celdas = cols.map((col, i) => String(fila[i] ?? '').trim())
          if (celdas.every((x) => !x)) continue
          for (const [i, col] of cols.entries()) {
            const x = celdas[i]
            if (!x) continue
            if (col.tipo === 'numero' && !NUMERO.test(x)) {
              return { ok: false, error: `${nombre}: “${col.etiqueta}” tiene que ser un número.` }
            }
            if (col.tipo === 'seleccion' && !(col.opciones ?? []).includes(x)) {
              return { ok: false, error: `${nombre}: opción inválida en “${col.etiqueta}”.` }
            }
            if (col.tipo === 'numero') celdas[i] = x.replace(',', '.')
          }
          filas.push(celdas)
        }
        if (c.requerido && filas.length < (c.minFilas ?? 1)) {
          return { ok: false, error: `${nombre}: cargá al menos ${c.minFilas ?? 1} fila${(c.minFilas ?? 1) > 1 ? 's' : ''}.` }
        }
        if (filas.length) limpios[c.id] = filas
        break
      }
      case 'materiales': {
        if (!Array.isArray(v)) return { ok: false, error: `${nombre}: lista inválida.` }
        const filas: Material[] = []
        for (const m of v as Partial<Material>[]) {
          const descripcion = String(m?.descripcion ?? '').trim()
          const cantidad = String(m?.cantidad ?? '')
            .trim()
            .replace(',', '.')
          if (!descripcion && !m?.articuloId) continue
          if (m?.articuloId && !UUID.test(m.articuloId)) return { ok: false, error: `${nombre}: artículo inválido.` }
          if (!/^\d+(\.\d{1,4})?$/.test(cantidad) || Number(cantidad) <= 0) {
            return { ok: false, error: `${nombre}: “${descripcion || 'un renglón'}” necesita una cantidad mayor que cero.` }
          }
          filas.push({ articuloId: m?.articuloId ?? null, descripcion, cantidad })
        }
        if (c.requerido && filas.length < (c.minFilas ?? 1)) return { ok: false, error: `Falta completar ${nombre}.` }
        if (filas.length) limpios[c.id] = filas
        break
      }
      case 'equipo':
        if (typeof v !== 'string' || !UUID.test(v)) return { ok: false, error: `${nombre}: elegí el equipo.` }
        limpios[c.id] = v
        break
      case 'contador': {
        const l = v as Partial<Lectura>
        const contador = Number(String(l?.contador ?? '').replace(/\./g, ''))
        const creditos = Number(String(l?.creditos ?? '0').replace(/\./g, '') || 0)
        if (!Number.isInteger(contador) || contador < 0)
          return { ok: false, error: `${nombre}: el contador es un número entero.` }
        if (!Number.isInteger(creditos) || creditos < 0)
          return { ok: false, error: `${nombre}: las copias de prueba son un número entero.` }
        limpios[c.id] = { contador, creditos }
        break
      }
    }
  }
  return { ok: true, valores: limpios }
}

/** Primer campo de un tipo (para los efectos: materiales, contador, firma, equipo). */
export const campoDe = (campos: Campo[], tipo: TipoCampo) => campos.find((c) => c.tipo === tipo)

/** Archivos (fotos y firma) que usan las respuestas. */
export function archivosDe(campos: Campo[], valores: Valores): string[] {
  const ids: string[] = []
  for (const c of campos) {
    const v = valores[c.id]
    if (c.tipo === 'fotos' && Array.isArray(v)) ids.push(...(v as string[]))
    if (c.tipo === 'firma' && v) ids.push((v as Firma).archivoId)
  }
  return ids
}

/** Respuesta en texto, para la constancia y las pantallas. */
export function textoDe(campo: Campo, v: unknown): string {
  if (vacio(v)) return ''
  switch (campo.tipo) {
    case 'multiple':
      return (v as string[]).join(', ')
    case 'numero':
      return String(v).replace('.', ',')
    case 'fecha':
      return (v as string).split('-').reverse().join('/')
    case 'contador': {
      const l = v as Lectura
      return `${l.contador.toLocaleString('es-AR')}${l.creditos ? ` (${l.creditos.toLocaleString('es-AR')} copias de prueba)` : ''}`
    }
    case 'firma':
      return (v as Firma).aclaracion
    case 'fotos':
      return `${(v as string[]).length} foto${(v as string[]).length === 1 ? '' : 's'}`
    default:
      return typeof v === 'string' ? v : ''
  }
}

// ---------------------------------------------------- Modelos de ejemplo

/** Modelos listos para empezar (como la biblioteca de Persat), pensados para fotocopiadoras e impresoras. */
export const MODELOS: {
  codigo: string
  nombre: string
  clase: string
  duracion: number
  instrucciones: Campo[]
  devolucion: Campo[]
}[] = [
  {
    codigo: 'CORR',
    nombre: 'Correctivo de fotocopiadora',
    clase: 'correctivo',
    duracion: 60,
    instrucciones: [
      { id: 'equipo', tipo: 'equipo', etiqueta: 'Equipo', requerido: true },
      { id: 'falla_reportada', tipo: 'parrafo', etiqueta: 'Falla que reporta el cliente', requerido: true },
      { id: 'codigo_error', tipo: 'texto', etiqueta: 'Código de error en pantalla' },
    ],
    devolucion: [
      { id: 'diag', tipo: 'seccion', etiqueta: 'Diagnóstico' },
      {
        id: 'causa',
        tipo: 'seleccion',
        etiqueta: 'Causa',
        requerido: true,
        opciones: ['Atasco de papel', 'Calidad de impresión', 'Código de error', 'Red o escaneo', 'Uso indebido', 'Otra'],
      },
      { id: 'causa_otra', tipo: 'texto', etiqueta: '¿Cuál?', requerido: true, si: { campo: 'causa', valor: 'Otra' } },
      { id: 'trabajo', tipo: 'parrafo', etiqueta: 'Trabajo realizado', requerido: true },
      { id: 'materiales', tipo: 'materiales', etiqueta: 'Repuestos e insumos usados' },
      { id: 'contador', tipo: 'contador', etiqueta: 'Contador del equipo' },
      { id: 'fotos', tipo: 'fotos', etiqueta: 'Fotos', maximo: 10 },
      { id: 'funcionando', tipo: 'si_no', etiqueta: '¿El equipo quedó funcionando?', requerido: true },
      {
        id: 'pendiente',
        tipo: 'parrafo',
        etiqueta: '¿Qué quedó pendiente?',
        requerido: true,
        si: { campo: 'funcionando', valor: 'No' },
      },
      { id: 'cierre', tipo: 'seccion', etiqueta: 'Conformidad del cliente' },
      { id: 'firma', tipo: 'firma', etiqueta: 'Firma del cliente', requerido: true },
    ],
  },
  {
    codigo: 'PREV',
    nombre: 'Preventivo de fotocopiadora',
    clase: 'preventivo',
    duracion: 90,
    instrucciones: [{ id: 'equipo', tipo: 'equipo', etiqueta: 'Equipo', requerido: true }],
    devolucion: [
      {
        id: 'tareas',
        tipo: 'multiple',
        etiqueta: 'Tareas realizadas',
        requerido: true,
        opciones: [
          'Limpieza general',
          'Limpieza de vidrio y escáner',
          'Limpieza de rodillos de alimentación',
          'Revisión de unidad de fusión',
          'Revisión de unidad de imagen',
          'Ajuste de registro',
          'Actualización de firmware',
        ],
      },
      {
        id: 'estado',
        tipo: 'tabla',
        etiqueta: 'Estado de consumibles',
        columnas: [
          { id: 'pieza', etiqueta: 'Pieza', tipo: 'texto' },
          { id: 'vida', etiqueta: '% de vida', tipo: 'numero' },
          { id: 'accion', etiqueta: 'Acción', tipo: 'seleccion', opciones: ['OK', 'Cambiar pronto', 'Cambiado'] },
        ],
      },
      { id: 'materiales', tipo: 'materiales', etiqueta: 'Repuestos e insumos usados' },
      { id: 'contador', tipo: 'contador', etiqueta: 'Contador del equipo', requerido: true },
      { id: 'observaciones', tipo: 'parrafo', etiqueta: 'Observaciones' },
      { id: 'firma', tipo: 'firma', etiqueta: 'Firma del cliente', requerido: true },
    ],
  },
  {
    codigo: 'INST',
    nombre: 'Instalación de equipo',
    clase: 'instalacion',
    duracion: 120,
    instrucciones: [
      { id: 'equipo', tipo: 'equipo', etiqueta: 'Equipo a instalar', requerido: true },
      { id: 'red', tipo: 'si_no', etiqueta: '¿Se conecta a la red?', requerido: true },
      { id: 'ip', tipo: 'texto', etiqueta: 'IP asignada', si: { campo: 'red', valor: 'Sí' } },
    ],
    devolucion: [
      {
        id: 'configurado',
        tipo: 'multiple',
        etiqueta: 'Quedó configurado',
        opciones: ['Impresión', 'Escaneo a carpeta', 'Escaneo a email', 'Fax', 'Códigos de usuario'],
      },
      { id: 'capacitacion', tipo: 'si_no', etiqueta: '¿Se capacitó a los usuarios?', requerido: true },
      { id: 'contador', tipo: 'contador', etiqueta: 'Contador al instalar', requerido: true },
      { id: 'materiales', tipo: 'materiales', etiqueta: 'Materiales usados' },
      { id: 'fotos', tipo: 'fotos', etiqueta: 'Fotos de la instalación', maximo: 5 },
      { id: 'firma', tipo: 'firma', etiqueta: 'Firma del cliente', requerido: true },
    ],
  },
  {
    codigo: 'INSU',
    nombre: 'Entrega de insumos',
    clase: 'insumos',
    duracion: 20,
    instrucciones: [{ id: 'detalle', tipo: 'parrafo', etiqueta: 'Qué hay que entregar', requerido: true }],
    devolucion: [
      { id: 'materiales', tipo: 'materiales', etiqueta: 'Insumos entregados', requerido: true },
      { id: 'contador', tipo: 'contador', etiqueta: 'Contador del equipo' },
      { id: 'firma', tipo: 'firma', etiqueta: 'Recibió', requerido: true },
    ],
  },
]
