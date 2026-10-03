import type { Metadata } from 'next'
import { EnlaceAyuda } from '@/components/ayuda/EnlaceAyuda'
import Link from 'next/link'

import { Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { conEmpresa } from '@/db/empresa'
import { exigirPermiso } from '@/lib/auth/servidor'
import { hoyArgentina } from '@/lib/fechas'
import { calendario, configuracion, generarVencimientos, obligacionesDeLaEmpresa } from '@/modulos/impuestos/vencimientos'

import { ConfiguracionImpuestos, FechaEditable, MarcarCumplida, Obligaciones } from './Formularios'

export const metadata: Metadata = { title: 'Vencimientos' }

const ESTADO = {
  cumplido: { texto: 'Presentado', tono: 'ok' },
  vencido: { texto: 'Vencido', tono: 'error' },
  proximo: { texto: 'Vence pronto', tono: 'aviso' },
  pendiente: { texto: 'Pendiente', tono: 'neutro' },
} as const

const RUTA: Record<string, string> = { iva_digital: '/impuestos/iva', sicore: '/impuestos/retenciones', iibb: '/impuestos/iibb' }

/** Calendario de vencimientos impositivos, avisos por email y el contador. */
export default async function Vencimientos() {
  const sesion = await exigirPermiso('impuestos.libros')
  const hoy = hoyArgentina()
  const d = await conEmpresa(sesion, async (tx) => {
    await generarVencimientos(tx, sesion.empresa.id, hoy)
    const cfg = await configuracion(tx)
    const desde = new Date(`${hoy}T12:00:00Z`)
    desde.setUTCDate(desde.getUTCDate() - 45)
    const hasta = new Date(`${hoy}T12:00:00Z`)
    hasta.setUTCDate(hasta.getUTCDate() + 60)
    return {
      cfg,
      obligaciones: await obligacionesDeLaEmpresa(tx, sesion.empresa.id),
      lista: await calendario(tx, desde.toISOString().slice(0, 10), hasta.toISOString().slice(0, 10), hoy, cfg.avisarDias),
    }
  })
  return (
    <>
      <EncabezadoPagina
        acciones={<EnlaceAyuda guia="contador" />}
        titulo="Vencimientos"
        bajada="Calendario de presentaciones, avisos por email y el contador. IVA y SICORE se dan por presentados solos al marcarlos con el número de transacción."
      />
      <Panel className="mb-4 overflow-x-auto">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-semibold">Próximos y recientes</h2>
        <table className="w-full min-w-[640px] text-sm">
          <tbody className="divide-y divide-borde">
            {d.lista.map((v) => (
              <tr key={v.id} className={v.estado === 'cumplido' ? 'text-texto-2' : ''}>
                <td className="px-4 py-2 whitespace-nowrap">
                  <FechaEditable id={v.id} fecha={v.fecha} />
                  {v.ajustada && <span className="ml-1 text-xs text-texto-3">(corregida)</span>}
                </td>
                <td className="px-4 py-2">
                  {RUTA[v.impuesto] ? (
                    <Link href={`${RUTA[v.impuesto]}?periodo=${v.periodo}`} className="hover:underline">
                      {v.nombre}
                    </Link>
                  ) : (
                    v.nombre
                  )}
                  <span className="text-xs text-texto-3"> · período {v.periodo.split('-').reverse().join('/')}</span>
                </td>
                <td className="px-4 py-2">
                  <Chip tono={ESTADO[v.estado].tono}>{ESTADO[v.estado].texto}</Chip>
                </td>
                <td className="px-4 py-2 text-right">
                  {!v.automatica && <MarcarCumplida id={v.id} cumplida={v.cumplidaAMano} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-borde px-4 py-2 text-xs text-texto-3">
          Las fechas salen del día de cada obligación (las de arranque son aproximadas según la terminación del CUIT). Hacé clic
          en una fecha para corregirla con el calendario oficial de ARCA o del fisco provincial.
        </p>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Contador y avisos</h2>
          <ConfiguracionImpuestos inicial={d.cfg} />
        </Panel>
        <Panel className="p-4">
          <h2 className="mb-1 text-sm font-semibold">Obligaciones</h2>
          <p className="mb-2 text-xs text-texto-2">
            Día del mes siguiente al período en que vence (si cae en fin de semana, pasa al lunes).
          </p>
          <Obligaciones lista={d.obligaciones} />
        </Panel>
      </div>
    </>
  )
}
