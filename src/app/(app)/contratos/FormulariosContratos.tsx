'use client'

import { useActionState, useState } from 'react'

import { buscarClientes } from '@/app/(app)/comercial/acciones'
import { Buscador } from '@/components/comercial/Buscador'
import { Aviso, Boton } from '@/components/ui'
import { COMERCIALIZACIONES, MODALIDADES } from '@/modulos/contratos/tipos'

import {
  asignarEquipoAccion,
  guardarContratoAccion,
  guardarEquipoAccion,
  importarLecturasAccion,
  lecturaAccion,
  lecturasAccion,
  retirarEquipoAccion,
  type Estado,
} from './acciones'

const control = 'h-9 rounded-md border border-borde bg-superficie px-2 text-sm focus:border-acento'
const etiqueta = 'text-xs font-medium text-texto-2'
type Cliente = Awaited<ReturnType<typeof buscarClientes>>[number]

function Resultado({ estado }: { estado: Estado }) {
  if (estado?.error) return <Aviso>{estado.error}</Aviso>
  if (estado?.ok) return <Aviso tono="ok">{estado.ok}</Aviso>
  return null
}

function ElegirCliente({ inicial }: { inicial?: { id: string; razonSocial: string } | null }) {
  const [cliente, setCliente] = useState(inicial ?? null)
  return (
    <div className="flex flex-col gap-1 sm:col-span-2">
      <span className={etiqueta}>Cliente</span>
      <input type="hidden" name="terceroId" value={cliente?.id ?? ''} />
      {cliente ? (
        <div className="flex h-9 items-center justify-between rounded-md border border-borde bg-superficie-2 px-2.5">
          <span className="truncate text-sm font-medium">{cliente.razonSocial}</span>
          <button type="button" onClick={() => setCliente(null)} className="text-xs text-acento hover:underline">
            Cambiar
          </button>
        </div>
      ) : (
        <Buscador<Cliente>
          etiqueta="Buscar cliente"
          placeholder="Nombre, código o CUIT"
          buscar={buscarClientes}
          clave={(c) => c.id}
          render={(c) => c.razonSocial}
          alElegir={(c) => setCliente({ id: c.id, razonSocial: c.razonSocial })}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Contrato

export type DatosContrato = {
  terceroId: string
  cliente: string
  tipo: string
  modalidad: string
  facturacion: string
  moneda: string
  cargoFijo: string
  copiasLibres: number
  precioExcedente: string
  porEquipo: boolean
  alicuotaIva: number
  leyenda: string | null
  desde: string | null
  hasta: string | null
  estado: string
  observaciones: string | null
}

export function FormularioContrato({
  id,
  inicial,
  alicuotas,
}: {
  id: string | null
  inicial?: DatosContrato
  alicuotas: { valor: number; texto: string }[]
}) {
  const [estado, accion, enviando] = useActionState(guardarContratoAccion.bind(null, id), undefined)
  const [modalidad, setModalidad] = useState(inicial?.modalidad ?? 'abono')
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <ElegirCliente inicial={inicial ? { id: inicial.terceroId, razonSocial: inicial.cliente } : null} />
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className={etiqueta}>Tipo de contrato (va en la factura)</span>
        <input
          name="tipo"
          defaultValue={inicial?.tipo ?? 'Servicio de fotocopiado'}
          className={control}
          required
          list="tipos-contrato"
        />
        <datalist id="tipos-contrato">
          <option value="Servicio de fotocopiado" />
          <option value="Servicio de impresión" />
          <option value="Servicio Full Print" />
          <option value="Alquiler de equipo" />
        </datalist>
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className={etiqueta}>Modalidad</span>
        <select name="modalidad" value={modalidad} onChange={(e) => setModalidad(e.target.value)} className={control}>
          {Object.entries(MODALIDADES).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Se factura</span>
        <select name="facturacion" defaultValue={inicial?.facturacion ?? 'vencida'} className={control}>
          <option value="vencida">Mes vencido</option>
          <option value="adelantada">Abono adelantado</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Moneda de los precios</span>
        <select name="moneda" defaultValue={inicial?.moneda ?? 'DOL'} className={control}>
          <option value="DOL">Dólares (se factura en pesos al BNA)</option>
          <option value="PES">Pesos</option>
        </select>
      </label>
      {modalidad !== 'excedente' && (
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Cargo fijo mensual</span>
          <input name="cargoFijo" defaultValue={inicial?.cargoFijo ?? ''} inputMode="decimal" className={`${control} cifras`} />
        </label>
      )}
      {modalidad === 'abono' && (
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Copias libres</span>
          <input
            name="copiasLibres"
            defaultValue={inicial?.copiasLibres ?? ''}
            inputMode="numeric"
            className={`${control} cifras`}
          />
        </label>
      )}
      {modalidad !== 'cargo_fijo' && (
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Precio por copia {modalidad === 'abono' ? 'excedente' : ''}</span>
          <input
            name="precioExcedente"
            defaultValue={inicial?.precioExcedente ?? ''}
            inputMode="decimal"
            placeholder="0,0350"
            className={`${control} cifras`}
          />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>IVA</span>
        <select name="alicuotaIva" defaultValue={inicial?.alicuotaIva ?? 5} className={control}>
          {alicuotas.map((a) => (
            <option key={a.valor} value={a.valor}>
              {a.texto}
            </option>
          ))}
        </select>
      </label>
      {modalidad !== 'excedente' && (
        <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
          <input type="checkbox" name="porEquipo" defaultChecked={inicial?.porEquipo} /> Cargo fijo
          {modalidad === 'abono' ? ' y copias libres' : ''} por cada equipo
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Desde</span>
        <input type="date" name="desde" defaultValue={inicial?.desde ?? ''} className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Hasta</span>
        <input type="date" name="hasta" defaultValue={inicial?.hasta ?? ''} className={control} />
      </label>
      {id && (
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Estado</span>
          <select name="estado" defaultValue={inicial?.estado} className={control}>
            <option value="activo">Activo</option>
            <option value="suspendido">Suspendido (no se factura)</option>
            <option value="finalizado">Finalizado</option>
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
        <span className={etiqueta}>Leyenda en la factura</span>
        <input name="leyenda" defaultValue={inicial?.leyenda ?? ''} className={control} />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
        <span className={etiqueta}>Observaciones internas</span>
        <input name="observaciones" defaultValue={inicial?.observaciones ?? ''} className={control} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4">
        <Resultado estado={estado} />
        <div>
          <Boton type="submit" variante="primario" disabled={enviando}>
            {enviando ? 'Grabando…' : id ? 'Guardar cambios' : 'Crear contrato'}
          </Boton>
        </div>
      </div>
    </form>
  )
}

export function AsignarEquipo({ contratoId, libres }: { contratoId: string; libres: { id: string; texto: string }[] }) {
  const [estado, accion, enviando] = useActionState(asignarEquipoAccion.bind(null, contratoId), undefined)
  if (!libres.length) return null
  return (
    <form action={accion} className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-60 flex-1 flex-col gap-1">
        <span className={etiqueta}>Sumar un equipo del cliente que no está en contrato</span>
        <select name="equipoId" className={control}>
          {libres.map((e) => (
            <option key={e.id} value={e.id}>
              {e.texto}
            </option>
          ))}
        </select>
      </label>
      <Boton type="submit" disabled={enviando}>
        Agregar
      </Boton>
      <div className="w-full">
        <Resultado estado={estado} />
      </div>
    </form>
  )
}

// ------------------------------------------------------------------ Equipo

export type DatosEquipo = {
  serie: string
  modeloId: string | null
  terceroId: string | null
  cliente: string | null
  contratoId: string | null
  comercializacion: string
  fechaInstalacion: string | null
  garantiaHasta: string | null
  domicilio: string | null
  localidad: string | null
  sector: string | null
  contacto: string | null
  telefono: string | null
  horario: string | null
  ip: string | null
  tecnico: string | null
  contadorInicial: number
  observaciones: string | null
}

export function FormularioEquipo({
  id,
  inicial,
  modelos,
  contratos,
}: {
  id: string | null
  inicial?: Partial<DatosEquipo>
  modelos: { valor: string; texto: string }[]
  contratos: { valor: string; texto: string }[]
}) {
  const [estado, accion, enviando] = useActionState(guardarEquipoAccion.bind(null, id), undefined)
  const [contratoId, setContratoId] = useState(inicial?.contratoId ?? '')
  const texto = (nombre: keyof DatosEquipo, rotulo: string, extra = '') => (
    <label className={`flex flex-col gap-1 ${extra}`}>
      <span className={etiqueta}>{rotulo}</span>
      <input name={nombre} defaultValue={(inicial?.[nombre] as string | null) ?? ''} className={control} />
    </label>
  )
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Número de serie</span>
        <input name="serie" defaultValue={inicial?.serie} className={`${control} cifras uppercase`} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Modelo</span>
        <select name="modeloId" defaultValue={inicial?.modeloId ?? ''} className={control}>
          <option value="">Sin modelo</option>
          {modelos.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.texto}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className={etiqueta}>Contrato</span>
        <select name="contratoId" value={contratoId} onChange={(e) => setContratoId(e.target.value)} className={control}>
          <option value="">Sin contrato</option>
          {contratos.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.texto}
            </option>
          ))}
        </select>
      </label>
      {!contratoId && (
        <>
          <ElegirCliente inicial={inicial?.terceroId ? { id: inicial.terceroId, razonSocial: inicial.cliente ?? '' } : null} />
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={etiqueta}>Situación</span>
            <select name="comercializacion" defaultValue={inicial?.comercializacion ?? 'venta'} className={control}>
              {Object.entries(COMERCIALIZACIONES)
                .filter(([k]) => k !== 'contrato')
                .map(([k, t]) => (
                  <option key={k} value={k}>
                    {t}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Instalado el</span>
        <input type="date" name="fechaInstalacion" defaultValue={inicial?.fechaInstalacion ?? ''} className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Garantía hasta</span>
        <input type="date" name="garantiaHasta" defaultValue={inicial?.garantiaHasta ?? ''} className={control} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Contador al instalar</span>
        <input
          name="contadorInicial"
          defaultValue={inicial?.contadorInicial ?? 0}
          inputMode="numeric"
          className={`${control} cifras`}
        />
      </label>
      {texto('ip', 'IP')}
      {texto('domicilio', 'Domicilio de instalación', 'sm:col-span-2')}
      {texto('localidad', 'Localidad')}
      {texto('sector', 'Sector')}
      {texto('contacto', 'Contacto')}
      {texto('telefono', 'Teléfono')}
      {texto('horario', 'Horario')}
      {texto('tecnico', 'Técnico')}
      {texto('observaciones', 'Observaciones', 'sm:col-span-2 lg:col-span-4')}
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4">
        <Resultado estado={estado} />
        <div>
          <Boton type="submit" variante="primario" disabled={enviando}>
            {enviando ? 'Grabando…' : id ? 'Guardar cambios' : 'Dar de alta el equipo'}
          </Boton>
        </div>
      </div>
    </form>
  )
}

export function FormularioLectura({ equipoId, hoy }: { equipoId: string; hoy: string }) {
  const [estado, accion, enviando] = useActionState(lecturaAccion.bind(null, equipoId), undefined)
  return (
    <form action={accion} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Fecha</span>
        <input type="date" name="fecha" defaultValue={hoy} className={control} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Contador</span>
        <input name="contador" inputMode="numeric" className={`${control} cifras w-36`} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Copias de prueba</span>
        <input name="creditos" inputMode="numeric" placeholder="0" className={`${control} cifras w-28`} />
      </label>
      <Boton type="submit" disabled={enviando}>
        Cargar lectura
      </Boton>
      <div className="w-full">
        <Resultado estado={estado} />
      </div>
    </form>
  )
}

export function RetirarEquipo({ id, hoy }: { id: string; hoy: string }) {
  const [estado, accion, enviando] = useActionState(retirarEquipoAccion.bind(null, id), undefined)
  return (
    <form
      action={accion}
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        if (!window.confirm('¿Retirar el equipo? Deja de facturarse en su contrato.')) e.preventDefault()
      }}
    >
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Fecha de retiro</span>
        <input type="date" name="fecha" defaultValue={hoy} className={control} />
      </label>
      <label className="flex min-w-60 flex-1 flex-col gap-1">
        <span className={etiqueta}>Motivo</span>
        <input name="motivo" className={control} />
      </label>
      <Boton type="submit" disabled={enviando}>
        Retirar
      </Boton>
      <div className="w-full">
        <Resultado estado={estado} />
      </div>
    </form>
  )
}

// ---------------------------------------------------------------- Lecturas

export type FilaLectura = {
  id: string
  serie: string
  modelo: string | null
  cliente: string | null
  sector: string | null
  ultimaLectura: number | null
  fechaUltimaLectura: string | null
}

export function PlanillaLecturas({ equipos, hoy }: { equipos: FilaLectura[]; hoy: string }) {
  const [estado, accion, enviando] = useActionState(lecturasAccion, undefined)
  const [filtro, setFiltro] = useState('')
  const f = filtro.trim().toLowerCase()
  return (
    <form action={accion} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3 px-4 pt-4">
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Fecha de lectura</span>
          <input type="date" name="fecha" defaultValue={hoy} className={control} required />
        </label>
        <label className="flex min-w-60 flex-1 flex-col gap-1">
          <span className={etiqueta}>Filtrar</span>
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Cliente, serie o modelo"
            className={control}
          />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-y border-borde text-left text-xs text-texto-2">
            <tr>
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium">Equipo</th>
              <th className="px-4 py-2 text-right font-medium">Última lectura</th>
              <th className="px-4 py-2 font-medium">Contador</th>
              <th className="px-4 py-2 font-medium">Prueba</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {equipos.map((e) => {
              const visible = !f || [e.cliente, e.serie, e.modelo, e.sector].some((x) => x?.toLowerCase().includes(f))
              return (
                <tr key={e.id} className={visible ? '' : 'hidden'}>
                  <td className="px-4 py-1.5">
                    {e.cliente}
                    {e.sector && <span className="block text-xs text-texto-3">{e.sector}</span>}
                  </td>
                  <td className="px-4 py-1.5">
                    <span className="cifras">{e.serie}</span>
                    <span className="block text-xs text-texto-3">{e.modelo}</span>
                  </td>
                  <td className="cifras px-4 py-1.5 text-right">
                    {e.ultimaLectura?.toLocaleString('es-AR') ?? '—'}
                    <span className="block text-xs text-texto-3">{e.fechaUltimaLectura}</span>
                  </td>
                  <td className="px-4 py-1.5">
                    <input name={`contador:${e.id}`} inputMode="numeric" className={`${control} cifras w-32`} />
                  </td>
                  <td className="px-4 py-1.5">
                    <input name={`creditos:${e.id}`} inputMode="numeric" className={`${control} cifras w-20`} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        <Resultado estado={estado} />
        <div>
          <Boton type="submit" variante="primario" disabled={enviando}>
            {enviando ? 'Grabando…' : 'Guardar lecturas'}
          </Boton>
        </div>
      </div>
    </form>
  )
}

export function ImportarLecturas({ hoy }: { hoy: string }) {
  const [estado, accion, enviando] = useActionState(importarLecturasAccion, undefined)
  return (
    <form action={accion} className="flex flex-col gap-3 p-4">
      <p className="text-sm text-texto-2">
        Planilla CSV con columnas <b>Serie</b> y <b>Contador</b> (o <b>Total</b>), y opcionalmente <b>Fecha</b>: la exportación de
        contadores de MPS Monitor sirve tal cual. Cada equipo se busca por la serie.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Fecha si el archivo no la trae</span>
          <input type="date" name="fecha" defaultValue={hoy} className={control} />
        </label>
        <input type="file" name="archivo" accept=".csv,.txt" className="text-sm" required />
        <Boton type="submit" disabled={enviando}>
          {enviando ? 'Importando…' : 'Importar'}
        </Boton>
      </div>
      <Resultado estado={estado} />
    </form>
  )
}
