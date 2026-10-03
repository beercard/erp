import { textoDe, visible, type Campo, type Firma, type Material, type Valores } from '@/modulos/servicio/formularios'

/** Respuestas de un formulario de orden, de solo lectura (pantalla y constancia). */
export function VistaRespuestas({
  campos,
  valores,
  equipos,
  vacio = 'Sin datos.',
  archivos = '/servicio/archivo',
}: {
  campos: Campo[]
  valores: Valores | null
  /** id → texto, para mostrar el equipo elegido. */
  equipos?: Record<string, string>
  vacio?: string
  /** De dónde salen las fotos y la firma (el portal del cliente tiene su propia ruta). */
  archivos?: string
}) {
  const v = valores ?? {}
  const mostrados = campos.filter((c) => visible(c, campos, v) && (c.tipo === 'seccion' || hay(v[c.id])))
  if (!mostrados.some((c) => c.tipo !== 'seccion')) return <p className="text-sm text-texto-2">{vacio}</p>
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {mostrados.map((c) => {
        const valor = v[c.id]
        if (c.tipo === 'seccion') {
          return (
            <h4
              key={c.id}
              className="border-b border-borde pt-1 pb-1 text-xs font-semibold tracking-wide text-texto-2 uppercase sm:col-span-2"
            >
              {c.etiqueta}
            </h4>
          )
        }
        const ancho = ['parrafo', 'tabla', 'materiales', 'fotos', 'firma', 'multiple'].includes(c.tipo) ? 'sm:col-span-2' : ''
        return (
          <div key={c.id} className={ancho}>
            <dt className="text-xs text-texto-3">{c.etiqueta}</dt>
            <dd className="mt-0.5">
              <Valor campo={c} valor={valor} equipos={equipos} archivos={archivos} />
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

const hay = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)

function Valor({
  campo: c,
  valor,
  equipos,
  archivos,
}: {
  campo: Campo
  valor: unknown
  equipos?: Record<string, string>
  archivos: string
}) {
  switch (c.tipo) {
    case 'parrafo':
      return <span className="whitespace-pre-line">{valor as string}</span>
    case 'link':
      // Solo enlaces web: lo importado de otros sistemas puede traer cualquier cosa.
      if (!/^https?:\/\//i.test(String(valor ?? ''))) return <span>{String(valor ?? '')}</span>
      return (
        <a href={valor as string} target="_blank" rel="noreferrer" className="text-acento hover:underline">
          {valor as string}
        </a>
      )
    case 'equipo':
      return <span className="cifras">{equipos?.[valor as string] ?? 'Equipo'}</span>
    case 'tabla':
      return (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-texto-3">
            <tr>
              {(c.columnas ?? []).map((col) => (
                <th key={col.id} className="py-1 pr-3 font-medium">
                  {col.etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(valor as string[][]).map((fila, n) => (
              <tr key={n} className="border-t border-borde">
                {fila.map((x, i) => (
                  <td key={i} className="py-1 pr-3">
                    {x}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'materiales':
      return (
        <ul className="flex flex-col gap-0.5">
          {(valor as Material[]).map((m, n) => (
            <li key={n}>
              <span className="cifras">{m.cantidad.replace('.', ',')}</span> × {m.descripcion}
            </li>
          ))}
        </ul>
      )
    case 'fotos':
      return (
        <span className="flex flex-wrap gap-2">
          {(valor as string[]).map((id) => (
            <a key={id} href={`${archivos}/${id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada de la empresa, servida por la ruta propia */}
              <img
                src={`${archivos}/${id}`}
                alt="Foto de la visita"
                className="size-28 rounded-md border border-borde object-cover"
              />
            </a>
          ))}
        </span>
      )
    case 'firma': {
      const f = valor as Firma
      return (
        <span className="inline-flex flex-col gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada de la empresa, servida por la ruta propia */}
          <img src={`${archivos}/${f.archivoId}`} alt="Firma" className="h-24 rounded-md border border-borde bg-white" />
          {f.aclaracion && <span className="text-xs text-texto-2">{f.aclaracion}</span>}
        </span>
      )
    }
    default:
      return <span className={c.tipo === 'numero' || c.tipo === 'contador' ? 'cifras' : ''}>{textoDe(c, valor)}</span>
  }
}
