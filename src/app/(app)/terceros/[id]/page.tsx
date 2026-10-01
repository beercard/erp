import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Aviso, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { comoPlataforma } from '@/db/empresa'
import { auditoria, condicionesIva, usuarios } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { formatearCuit } from '@/lib/cuit'
import { obtenerTercero } from '@/modulos/maestros/terceros'

import { FormularioTercero } from '../FormularioTercero'
import { opcionesFormulario } from '../opciones'

export const metadata: Metadata = { title: 'Cliente o proveedor' }

const UUID = /^[0-9a-f-]{36}$/i
const ACCIONES: Record<string, string> = { alta: 'Alta', modificacion: 'Modificación', baja: 'Baja' }

export default async function FichaTercero({ params, searchParams }: PageProps<'/terceros/[id]'>) {
  const { id } = await params
  const { guardado } = await searchParams
  if (!UUID.test(id)) notFound()
  const sesion = await requerirEmpresa()
  const puedeEditar = tienePermiso(sesion.permisos, 'maestros.terceros')

  const datos = await enLaEmpresa('maestros.ver', async (tx) => {
    const tercero = await obtenerTercero(tx, id)
    if (!tercero) return null
    const [iva] = await tx.select().from(condicionesIva).where(eq(condicionesIva.codigo, tercero.condicionIva))
    const historial = await tx
      .select({ fecha: auditoria.fecha, accion: auditoria.accion, usuarioId: auditoria.usuarioId })
      .from(auditoria)
      .where(and(eq(auditoria.entidad, 'tercero'), eq(auditoria.entidadId, id)))
      .orderBy(desc(auditoria.fecha))
      .limit(10)
    return { tercero, iva, historial, opciones: await opcionesFormulario(tx) }
  })
  if (!datos) notFound()

  // Nombres de quienes hicieron cada cambio (tabla de plataforma).
  const ids = [...new Set(datos.historial.map((h) => h.usuarioId).filter(Boolean))] as string[]
  const nombres = new Map<string, string>()
  if (ids.length) {
    const filas = await comoPlataforma((tx) =>
      tx.select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios).where(inArray(usuarios.id, ids)),
    )
    filas.forEach((f) => nombres.set(f.id, f.nombre))
  }

  const t = datos.tercero
  const documento =
    t.numeroDocumento && (t.tipoDocumento === 80 || t.tipoDocumento === 86) ? formatearCuit(t.numeroDocumento) : t.numeroDocumento

  return (
    <>
      <EncabezadoPagina
        titulo={t.razonSocial}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            <span className="cifras">{t.codigo}</span>
            {documento && <span className="cifras">· {documento}</span>}
            <span>· {datos.iva?.nombre}</span>
            {t.esCliente && <Chip tono="info">Cliente</Chip>}
            {t.esProveedor && <Chip tono="aviso">Proveedor</Chip>}
            {!t.activo && <Chip tono="error">Inactivo</Chip>}
          </span>
        }
      />
      {guardado && (
        <div className="mb-4">
          <Aviso tono="ok">Cambios grabados.</Aviso>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <FormularioTercero
          soloLectura={!puedeEditar}
          id={t.id}
          opciones={datos.opciones}
          inicial={Object.fromEntries(
            Object.entries(t).map(([k, val]) => [k, val instanceof Date ? val.toISOString() : (val as string | boolean | null)]),
          )}
        />
        <aside className="flex flex-col gap-4">
          <Panel className="p-4">
            <h2 className="text-sm font-semibold">Cuenta corriente</h2>
            <p className="mt-1 text-xs text-texto-2">
              El saldo, la deuda vencida y los últimos comprobantes aparecen acá desde la etapa de facturación.
            </p>
          </Panel>
          <Panel>
            <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Historial</h2>
            <ol className="divide-y divide-borde">
              {datos.historial.map((h, i) => (
                <li key={i} className="px-4 py-2.5 text-xs">
                  <span className="font-medium text-texto">{ACCIONES[h.accion] ?? h.accion}</span>
                  <span className="block text-texto-3">
                    {h.fecha.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                    {h.usuarioId && nombres.get(h.usuarioId) ? ` · ${nombres.get(h.usuarioId)}` : ''}
                  </span>
                </li>
              ))}
              {datos.historial.length === 0 && <li className="px-4 py-3 text-xs text-texto-3">Sin cambios registrados.</li>}
            </ol>
          </Panel>
        </aside>
      </div>
    </>
  )
}
