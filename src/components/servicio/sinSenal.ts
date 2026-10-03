'use client'

/**
 * Trabajo sin señal en el celular del técnico. Lo que no se puede mandar en
 * el momento se guarda en el teléfono (IndexedDB) y se manda solo cuando
 * vuelve la señal:
 * - fotos y firmas: quedan con un id "local-…" hasta subirlas;
 * - llegada e informe: quedan en una cola, en orden.
 * El borrador del informe se guarda mientras se escribe (localStorage), así
 * no se pierde si se cierra la página.
 */

const BASE = 'erp-servicio'
const ARCHIVOS = 'archivos'
const COLA = 'cola'

export type Pendiente =
  | { id: string; tipo: 'llegada'; ordenId: string; cuando: string; lat: number | null; lng: number | null }
  | {
      id: string
      tipo: 'informe'
      ordenId: string
      fecha: string
      solucion: string
      cierre: string
      resultados: unknown
    }

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const pedido = indexedDB.open(BASE, 1)
    pedido.onupgradeneeded = () => {
      pedido.result.createObjectStore(ARCHIVOS)
      pedido.result.createObjectStore(COLA)
    }
    pedido.onsuccess = () => ok(pedido.result)
    pedido.onerror = () => mal(pedido.error)
  })
}

async function operar<T>(almacen: string, modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await abrir()
  return new Promise((ok, mal) => {
    const tx = db.transaction(almacen, modo)
    const r = f(tx.objectStore(almacen))
    tx.oncomplete = () => ok(r.result as T)
    tx.onerror = () => mal(tx.error)
  })
}

export const esLocal = (id: string) => id.startsWith('local-')

/** ¿El error fue por falta de señal (y no un rechazo del servidor)? */
export const sinConexion = (e?: unknown) => !navigator.onLine || e instanceof TypeError

export async function guardarArchivoLocal(ordenId: string, clase: 'foto' | 'firma', blob: Blob) {
  const id = `local-${crypto.randomUUID()}`
  await operar(ARCHIVOS, 'readwrite', (s) => s.put({ ordenId, clase, blob }, id))
  return id
}

export async function leerArchivoLocal(id: string) {
  return operar<{ ordenId: string; clase: 'foto' | 'firma'; blob: Blob } | undefined>(ARCHIVOS, 'readonly', (s) => s.get(id))
}

export const borrarArchivoLocal = (id: string) => operar(ARCHIVOS, 'readwrite', (s) => s.delete(id))

/** Omit que respeta cada variante de la unión. */
type SinId<T> = T extends unknown ? Omit<T, 'id'> : never

export async function encolar(p: SinId<Pendiente>) {
  const id = `${Date.now()}-${crypto.randomUUID()}`
  await operar(COLA, 'readwrite', (s) => s.put({ ...p, id }, id))
  window.dispatchEvent(new Event('cola-servicio'))
  return id
}

export async function pendientes(): Promise<Pendiente[]> {
  const todos = await operar<Pendiente[]>(COLA, 'readonly', (s) => s.getAll())
  return todos.sort((a, b) => a.id.localeCompare(b.id))
}

export const quitarDeCola = (id: string) => operar(COLA, 'readwrite', (s) => s.delete(id))

/** Reemplaza los ids locales de fotos y firmas por los definitivos, en cualquier parte de las respuestas. */
export function reemplazarIds(valor: unknown, mapa: Map<string, string>): unknown {
  if (typeof valor === 'string') return mapa.get(valor) ?? valor
  if (Array.isArray(valor)) return valor.map((v) => reemplazarIds(v, mapa))
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, reemplazarIds(v, mapa)]))
  }
  return valor
}

export function idsLocales(valor: unknown, salida = new Set<string>()): Set<string> {
  if (typeof valor === 'string' && esLocal(valor)) salida.add(valor)
  else if (Array.isArray(valor)) valor.forEach((v) => idsLocales(v, salida))
  else if (valor && typeof valor === 'object') Object.values(valor).forEach((v) => idsLocales(v, salida))
  return salida
}

// ---------------------------------------------------------------- Borrador

const claveBorrador = (ordenId: string) => `informe:${ordenId}`

export function leerBorrador(ordenId: string): { resultados?: Record<string, unknown>; solucion?: string; cierre?: string } {
  try {
    return JSON.parse(localStorage.getItem(claveBorrador(ordenId)) ?? '{}')
  } catch {
    return {}
  }
}

export function guardarBorrador(ordenId: string, b: { resultados?: unknown; solucion?: string; cierre?: string }) {
  try {
    localStorage.setItem(claveBorrador(ordenId), JSON.stringify({ ...leerBorrador(ordenId), ...b }))
  } catch {
    // Sin espacio o en modo privado: el borrador no se guarda, pero el formulario sigue andando.
  }
}

export function borrarBorrador(ordenId: string) {
  try {
    localStorage.removeItem(claveBorrador(ordenId))
  } catch {
    // Nada que hacer.
  }
}

/** Saca de la cola los informes de una orden (cuando se manda uno nuevo, reemplaza a los anteriores). */
export async function quitarInformesDe(ordenId: string) {
  for (const p of await pendientes()) if (p.tipo === 'informe' && p.ordenId === ordenId) await quitarDeCola(p.id)
}
