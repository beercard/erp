'use client'

import { useActionState } from 'react'

import { guardarCertificadoAccion, guardarPercepcionAccion, probarConexionAccion } from '@/app/(app)/facturacion/acciones'
import { Aviso, Boton, Panel } from '@/components/ui'

const control = 'h-9 w-full rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'

export function FormularioCertificado({ ambiente }: { ambiente: string }) {
  const [estado, accion, enviando] = useActionState(guardarCertificadoAccion, undefined)
  return (
    <form action={accion} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Certificado (.crt)</span>
          <input type="file" name="certificado" accept=".crt,.pem,.cer" required className="text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Clave privada (.key)</span>
          <input type="file" name="clave" accept=".key,.pem" required className="text-sm" />
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="mb-1 text-xs font-medium text-texto-2">Ambiente del certificado</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="ambiente" value="homologacion" defaultChecked={ambiente !== 'produccion'} /> Homologación
          (prueba)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="ambiente" value="produccion" defaultChecked={ambiente === 'produccion'} /> Producción
        </label>
      </fieldset>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <div>
        <Boton type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Revisando…' : 'Guardar certificado'}
        </Boton>
      </div>
    </form>
  )
}

export function ProbarConexion() {
  const [estado, accion, probando] = useActionState(probarConexionAccion, undefined)
  return (
    <form action={accion} className="flex flex-col gap-2">
      <div>
        <Boton type="submit" disabled={probando}>
          {probando ? 'Probando…' : 'Probar la conexión con ARCA'}
        </Boton>
      </div>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
    </form>
  )
}

export function FormularioPercepcion({
  inicial,
  provincias,
}: {
  inicial: { nombre: string; provincia: string; alicuota: string; minimoBase: string; soloLetraA: boolean; activa: boolean }
  provincias: { valor: string; texto: string }[]
}) {
  const [estado, accion, enviando] = useActionState(guardarPercepcionAccion, undefined)
  return (
    <Panel className="p-4">
      <h2 className="text-sm font-semibold">Percepción de Ingresos Brutos</h2>
      <p className="mt-1 mb-3 text-xs text-texto-2">
        Se suma a las facturas de los clientes marcados para percepción. La alícuota de cada cliente (padrón) se carga en su
        ficha; si no tiene, se usa la general. <strong>Confirmá alícuota y mínimo con el contador antes de activarla.</strong>
      </p>
      <form action={accion} className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Nombre (sale en la factura)</span>
          <input name="nombre" defaultValue={inicial.nombre} className={control} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Provincia</span>
          <select name="provincia" defaultValue={inicial.provincia} className={control}>
            <option value="">—</option>
            {provincias.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.texto}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Alícuota general (%)</span>
          <input name="alicuota" defaultValue={inicial.alicuota} inputMode="decimal" className={`${control} cifras`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">No percibir si el neto es menor a ($)</span>
          <input name="minimoBase" defaultValue={inicial.minimoBase} inputMode="decimal" className={`${control} cifras`} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="soloLetraA" defaultChecked={inicial.soloLetraA} /> Solo en comprobantes A
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="activa" defaultChecked={inicial.activa} /> Activa
        </label>
        <div className="flex flex-col gap-2 sm:col-span-2">
          {estado?.error && <Aviso>{estado.error}</Aviso>}
          {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
          <div>
            <Boton type="submit" disabled={enviando}>
              {enviando ? 'Grabando…' : 'Guardar percepción'}
            </Boton>
          </div>
        </div>
      </form>
    </Panel>
  )
}
