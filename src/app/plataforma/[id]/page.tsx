import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { pesos } from '@/components/planes/TarjetasPlanes'
import { EncabezadoPagina, Panel } from '@/components/ui'
import { formatearCuit } from '@/lib/cuit'
import { fechaCorta, hoyArgentina } from '@/lib/fechas'
import { MESES_COBRADOS_EN_ANUAL, precioDeLista, situacion } from '@/lib/planes'
import { historial, listarSuscripciones, suscripcionDe, usoDe } from '@/modulos/plataforma/suscripciones'

import { exigirAdmin } from '../admin'
import { FormularioPago, FormularioSuscripcionAdmin } from './FormulariosAdmin'

export const metadata: Metadata = { title: 'Empresa · Plataforma' }

export default async function EmpresaPlataforma({ params }: PageProps<'/plataforma/[id]'>) {
  await exigirAdmin()
  const { id } = await params
  const empresa = (await listarSuscripciones()).find((e) => e.empresaId === id)
  if (!empresa) notFound()
  const hoy = hoyArgentina()
  const [s, uso, eventos] = await Promise.all([suscripcionDe(id), usoDe(id, hoy), historial(id)])
  const sit = situacion(s, hoy)
  const mensual = s.precioAcordado ? Number(s.precioAcordado) : precioDeLista(s)
  const periodo = s.ciclo === 'anual' ? mensual * MESES_COBRADOS_EN_ANUAL : mensual

  return (
    <main className="contenido mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 sm:px-8 sm:py-8">
      <Link href="/plataforma" className="flex items-center gap-1.5 text-sm text-texto-2 hover:text-texto">
        <ArrowLeft aria-hidden className="size-4" /> Todas las empresas
      </Link>
      <EncabezadoPagina
        titulo={empresa.razonSocial}
        bajada={`CUIT ${formatearCuit(empresa.cuit)} · alta ${fechaCorta(empresa.alta.toISOString())} · ${uso.usuarios} usuarios, ${uso.comprobantesMes} comprobantes este mes, ${uso.puntosVenta} puntos de venta`}
      />
      {sit.aviso && <p className="text-sm text-texto-2">{sit.aviso.texto}</p>}
      <Panel className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Suscripción</h2>
        <FormularioSuscripcionAdmin
          // Se vuelve a armar con lo guardado (el formulario se reinicia al enviarse).
          key={JSON.stringify(s)}
          empresaId={id}
          inicial={{
            plan: s.plan,
            estado: s.estado,
            ciclo: s.ciclo,
            aplicaciones: s.aplicaciones,
            usuariosAdicionales: s.usuariosAdicionales,
            pruebaHasta: s.pruebaHasta,
            pagadoHasta: s.pagadoHasta,
            precioAcordado: s.precioAcordado,
            observaciones: s.observaciones,
          }}
        />
      </Panel>
      <Panel className="p-4">
        <h2 className="mb-1 text-sm font-semibold">Registrar un pago</h2>
        <p className="mb-3 text-xs text-texto-2">
          Corre la fecha de pago un {s.ciclo === 'anual' ? 'año' : 'mes'} desde el vencimiento (o desde hoy si ya venció) y deja
          la suscripción activa. Período: {pesos(periodo)} + IVA = {pesos(periodo * 1.21)}.
        </p>
        <FormularioPago empresaId={id} sugerido={(periodo * 1.21).toFixed(2).replace('.', ',')} />
      </Panel>
      <Panel className="overflow-x-auto">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Historial</h2>
        <table className="w-full min-w-[560px] text-sm">
          <tbody className="divide-y divide-borde">
            {eventos.map((e) => (
              <tr key={e.id}>
                <td className="cifras px-4 py-2 text-texto-2">{fechaCorta(e.creado.toISOString())}</td>
                <td className="px-4 py-2">
                  {e.tipo}
                  {e.estado && ` · ${e.estado}`}
                </td>
                <td className="max-w-md truncate px-4 py-2 font-mono text-xs text-texto-3">{JSON.stringify(e.detalle)}</td>
                <td className="px-4 py-2 text-xs text-texto-3">{e.usuario}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </main>
  )
}
