'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useState } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { arbaAccion, consultarArbaAccion, retencionIibbAccion } from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm'
const etiqueta = 'flex flex-col gap-1 text-xs font-medium text-texto-2'
type Provincia = { codigo: string; nombre: string }

function Estado({ e }: { e: { error?: string; ok?: string } | undefined }) {
  if (e?.error) return <Aviso>{e.error}</Aviso>
  if (e?.ok) return <Aviso tono="ok">{e.ok}</Aviso>
  return null
}

export function RetencionIibb({
  c,
  provincias,
}: {
  c: { activa: boolean; provincia: string | null; minimo: string; alicuotaGeneral: string | null }
  provincias: Provincia[]
}) {
  const [estado, accion, enviando] = useActionState(retencionIibbAccion, undefined)
  return (
    <form action={accion} className="flex flex-col gap-3 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" name="activa" defaultChecked={c.activa} className="accent-acento" />
        La empresa retiene Ingresos Brutos al pagar a proveedores
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className={etiqueta}>
          Provincia (agente de retención)
          <select name="provincia" defaultValue={c.provincia ?? ''} className={control}>
            <option value="">—</option>
            {provincias.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className={etiqueta}>
          Base mínima $
          <input name="minimo" inputMode="decimal" defaultValue={c.minimo.replace('.', ',')} className={control} />
        </label>
        <label className={etiqueta}>
          % si no está en el padrón
          <input
            name="alicuotaGeneral"
            inputMode="decimal"
            defaultValue={c.alicuotaGeneral?.replace('.', ',') ?? ''}
            placeholder="No retener"
            className={control}
          />
        </label>
      </div>
      <Estado e={estado} />
      <div>
        <Boton type="submit" variante="primario" disabled={enviando}>
          Guardar
        </Boton>
      </div>
    </form>
  )
}

export function ImportarPadron({ provincias, formatos }: { provincias: Provincia[]; formatos: Record<string, string> }) {
  const router = useRouter()
  const [formato, setFormato] = useState('arba')
  const [estado, setEstado] = useState<{ error?: string; ok?: string }>()
  const [enviando, setEnviando] = useState(false)
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const archivo = fd.get('archivo')
    if (!(archivo instanceof File) || !archivo.size)
      return setEstado({ error: 'Elegí el archivo del padrón (descomprimido, .txt).' })
    const q = new URLSearchParams({ formato })
    for (const k of ['provincia', 'desde', 'hasta']) if (fd.get(k)) q.set(k, String(fd.get(k)))
    setEnviando(true)
    setEstado(undefined)
    try {
      const r = await fetch(`/api/padrones/iibb?${q}`, { method: 'POST', body: archivo })
      const d = await r.json()
      setEstado(
        d.ok
          ? {
              ok: `Se leyeron ${d.leidos.toLocaleString('es-AR')} renglones del padrón; quedaron ${d.guardados} de tus clientes y proveedores.`,
            }
          : { error: d.error },
      )
      if (d.ok) router.refresh()
    } catch {
      setEstado({ error: 'No se pudo subir el archivo.' })
    } finally {
      setEnviando(false)
    }
  }
  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 text-sm">
      <label className={etiqueta}>
        Padrón
        <select name="formato" value={formato} onChange={(e) => setFormato(e.target.value)} className={control}>
          {Object.entries(formatos).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {formato === 'generico' && (
        <div className="grid gap-2 sm:grid-cols-3">
          <label className={etiqueta}>
            Provincia
            <select name="provincia" className={control} required>
              <option value="">—</option>
              {provincias.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className={etiqueta}>
            Vigente desde
            <input type="date" name="desde" className={control} required />
          </label>
          <label className={etiqueta}>
            Hasta
            <input type="date" name="hasta" className={control} required />
          </label>
        </div>
      )}
      <input type="file" name="archivo" accept=".txt,.csv,text/plain" className="text-sm" />
      <p className="text-xs text-texto-3">
        Se lee el archivo entero y se guardan solo los CUIT de tus clientes y proveedores. Los de ARBA vienen comprimidos: hay que
        descomprimirlos antes. Percepción y retención son dos archivos: se suben uno después del otro.
      </p>
      <Estado e={estado} />
      <div>
        <Boton type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Leyendo…' : 'Importar'}
        </Boton>
      </div>
    </form>
  )
}

export function AccesoArba({
  c,
}: {
  c: { usuario: string; ambiente: string; cotPlanta: string; cotPuerta: string; tieneCit: boolean } | null
}) {
  const [estado, accion, enviando] = useActionState(arbaAccion, undefined)
  const [consulta, consultar, consultando] = useActionState(consultarArbaAccion, undefined)
  return (
    <div className="flex flex-col gap-3 text-sm">
      <form action={accion} className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className={etiqueta}>
            Usuario (CUIT)
            <input name="usuario" defaultValue={c?.usuario ?? ''} inputMode="numeric" className={control} />
          </label>
          <label className={etiqueta}>
            CIT
            <input
              name="cit"
              type="password"
              autoComplete="new-password"
              placeholder={c?.tieneCit ? 'Guardada (dejala vacía para no cambiarla)' : ''}
              className={control}
            />
          </label>
          <label className={etiqueta}>
            Ambiente
            <select name="ambiente" defaultValue={c?.ambiente ?? 'prueba'} className={control}>
              <option value="prueba">Prueba</option>
              <option value="produccion">Producción</option>
            </select>
          </label>
          <label className={etiqueta}>
            Planta (COT)
            <input name="cotPlanta" defaultValue={c?.cotPlanta ?? '000000'} inputMode="numeric" className={control} />
          </label>
          <label className={etiqueta}>
            Puerta (COT)
            <input name="cotPuerta" defaultValue={c?.cotPuerta ?? '000'} inputMode="numeric" className={control} />
          </label>
        </div>
        <Estado e={estado} />
        <div>
          <Boton type="submit" variante="primario" disabled={enviando}>
            Guardar
          </Boton>
        </div>
      </form>
      {c && (
        <form action={consultar} className="flex flex-col gap-2 border-t border-borde pt-3">
          <p className="text-texto-2">
            Consulta a ARBA la alícuota de percepción y de retención del mes de todos tus clientes y proveedores con CUIT.
          </p>
          <Estado e={consulta} />
          <div>
            <Boton type="submit" disabled={consultando}>
              {consultando ? 'Consultando…' : 'Consultar alícuotas en ARBA'}
            </Boton>
          </div>
        </form>
      )}
    </div>
  )
}
