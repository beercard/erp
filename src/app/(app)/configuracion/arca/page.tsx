import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Boton, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { arcaConfiguracion, percepcionesIibb, provincias } from '@/db/schema'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { formatearCuit } from '@/lib/cuit'
import { diasHasta } from '@/modulos/arca/certificado'

import { cambiarAmbienteAccion } from '../../facturacion/acciones'
import { FormularioCertificado, FormularioPercepcion, ProbarConexion } from './FormulariosArca'

export const metadata: Metadata = { title: 'ARCA' }

export default async function ConfiguracionArca() {
  const sesion = await exigirPermiso('empresa.datos')
  const datos = await enLaEmpresa('empresa.datos', async (tx) => {
    const [config] = await tx
      .select({
        ambiente: arcaConfiguracion.ambiente,
        vence: arcaConfiguracion.certificadoVence,
        tiene: arcaConfiguracion.certificado,
      })
      .from(arcaConfiguracion)
    const [percepcion] = await tx.select().from(percepcionesIibb).limit(1)
    const provs = await tx.select().from(provincias).orderBy(provincias.nombre)
    const diasParaVencer = config?.vence ? diasHasta(config.vence) : null
    return { config, percepcion, provs, diasParaVencer }
  })
  const { config, percepcion, diasParaVencer } = datos
  const cuit = sesion.empresa.cuit
  const csr = `openssl req -new -key erp.key -subj "/C=AR/O=${sesion.empresa.razonSocial}/CN=erp/serialNumber=CUIT ${cuit}" -out erp.csr`

  return (
    <>
      <Link href="/configuracion" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Configuración
      </Link>
      <EncabezadoPagina
        titulo="ARCA y factura electrónica"
        bajada={`CUIT ${formatearCuit(cuit)} · ${sesion.empresa.razonSocial}`}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <Panel className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Certificado</h2>
              {config?.tiene ? (
                <Chip tono={config.ambiente === 'produccion' ? 'ok' : 'info'}>
                  {config.ambiente === 'produccion' ? 'Producción: facturas reales' : 'Homologación: facturas de prueba'}
                </Chip>
              ) : (
                <Chip tono="aviso">Sin certificado</Chip>
              )}
            </div>
            {config?.vence && (
              <p className={`text-sm ${diasParaVencer !== null && diasParaVencer < 30 ? 'text-error' : 'text-texto-2'}`}>
                Vence el {config.vence.toLocaleDateString('es-AR')}
                {diasParaVencer !== null && diasParaVencer < 30 && ` (faltan ${diasParaVencer} días: pedí uno nuevo)`}.
              </p>
            )}
            <FormularioCertificado ambiente={config?.ambiente ?? 'homologacion'} />
            {config?.tiene && (
              <div className="flex flex-wrap items-start gap-3 border-t border-borde pt-4">
                <ProbarConexion />
                <form action={cambiarAmbienteAccion.bind(null, config.ambiente === 'produccion' ? 'homologacion' : 'produccion')}>
                  <Boton type="submit" variante="fantasma">
                    Pasar a {config.ambiente === 'produccion' ? 'homologación' : 'producción'}
                  </Boton>
                </form>
              </div>
            )}
          </Panel>
          <FormularioPercepcion
            provincias={datos.provs.map((p) => ({ valor: p.codigo, texto: p.nombre }))}
            inicial={{
              nombre: percepcion?.nombre ?? 'Percepción IIBB',
              provincia: percepcion?.provincia ?? '',
              alicuota: percepcion ? String(Number(percepcion.alicuota)).replace('.', ',') : '',
              minimoBase: percepcion ? String(Number(percepcion.minimoBase)).replace('.', ',') : '0',
              soloLetraA: percepcion?.soloLetraA ?? true,
              activa: percepcion?.activa ?? false,
            }}
          />
        </div>
        <Panel className="h-fit p-4 text-sm">
          <h2 className="font-semibold">Cómo sacar el certificado de prueba</h2>
          <ol className="mt-3 flex list-decimal flex-col gap-3 pl-5 text-texto-2">
            <li>
              En una PC con OpenSSL, generá la clave privada.{' '}
              <strong className="text-texto">No la mandes por mail ni chat.</strong>
              <code className="cifras mt-1 block rounded bg-superficie-2 p-2 text-xs break-all text-texto">
                openssl genrsa -out erp.key 2048
              </code>
            </li>
            <li>
              Generá el pedido de certificado:
              <code className="cifras mt-1 block rounded bg-superficie-2 p-2 text-xs break-all text-texto">{csr}</code>
            </li>
            <li>
              Entrá a ARCA con la clave fiscal de la empresa y abrí{' '}
              <strong className="text-texto">WSASS – Autogestión Certificados Homologación</strong> (si no aparece, adherilo desde
              el Administrador de Relaciones).
            </li>
            <li>
              “Nuevo certificado”: nombre <span className="cifras">erp</span>, pegá el contenido de erp.csr y descargá el .crt.
            </li>
            <li>
              En WSASS, “Crear autorización a servicio”: el certificado <span className="cifras">erp</span> con el servicio{' '}
              <span className="cifras">wsfe</span>.
            </li>
            <li>Subí acá el .crt y el .key, y probá la conexión.</li>
          </ol>
          <p className="mt-4 text-xs text-texto-3">
            Para producción el certificado se pide en “Administración de Certificados Digitales” y se autoriza el servicio wsfe
            desde el Administrador de Relaciones. Conviene un punto de venta nuevo, exclusivo para este sistema.
          </p>
        </Panel>
      </div>
    </>
  )
}
