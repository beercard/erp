import { ChevronLeft } from 'lucide-react'
import { EnlaceAyuda } from '@/components/ayuda/EnlaceAyuda'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Boton, Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { arcaConfiguracion, percepcionesIibb, provincias } from '@/db/schema'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { formatearCuit } from '@/lib/cuit'
import { diasHasta } from '@/modulos/arca/certificado'

import { cambiarAmbienteAccion } from '../../facturacion/acciones'
import {
  FormularioCertificado,
  FormularioPercepcion,
  FormularioRegimen,
  PedidoCertificado,
  ProbarConexion,
} from './FormulariosArca'

export const metadata: Metadata = { title: 'ARCA' }

export default async function ConfiguracionArca() {
  const sesion = await exigirPermiso('empresa.datos')
  const datos = await enLaEmpresa('empresa.datos', async (tx) => {
    const [config] = await tx
      .select({
        ambiente: arcaConfiguracion.ambiente,
        vence: arcaConfiguracion.certificadoVence,
        tiene: arcaConfiguracion.certificado,
        regimen: arcaConfiguracion.regimenClaseA,
        csr: arcaConfiguracion.pedidoCsr,
        pendiente: arcaConfiguracion.clavePendienteCifrada,
        cbu: arcaConfiguracion.cbuInformada,
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
  const paso = 'grid size-5 shrink-0 place-items-center rounded-full bg-acento text-[11px] font-semibold text-sobre-acento'

  return (
    <>
      <Link href="/configuracion" className="mb-2 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-acento">
        <ChevronLeft aria-hidden className="size-3.5" /> Configuración
      </Link>
      <EncabezadoPagina
        acciones={<EnlaceAyuda guia="arca" />}
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
          <FormularioRegimen regimen={config?.regimen ?? 'comun'} cbu={config?.cbu ?? ''} />
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
          <h2 className="font-semibold">Cómo sacar el certificado</h2>
          <p className="mt-1 text-xs text-texto-3">
            Sin instalar nada: la clave privada la genera y la guarda cifrada el sistema.
          </p>
          <ol className="mt-4 flex flex-col gap-4 text-texto-2">
            <li className="flex gap-2.5">
              <span aria-hidden className={paso}>
                1
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span>
                  <strong className="text-texto">Generá el pedido</strong> y copialo o descargalo.
                </span>
                <PedidoCertificado csr={config?.csr ?? null} pendiente={Boolean(config?.pendiente)} />
              </div>
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden className={paso}>
                2
              </span>
              <div className="min-w-0 flex-1">
                <strong className="text-texto">Subilo en ARCA</strong> con la clave fiscal de la empresa:
                <ul className="mt-1.5 list-disc space-y-1.5 pl-4">
                  <li>
                    <span className="text-texto">Prueba:</span> “WSASS – Autogestión Certificados Homologación” → “Nuevo
                    certificado”: nombre <span className="cifras">erp</span>, pegá el pedido y descargá el .crt. Después “Crear
                    autorización a servicio”: <span className="cifras">erp</span> con <span className="cifras">wsfe</span>.
                  </li>
                  <li>
                    <span className="text-texto">Producción:</span> “Administración de Certificados Digitales” → “Agregar alias”:{' '}
                    <span className="cifras">erp</span>, subí el pedido y descargá el .crt. Después, en el “Administrador de
                    Relaciones” → “Nueva relación” → Facturación Electrónica (<span className="cifras">wsfe</span>) para el alias{' '}
                    <span className="cifras">erp</span>.
                  </li>
                </ul>
                <p className="mt-1.5 text-xs text-texto-3">
                  Si alguno no aparece, adherilo desde el Administrador de Relaciones.
                </p>
              </div>
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden className={paso}>
                3
              </span>
              <div className="min-w-0 flex-1">
                <strong className="text-texto">Subí acá el .crt</strong> (en “Certificado”, sin clave), elegí el ambiente y probá
                la conexión.
              </div>
            </li>
          </ol>
          <details className="mt-5 border-t border-borde pt-3 text-xs">
            <summary className="cursor-pointer text-texto-2">Avanzado: usar tu propia clave con OpenSSL</summary>
            <code className="cifras mt-2 block rounded bg-superficie-2 p-2 break-all text-texto">
              openssl genrsa -out erp.key 2048
            </code>
            <code className="cifras mt-1 block rounded bg-superficie-2 p-2 break-all text-texto">{csr}</code>
            <p className="mt-1 text-texto-3">En ese caso subí el .crt junto con el .key (“Tengo mi propia clave”).</p>
          </details>
        </Panel>
      </div>
    </>
  )
}
