'use client'

import { Check, Copy, Download } from 'lucide-react'
import Link from 'next/link'
import { useActionState, useState } from 'react'

import {
  generarPedidoAccion,
  guardarCertificadoAccion,
  guardarPercepcionAccion,
  guardarRegimenAccion,
  probarConexionAccion,
} from '@/app/(app)/facturacion/acciones'
import { REGIMENES_CLASE_A } from '@/modulos/facturacion/tipos'
import { Aviso, Boton, Panel } from '@/components/ui'

const control = 'h-9 w-full rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'

export function FormularioCertificado({ ambiente }: { ambiente: string }) {
  const [estado, accion, enviando] = useActionState(guardarCertificadoAccion, undefined)
  const [conClave, setConClave] = useState(false)
  return (
    <form action={accion} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-texto-2">Certificado (.crt)</span>
          <input type="file" name="certificado" accept=".crt,.pem,.cer" required className="text-sm" />
        </label>
        {conClave ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-texto-2">Clave privada (.key)</span>
            <input type="file" name="clave" accept=".key,.pem" className="text-sm" />
          </label>
        ) : (
          <p className="self-end text-xs text-texto-3">
            Si generaste el pedido acá, no hace falta la clave: el sistema ya la tiene guardada.{' '}
            <button type="button" className="text-acento hover:underline" onClick={() => setConClave(true)}>
              Tengo mi propia clave
            </button>
          </p>
        )}
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
        Manda la alícuota de la ficha de cada cliente (por ejemplo, la mitad a los de Convenio Multilateral; 0 = no se le
        percibe). Si la ficha no tiene, se aplica la general solo a los clientes de esta provincia. La importación de PYMEXIS trae
        la alícuota de cada cliente. <strong>Confirmá alícuota y mínimo con el contador antes de activarla.</strong>
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

/** RG 5762/2025: cómo emite la empresa sus comprobantes A. */
export function FormularioRegimen({ regimen, cbu }: { regimen: string; cbu: string }) {
  const [estado, accion, enviando] = useActionState(guardarRegimenAccion, undefined)
  return (
    <Panel className="p-4">
      <h2 className="text-sm font-semibold">Comprobantes A (RG 5762/2025)</h2>
      <p className="mt-1 mb-3 text-xs text-texto-2">
        Desde diciembre de 2025 no hay más factura M. Según lo que ARCA le asignó a la empresa, las A salen comunes, con la
        leyenda &ldquo;OPERACIÓN SUJETA A RETENCIÓN&rdquo; (códigos 51 a 53; el cliente retiene IVA y Ganancias) o con &ldquo;PAGO
        EN CBU INFORMADA&rdquo;. En los dos casos con leyenda se cobra en la CBU informada.
      </p>
      <form action={accion} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2 text-sm">
          {Object.entries(REGIMENES_CLASE_A).map(([valor, texto]) => (
            <label key={valor} className="flex items-start gap-2">
              <input
                type="radio"
                name="regimen"
                value={valor}
                defaultChecked={regimen === valor}
                className="mt-1 accent-acento"
              />
              {texto}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-xs font-medium text-texto-2">
          CBU informada
          <input
            name="cbu"
            defaultValue={cbu}
            inputMode="numeric"
            maxLength={26}
            className="cifras h-9 rounded-md border border-borde bg-superficie px-2 text-sm"
          />
        </label>
        {estado?.error && <Aviso>{estado.error}</Aviso>}
        {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
        <Boton type="submit" disabled={enviando}>
          Guardar
        </Boton>
      </form>
    </Panel>
  )
}

/** Paso 1: el sistema genera la clave (queda guardada cifrada) y el pedido de certificado para ARCA. */
export function PedidoCertificado({ csr, pendiente }: { csr: string | null; pendiente: boolean }) {
  const [estado, generar, generando] = useActionState(generarPedidoAccion, undefined)
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      {csr && (
        <>
          <textarea
            readOnly
            value={csr}
            rows={5}
            aria-label="Pedido de certificado"
            className="w-full rounded-md border border-borde bg-superficie-2 p-2 font-mono text-[11px] leading-tight text-texto"
          />
          <div className="flex flex-wrap gap-2">
            <Boton
              type="button"
              onClick={() =>
                navigator.clipboard?.writeText(csr).then(() => {
                  setCopiado(true)
                  setTimeout(() => setCopiado(false), 1500)
                })
              }
            >
              {copiado ? <Check /> : <Copy />} {copiado ? 'Copiado' : 'Copiar'}
            </Boton>
            <Link
              href="/configuracion/arca/pedido"
              download
              prefetch={false}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-acento hover:bg-acento-suave"
            >
              <Download aria-hidden className="size-4" /> Descargar (.csr)
            </Link>
          </div>
          {!pendiente && (
            <p className="text-xs text-texto-3">
              Este pedido ya se usó. Sirve para pedir el certificado del otro ambiente (homologación o producción) con la misma
              clave; para renovar, generá uno nuevo.
            </p>
          )}
        </>
      )}
      <form
        action={generar}
        onSubmit={(e) => {
          if (pendiente && !confirm('Ya hay un pedido sin usar. ¿Generar uno nuevo? El anterior deja de servir.'))
            e.preventDefault()
        }}
      >
        <Boton type="submit" variante={csr ? 'fantasma' : 'primario'} disabled={generando}>
          {generando ? 'Generando…' : csr ? 'Generar un pedido nuevo' : 'Generar el pedido de certificado'}
        </Boton>
      </form>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
    </div>
  )
}
