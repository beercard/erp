import type { Metadata } from 'next'

import { EnlaceAyuda } from '@/components/ayuda/EnlaceAyuda'
import { BotonConfirmar } from '@/components/BotonConfirmar'
import { Aviso, Boton, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa, exigirPermiso } from '@/lib/auth/servidor'
import { asegurarEtapas, listarMotivos, responsables } from '@/modulos/crm/crm'
import { formularioDeEmpresa, listarPlantillas, obtenerAjustes } from '@/modulos/crm/extras'

import { formularioAccion } from '../acciones'
import { EditorEtapas, EditorMotivos } from './Editores'
import { Copiar, EditorPlantillas, FormAjustes } from './Extras'

export const metadata: Metadata = { title: 'Configuración del CRM' }

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export default async function ConfiguracionCrm({ searchParams }: PageProps<'/crm/configuracion'>) {
  const sesion = await exigirPermiso('crm.configurar')
  const { error } = await searchParams
  const [etapas, motivos, plantillas, ajustes, personas] = await enLaEmpresa(
    'crm.configurar',
    async (tx) =>
      [
        await asegurarEtapas(tx),
        await listarMotivos(tx, false),
        await listarPlantillas(tx, undefined, false),
        await obtenerAjustes(tx),
        await responsables(tx, sesion.empresa.id),
      ] as const,
  )
  const formulario = await formularioDeEmpresa(sesion.empresa.id)
  const app = (process.env.APP_URL ?? '').replace(/\/+$/, '')
  const destino = formulario ? `${app}/api/crm/formulario/${formulario.token}` : ''
  const codigo = `<form method="post" action="${escapar(destino)}">
  <input name="nombre" placeholder="Nombre y apellido" required>
  <input name="empresa" placeholder="Empresa">
  <input name="email" type="email" placeholder="Email">
  <input name="telefono" placeholder="Teléfono">
  <input name="interes" placeholder="¿Qué te interesa?">
  <textarea name="mensaje" placeholder="Mensaje"></textarea>
  <!-- Trampa para robots: dejalo oculto y vacío -->
  <input name="web" style="display:none" tabindex="-1" autocomplete="off">
  <!-- Opcional: la página de tu sitio a la que vuelve después de mandar -->
  <!-- <input type="hidden" name="volver" value="https://tusitio.com.ar/gracias"> -->
  <button type="submit">Enviar</button>
</form>`

  return (
    <>
      <EncabezadoPagina
        acciones={<EnlaceAyuda guia="formulario-web" />}
        titulo="Configuración del CRM"
        bajada="Etapas, motivos de pérdida, plantillas de mensajes, reparto de consultas y formulario para tu sitio."
      />
      {typeof error === 'string' && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <h2 className="border-b border-borde px-5 py-3 font-semibold">Etapas del embudo</h2>
            <p className="px-5 pt-4 text-sm text-texto-2">
              Al entrar a una etapa, la oportunidad toma su probabilidad. Con <b>días de alerta</b>, se marca como estancada si
              pasa ese tiempo sin moverse. La etapa <b>ganada</b> cierra la venta.
            </p>
            <EditorEtapas
              etapas={etapas.map((e) => ({
                id: e.id,
                nombre: e.nombre,
                probabilidad: e.probabilidad,
                ganada: e.ganada,
                diasAlerta: e.diasAlerta,
              }))}
            />
          </Panel>
          <Panel>
            <h2 className="border-b border-borde px-5 py-3 font-semibold">Plantillas de WhatsApp y email</h2>
            <p className="px-5 pt-4 text-sm text-texto-2">
              Se eligen desde la ficha al escribir. Las variables entre llaves se completan con los datos de la oportunidad.
            </p>
            <EditorPlantillas
              plantillas={plantillas.map((p) => ({
                id: p.id,
                nombre: p.nombre,
                canal: p.canal,
                asunto: p.asunto,
                texto: p.texto,
              }))}
            />
          </Panel>
          <Panel>
            <h2 className="border-b border-borde px-5 py-3 font-semibold">Formulario para tu sitio web</h2>
            <div className="flex flex-col gap-4 p-5">
              <p className="text-sm text-texto-2">
                Cada consulta que llega por el formulario de tu sitio crea una oportunidad en la primera etapa, con la etiqueta
                “web”, y agenda responderla en el día.
              </p>
              {formulario?.activo ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-superficie-2 px-3 py-2 font-mono text-xs">
                      {destino}
                    </code>
                    <Copiar texto={destino} etiqueta="Copiar dirección" />
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-acento">
                      Ver el código para pegar en tu sitio
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-barra p-3 font-mono text-xs text-sobre-barra">
                      {codigo}
                    </pre>
                    <div className="mt-2">
                      <Copiar texto={codigo} etiqueta="Copiar código" />
                    </div>
                    <p className="mt-2 text-xs text-texto-3">
                      También acepta JSON (para formularios hechos a medida). Hace falta un email o un teléfono. Hasta 10
                      consultas por hora desde una misma conexión.
                    </p>
                  </details>
                  <div className="flex flex-wrap gap-2">
                    <form action={formularioAccion.bind(null, 'regenerar')}>
                      <BotonConfirmar pregunta="La dirección actual deja de funcionar y vas a tener que cambiarla en tu sitio. ¿Seguir?">
                        Cambiar la dirección
                      </BotonConfirmar>
                    </form>
                    <form action={formularioAccion.bind(null, 'desactivar')}>
                      <Boton type="submit" variante="fantasma">
                        Apagar el formulario
                      </Boton>
                    </form>
                  </div>
                </>
              ) : (
                <form action={formularioAccion.bind(null, 'activar')}>
                  <Boton type="submit" variante="primario">
                    {formulario ? 'Volver a prender el formulario' : 'Crear el formulario'}
                  </Boton>
                </form>
              )}
            </div>
          </Panel>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Panel className="h-fit">
            <h2 className="border-b border-borde px-5 py-3 font-semibold">Reparto y avisos</h2>
            <FormAjustes
              ajustes={{ asignacion: ajustes.asignacion, vendedores: ajustes.vendedores, resumenDiario: ajustes.resumenDiario }}
              personas={personas}
            />
          </Panel>
          <Panel className="h-fit">
            <h2 className="border-b border-borde px-5 py-3 font-semibold">Motivos de pérdida</h2>
            <EditorMotivos motivos={motivos.map((m) => ({ id: m.id, nombre: m.nombre, activo: m.activo }))} />
          </Panel>
        </div>
      </div>
    </>
  )
}
