import type { Metadata } from 'next'
import Link from 'next/link'

import { JsonLd } from '@/components/sitio/JsonLd'
import { ComparativaPlanes, pesos, TarjetasPlanes } from '@/components/planes/TarjetasPlanes'
import {
  APLICACIONES,
  DIAS_DE_PRUEBA,
  FUNCIONES,
  MESES_COBRADOS_EN_ANUAL,
  PLANES,
  PRECIO_USUARIO_ADICIONAL,
  planPorId,
} from '@/lib/planes'

export const metadata: Metadata = {
  title: 'Planes y precios del sistema de gestión',
  description:
    'Planes de Vektra ERP para pymes argentinas: gratis para facturar con ARCA y la gestión completa con stock, compras, bancos e impuestos. Probalo 30 días sin tarjeta.',
  alternates: { canonical: '/precios' },
}

const PREGUNTAS = [
  {
    p: '¿Necesito tarjeta para la prueba?',
    r: `No. Tenés ${DIAS_DE_PRUEBA} días con todo lo del plan Pyme. Al terminar elegís un plan; si no elegís ninguno, los datos quedan para consultar y no se pierde nada.`,
  },
  {
    p: '¿Puedo cambiar de plan cuando quiera?',
    r: 'Sí. Subir de plan se aplica apenas se acredita el pago; bajar, al vencer el período pagado. No hay permanencia mínima.',
  },
  {
    p: '¿Cómo se paga?',
    r: 'Por mes o por año, con débito automático de Mercado Pago (tarjeta o dinero en cuenta) o por transferencia. Te facturamos con factura A o B. Los precios se actualizan cada trimestre y se avisan con 30 días.',
  },
  {
    p: '¿Qué pasa si se vence el pago?',
    r: 'Tenés 10 días para regularizarlo trabajando normalmente. Después el sistema queda en modo consulta hasta que se pague: nunca se borra nada.',
  },
  {
    p: 'Soy contador, ¿puedo administrar a mis clientes?',
    r: 'Sí: un mismo usuario entra a todas las empresas que lo invitan. Además hay un programa para estudios contables con beneficios por cada cliente que suman.',
  },
  {
    p: '¿Me ayudan a pasar los datos de mi sistema actual?',
    r: 'Sí. Importamos clientes, proveedores, artículos, precios y saldos; desde PYMEXIS también el historial de contratos. En el plan Empresa la migración asistida está incluida.',
  },
]

export default async function Precios({ searchParams }: PageProps<'/precios'>) {
  const { ciclo: c } = (await searchParams) as { ciclo?: string }
  const ciclo = c === 'anual' ? 'anual' : 'mensual'
  const gratis = PLANES.find((p) => p.precioMensual === 0)
  const ahorro = Math.round((1 - MESES_COBRADOS_EN_ANUAL / 12) * 100)
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd
        datos={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: PREGUNTAS.map((q) => ({
            '@type': 'Question',
            name: q.p,
            acceptedAnswer: { '@type': 'Answer', text: q.r },
          })),
        }}
      />

      <section className="flex flex-col items-center gap-4 text-center">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Toda la gestión de tu pyme en un solo sistema, en la nube
        </h1>
        <p className="max-w-2xl text-texto-2">
          Facturación electrónica con ARCA, stock, compras, pagos con retenciones, bancos y cheques. Empezás gratis y sumás lo que
          necesitás a medida que crecés.
        </p>
        <div className="flex rounded-full border border-borde bg-superficie p-1 text-sm" role="group" aria-label="Forma de pago">
          <Link
            href="/precios"
            aria-current={ciclo === 'mensual' ? 'true' : undefined}
            className={`rounded-full px-4 py-1.5 ${ciclo === 'mensual' ? 'bg-acento text-sobre-acento' : 'text-texto-2'}`}
          >
            Mensual
          </Link>
          <Link
            href="/precios?ciclo=anual"
            aria-current={ciclo === 'anual' ? 'true' : undefined}
            className={`rounded-full px-4 py-1.5 ${ciclo === 'anual' ? 'bg-acento text-sobre-acento' : 'text-texto-2'}`}
          >
            Anual · {ahorro} % menos
          </Link>
        </div>
      </section>

      {/* Tres niveles pagos, con el del medio destacado; el gratis, aparte. */}
      <TarjetasPlanes
        ciclo={ciclo}
        planes={PLANES.filter((p) => p.precioMensual > 0)}
        pie={(p) => (
          <Link
            href="/registro"
            className={`block rounded-md px-3 py-2 text-center text-sm font-medium ${
              p.destacado ? 'bg-acento text-sobre-acento hover:opacity-90' : 'border border-borde hover:bg-superficie-2'
            }`}
          >
            {p.precioMensual ? `Probar ${DIAS_DE_PRUEBA} días gratis` : 'Empezar gratis'}
          </Link>
        )}
      />
      {gratis && (
        <section className="flex flex-col items-start justify-between gap-3 tarjeta p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold">¿Solo necesitás facturar? Plan {gratis.nombre}</h2>
            <p className="text-sm text-texto-2">
              {gratis.lema} {gratis.limites.comprobantesMes} comprobantes con CAE por mes, {gratis.limites.usuarios} usuario, sin
              vencimiento.
            </p>
          </div>
          <Link
            href="/registro"
            className="shrink-0 rounded-md border border-borde px-4 py-2 text-sm font-medium hover:bg-superficie-2"
          >
            Empezar gratis
          </Link>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Aplicaciones</h2>
        <p className="max-w-3xl text-sm text-texto-2">
          Módulos para rubros puntuales que se suman a cualquier plan pago. Se activan y se dan de baja desde la misma
          suscripción.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {APLICACIONES.map((a) => (
            <div key={a.id} className="flex flex-col gap-2 tarjeta p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{FUNCIONES[a.id].nombre}</h3>
                {!a.disponible && <span className="rounded-full bg-superficie-2 px-2 py-0.5 text-xs text-texto-2">Pronto</span>}
              </div>
              <p className="text-sm text-texto-2">{FUNCIONES[a.id].detalle}</p>
              <p className="cifras text-sm">
                {pesos(a.precioMensual)} /mes + IVA · desde el plan {planPorId(a.desde).nombre}
              </p>
            </div>
          ))}
        </div>
        <p className="text-sm text-texto-2">
          Usuario adicional: <span className="cifras">{pesos(PRECIO_USUARIO_ADICIONAL)}</span> /mes + IVA.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Comparar planes</h2>
        <ComparativaPlanes />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Preguntas frecuentes</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {PREGUNTAS.map((q) => (
            <details key={q.p} className="tarjeta p-4">
              <summary className="cursor-pointer font-medium">{q.p}</summary>
              <p className="mt-2 text-sm text-texto-2">{q.r}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="terminos" className="flex flex-col gap-2 border-t border-borde pt-6 text-xs text-texto-3">
        <h2 className="text-sm font-semibold text-texto-2">Términos del servicio (resumen)</h2>
        <p>
          Precios en pesos argentinos, por mes y sin IVA. Los datos son de la empresa: se pueden exportar en cualquier momento y
          se conservan al menos 12 meses después de dar de baja la suscripción. El servicio se presta con copias de seguridad
          diarias. Leé los{' '}
          <Link href="/legal/terminos" className="underline">
            términos y condiciones
          </Link>{' '}
          y la{' '}
          <Link href="/legal/privacidad" className="underline">
            política de privacidad
          </Link>
          .
        </p>
      </section>
    </div>
  )
}
