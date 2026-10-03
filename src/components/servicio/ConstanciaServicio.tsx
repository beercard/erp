import { BotonImprimir } from '@/app/imprimir/[tipo]/[id]/BotonImprimir'
import { VistaRespuestas } from '@/components/servicio/VistaRespuestas'
import { formatearCuit } from '@/lib/cuit'
import { fechaCorta } from '@/lib/fechas'
import type { datosEmpresa } from '@/modulos/empresa/datos'
import type { obtenerOrden } from '@/modulos/servicio/servicio'
import { CIERRES, ESTADOS_ORDEN, TIPOS_ORDEN } from '@/modulos/servicio/tipos'

const hora = (d: Date | null) =>
  d ? d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) : '—'

/**
 * Constancia de la orden de servicio (como el PDF de Persat): lo pedido, lo
 * hecho, fotos y firma del cliente. La usan la oficina y el portal del cliente.
 */
export function ConstanciaServicio({
  empresa,
  o,
  archivos = '/servicio/archivo',
}: {
  empresa: NonNullable<Awaited<ReturnType<typeof datosEmpresa>>>
  o: NonNullable<Awaited<ReturnType<typeof obtenerOrden>>>
  archivos?: string
}) {
  const equipos = o.equipo ? { [o.equipo.id]: `${o.equipo.serie}${o.equipo.modelo ? ` · ${o.equipo.modelo}` : ''}` } : {}
  return (
    <div className="hoja min-h-full">
      <div className="no-imprimir sticky top-0 flex items-center justify-between gap-3 border-b border-borde bg-superficie-2 px-6 py-3">
        <span className="text-sm text-texto-2">Orden de servicio {o.numero} · A4 (o guardar como PDF)</span>
        <BotonImprimir />
      </div>
      <article className="mx-auto flex max-w-[190mm] flex-col gap-4 px-6 py-8 text-[12px] print:max-w-none print:p-0">
        <header className="flex justify-between gap-4 border-b-2 border-texto pb-4">
          <div>
            <p className="text-lg font-bold">{empresa.nombreFantasia || empresa.razonSocial}</p>
            <p>{[empresa.domicilioFiscal, empresa.localidad].filter(Boolean).join(', ')}</p>
            <p className="cifras">CUIT {formatearCuit(empresa.cuit)}</p>
          </div>
          <div className="text-right">
            <p className="text-base font-bold">Orden de servicio N° {o.numero}</p>
            <p>Pedido: {fechaCorta(o.fecha)}</p>
            <p>{o.tipoOrden?.nombre ?? TIPOS_ORDEN[o.tipo as keyof typeof TIPOS_ORDEN]}</p>
            <p>Estado: {ESTADOS_ORDEN[o.estado as keyof typeof ESTADOS_ORDEN]}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-x-6 gap-y-1">
          <p>
            <b>Cliente:</b> {o.cliente.razonSocial}
          </p>
          <p>
            <b>Equipo:</b> {o.equipo ? `${o.equipo.serie}${o.equipo.modelo ? ` · ${o.equipo.modelo}` : ''}` : '—'}
          </p>
          <p>
            <b>Domicilio:</b> {o.domicilio ?? '—'}
          </p>
          <p>
            <b>Contacto:</b> {[o.contacto, o.telefono].filter(Boolean).join(' · ') || '—'}
          </p>
          <p>
            <b>Técnico:</b> {o.tecnico?.nombre ?? '—'}
          </p>
          <p>
            <b>Llegada / informe:</b> {hora(o.llegada)} / {hora(o.informada)}
          </p>
        </section>

        <section>
          <h2 className="mb-1 border-b border-texto font-bold">Pedido</h2>
          <p className="whitespace-pre-line">{o.falla}</p>
          {o.plantilla && (
            <div className="mt-2">
              <VistaRespuestas
                campos={o.plantilla.instrucciones.filter((c) => c.tipo !== 'equipo')}
                valores={o.instrucciones}
                equipos={equipos}
                archivos={archivos}
                vacio=""
              />
            </div>
          )}
        </section>

        {(o.solucion || o.resultados) && (
          <section>
            <h2 className="mb-1 border-b border-texto font-bold">
              Trabajo realizado
              {o.cierreTecnico && ` · ${CIERRES[o.cierreTecnico as keyof typeof CIERRES]}`}
            </h2>
            {o.solucion && <p className="mb-2 whitespace-pre-line">{o.solucion}</p>}
            {o.plantilla && (
              <VistaRespuestas
                campos={o.plantilla.devolucion}
                valores={o.resultados}
                equipos={equipos}
                vacio=""
                archivos={archivos}
              />
            )}
          </section>
        )}

        {o.items.length > 0 && (
          <section>
            <h2 className="mb-1 border-b border-texto font-bold">Repuestos, insumos y mano de obra</h2>
            <table className="w-full">
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.id} className="border-b border-borde">
                    <td className="cifras w-16 py-0.5">{Number(i.cantidad).toLocaleString('es-AR')}</td>
                    <td className="py-0.5">
                      {i.codigo && <span className="cifras mr-1">{i.codigo}</span>}
                      {i.descripcion}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {o.notaCierre && (
          <section>
            <h2 className="mb-1 border-b border-texto font-bold">Observaciones</h2>
            <p className="whitespace-pre-line">{o.notaCierre}</p>
          </section>
        )}
      </article>
    </div>
  )
}
