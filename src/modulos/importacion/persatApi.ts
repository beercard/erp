/**
 * Cliente de la API de Persat para migrar una cuenta al ERP. SOLO LEE:
 * todos los pedidos pasan por `leer`, que hace GET y nada más (la clave de
 * Persat tiene acceso total y la API permite borrar clientes con todo su
 * historial). Documentación: https://docs.api.persat.com.ar
 */

export type Api = { leer: (ruta: string) => Promise<unknown> }

export class ErrorPersat extends Error {
  constructor(
    readonly status: number,
    mensaje: string,
  ) {
    super(mensaje)
  }
}

export function clientePersat(clave: string, o: { base?: string; esperaMs?: number; buscar?: typeof fetch } = {}): Api {
  const base = (o.base ?? 'https://api.persat.com.ar/v1').replace(/\/$/, '')
  const buscar = o.buscar ?? fetch
  return {
    async leer(ruta) {
      const r = await buscar(`${base}${ruta}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${clave}`, Accept: 'application/json' },
      })
      const texto = await r.text()
      let cuerpo: unknown = texto
      try {
        cuerpo = JSON.parse(texto)
      } catch {
        /* no es JSON */
      }
      // Un respiro entre pedidos para no cargar la cuenta.
      if (o.esperaMs !== 0) await new Promise((ok) => setTimeout(ok, o.esperaMs ?? 200))
      if (!r.ok) {
        const m = (cuerpo as { error?: { userMessage?: string } })?.error?.userMessage
        throw new ErrorPersat(r.status, `Persat respondió ${r.status} a ${ruta.split('?')[0]}${m ? `: ${m}` : ''}`)
      }
      return cuerpo
    },
  }
}

const datos = <T>(c: unknown): T[] => {
  const d = Array.isArray(c) ? c : (c as { data?: unknown })?.data
  return (Array.isArray(d) ? d : d ? [d] : []) as T[]
}

// ---------------------------------------------------------------- Tipos (lo que usa el importador)

export type ClientePersat = {
  uid_client: string
  company_name: string
  company_description?: string | null
  type_id?: number | null
  latitude?: number | null
  longitude?: number | null
  street?: string | null
  street_nbr?: string | null
  neighborhood?: string | null
  city?: string | null
  custom_fields?: Record<string, { name?: string; value?: unknown } | unknown>
}

export type EquipoPersat = { uid_client: string; obj_id: number; fields: Record<string, unknown>; updated?: string }
export type ObjetoPersat = { obj_id: number; name: string; fields: { id: number; name: string; type: string }[] }
export type TecnicoPersat = { user_id: number; name: string; real_name?: string | null; deleted?: boolean }
export type EtiquetaPersat = { id: number; name: string; color: string }
export type WidgetPersat = { id: string; title: string; widget_type: string; description?: Record<string, unknown> | null }
export type EsquemaOtPersat = {
  wo_group: number
  wo_shema_id: number
  version: number
  production: boolean
  name: string
  default_service_time?: number
  instructions_description: { widgets: WidgetPersat[] }
  results_description: { widgets: WidgetPersat[] }
}
export type OrdenPersat = {
  _id: number | string
  state: string
  created: string
  labels_ids?: number[]
  client: { id: number; name: string; uid_client: string }
  assignation_info?: {
    date?: string | null
    starts_min?: number | null
    responsibles?: { user_id: number; user_name: string }[]
  }
  wo_data: {
    schema_id: number
    service_time?: number
    instructions?: { formvalues?: Record<string, unknown> }
    results?: { last_updated?: string; formvalues?: Record<string, unknown>; closing_info?: { cause?: string | null } }
  }
}

export type DatosPersat = {
  clientes: ClientePersat[]
  tiposCliente: { id: number; name: string }[]
  camposCliente: { id: number; name: string }[]
  objetos: ObjetoPersat[]
  equipos: EquipoPersat[]
  tecnicos: TecnicoPersat[]
  etiquetas: EtiquetaPersat[]
  esquemasOt: EsquemaOtPersat[]
  ordenes: OrdenPersat[]
}

// ---------------------------------------------------------------- Descarga

const DIA = 86_400_000

/** Baja todo lo que hace falta para migrar: maestros completos y las órdenes desde `desde`. */
export async function descargarPersat(
  api: Api,
  o: { desde: Date; hasta?: Date; avance?: (texto: string) => void },
): Promise<DatosPersat> {
  const avance = o.avance ?? (() => undefined)
  const paginado = async <T>(ruta: string) => {
    const todos: T[] = []
    for (let offset = 0; ; offset += 100) {
      const pagina = datos<T>(await api.leer(`${ruta}${ruta.includes('?') ? '&' : '?'}limit=100&offset=${offset}`))
      todos.push(...pagina)
      if (pagina.length < 100) return todos
    }
  }

  avance('maestros')
  const [tiposCliente, camposCliente, objetos, tecnicos, etiquetas, versiones] = [
    datos<{ id: number; name: string }>(await api.leer('/client-types')),
    datos<{ id: number; name: string }>(await api.leer('/client-custom-fields')),
    datos<ObjetoPersat>(await api.leer('/clientobj')),
    datos<TecnicoPersat>(await api.leer('/technician-users')),
    datos<EtiquetaPersat>(await api.leer('/work-orders-labels')),
    datos<{ wo_shema_id: number }>(await api.leer('/work-orders-schemas')),
  ]
  const esquemasOt: EsquemaOtPersat[] = []
  for (const v of versiones) esquemasOt.push(...datos<EsquemaOtPersat>(await api.leer(`/work-orders-schemas/${v.wo_shema_id}`)))

  avance('clientes')
  const clientes = await paginado<ClientePersat>('/clients')
  avance(`equipos (${clientes.length} clientes)`)
  const equipos: EquipoPersat[] = []
  for (const obj of objetos)
    equipos.push(
      ...(await paginado<EquipoPersat>(`/listclientobjvaluesupdated/${obj.obj_id}?last_updated=2000-01-01T00:00:00.000Z`)),
    )

  // Las órdenes se piden de a 15 días (la API no deja más).
  const ordenes: OrdenPersat[] = []
  const hasta = o.hasta ?? new Date()
  for (let inicio = new Date(o.desde); inicio <= hasta;) {
    const fin = new Date(Math.min(inicio.getTime() + 14 * DIA, hasta.getTime()))
    avance(`órdenes desde ${inicio.toISOString().slice(0, 10)}`)
    ordenes.push(...datos<OrdenPersat>(await api.leer(`/work-orders?from=${inicio.toISOString()}&to=${fin.toISOString()}`)))
    inicio = new Date(fin.getTime() + DIA)
  }
  // Una orden puede venir en dos tramos (por la hora): una vez cada una.
  const unicas = [...new Map(ordenes.map((x) => [String(x._id), x])).values()]
  return { clientes, tiposCliente, camposCliente, objetos, equipos, tecnicos, etiquetas, esquemasOt, ordenes: unicas }
}

/** Baja una foto o firma de Persat (las URL que vienen en las respuestas). */
export async function bajarArchivo(url: string, buscar: typeof fetch = fetch) {
  const r = await buscar(url, { method: 'GET' })
  if (!r.ok) return null
  return Buffer.from(await r.arrayBuffer())
}
