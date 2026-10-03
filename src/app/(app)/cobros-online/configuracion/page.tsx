import type { Metadata } from 'next'

import { EnlaceAyuda } from '@/components/ayuda/EnlaceAyuda'
import { BotonConfirmar } from '@/components/BotonConfirmar'
import { Chip, EncabezadoPagina, Panel } from '@/components/ui'
import { cuentasTesoreria } from '@/db/schema'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { listarPasarelas } from '@/modulos/cobros/cobros'
import { PROVEEDORES, type Proveedor } from '@/modulos/cobros/pasarelas'
import { MEDIOS } from '@/modulos/facturacion/medios'

import { Copiar } from '../../crm/configuracion/Extras'
import { quitarPasarelaAccion } from '../acciones'
import { FormPasarela } from '../Piezas'

export const metadata: Metadata = { title: 'Medios de pago online' }

const AYUDA: Record<Proveedor, string> = {
  mercadopago:
    'Con tu cuenta de Mercado Pago. Tu cliente paga con tarjeta, dinero en cuenta o cuotas. Opcional: en Tus integraciones → Webhooks, copiá la "clave secreta" para que el sistema verifique cada aviso.',
  payway:
    'Con tu comercio de Payway (ex Decidir): el sistema arma un link de pago con tarjeta. Payway no siempre avisa al instante: el pago se confirma al volver tu cliente y, si no, en la revisión periódica.',
  gocuotas:
    'Cuotas sin interés con tarjeta de débito. GoCuotas confirma el pago con un aviso a una dirección secreta de cada link.',
  clover:
    'Con tu cuenta de Clover (checkout online). En el panel de Clover configurá el webhook con la dirección de abajo y copiá el "signing secret".',
}

export default async function MediosDePago() {
  await exigirPermiso('ventas.pasarelas')
  const [pasarelas, cuentas] = await enLaEmpresa(
    'ventas.pasarelas',
    async (tx) =>
      [
        await listarPasarelas(tx),
        await tx.select({ id: cuentasTesoreria.id, nombre: cuentasTesoreria.nombre }).from(cuentasTesoreria),
      ] as const,
  )
  const medios = Object.entries(MEDIOS)
    .filter(([v]) => !v.startsWith('retencion') && !['cheque', 'echeq'].includes(v))
    .map(([valor, texto]) => ({ valor, texto }))
  return (
    <>
      <EncabezadoPagina
        acciones={<EnlaceAyuda guia="mercado-pago" />}
        titulo="Medios de pago online"
        bajada="Conectá las pasarelas con que tus clientes pueden pagar los links. Las claves se guardan cifradas."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        {(Object.keys(PROVEEDORES) as Proveedor[]).map((prov) => {
          const def = PROVEEDORES[prov]
          const p = pasarelas.find((x) => x.proveedor === prov)
          return (
            <Panel key={prov} className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{def.nombre}</h2>
                {p ? (
                  <Chip tono={p.activa ? 'ok' : 'neutro'}>
                    {p.activa ? (p.prueba ? 'Conectada (prueba)' : 'Conectada') : 'Pausada'}
                  </Chip>
                ) : (
                  <Chip>Sin conectar</Chip>
                )}
              </div>
              <p className="text-sm text-texto-2">{AYUDA[prov]}</p>
              <FormPasarela
                proveedor={prov}
                campos={def.campos}
                conectada={Boolean(p)}
                valores={
                  p
                    ? { visibles: p.visibles, activa: p.activa, prueba: p.prueba, medio: p.medio, cuentaId: p.cuentaId }
                    : { visibles: {}, activa: true, prueba: false, medio: def.medio, cuentaId: null }
                }
                medios={medios}
                cuentas={cuentas}
              />
              {p && prov === 'clover' && (
                <div className="flex flex-col gap-1.5 rounded-lg bg-superficie-2 p-3 text-xs">
                  <span className="font-medium">Dirección del webhook para Clover</span>
                  <code className="truncate font-mono">{p.aviso}</code>
                  <span>
                    <Copiar texto={p.aviso} etiqueta="Copiar dirección" />
                  </span>
                </div>
              )}
              {p && (
                <form action={quitarPasarelaAccion.bind(null, p.id)} className="self-end">
                  <BotonConfirmar variante="fantasma" pregunta={`¿Desconectar ${def.nombre}? Se borran sus claves.`}>
                    Desconectar
                  </BotonConfirmar>
                </form>
              )}
            </Panel>
          )
        })}
      </div>
    </>
  )
}
