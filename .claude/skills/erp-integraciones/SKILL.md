---
name: erp-integraciones
description: Integraciones del ERP con el exterior — API REST v1 con claves (conApi), webhooks salientes firmados, avisos entrantes (Mercado Pago, tiendas, WhatsApp, pasarelas), conectores de tiendas online (Mercado Libre, Tienda Nube, WooCommerce, Shopify, Magento, PrestaShop), pasarelas de cobro, WhatsApp Cloud API y el agente con IA (Claude), correo saliente y la tarea programada /api/cron/servicio. Usala para crear o cambiar cualquier ruta de src/app/api, un conector, un webhook, un proceso periódico, envíos por correo o WhatsApp, o funciones que usen IA — también cuando haya que llamar a un servicio HTTP externo desde el servidor.
---

# Integraciones, API y procesos periódicos

## Reglas comunes (por qué)
- **Rutas públicas** (sin sesión: avisos, API v1, enlaces firmados) → agregalas a la exclusión del `matcher` de
  `src/proxy.ts`. Si no, el proxy redirige a `/ingresar` y el servicio externo recibe un 307.
- **Nunca confiar en lo que llega**: firma verificada con comparación en tiempo constante (`timingSafeEqual`), y aun
  con firma válida **se consulta** el estado real a la plataforma (así lo hace Mercado Pago y las pasarelas). La
  redirección del navegador después de pagar no prueba nada.
- **Idempotencia**: los avisos llegan repetidos y a la vez. Índice único sobre la referencia externa (ej.
  `eventos_suscripcion_referencia_mp` en `0055`) o `onConflictDoNothing`.
- **Responder rápido**: validar, encolar/guardar y contestar 200; el trabajo pesado con `after()` o en el cron.
- **Empresa**: los avisos identifican la empresa por una clave en la URL (`/api/cobros/aviso/[clave]`,
  `/api/whatsapp/[clave]`, `/api/tiendas/woocommerce/avisos/[canalId]`), y después todo corre en
  `conEmpresa(empresaId, …)` (sin usuario: ve todo lo de esa empresa). Nunca `db()` directo.
- **Salientes**: solo `https` y nunca hacia la red interna — `direccionPermitida(url)` / `ipReservada(ip)` en
  `integraciones/webhooks.ts` (controla IPv4, IPv6 e IPv4 mapeadas). Con tiempo máximo (`tiendas/http.ts`).
  `WEBHOOKS_PERMITIR_LOCAL` existe solo para desarrollo y pruebas.
- **Secretos** de cada empresa (tokens de tiendas, claves de pasarelas, app secret de WhatsApp) cifrados con
  `ERP_CLAVE_MAESTRA` (AES-256-GCM, como `arca/certificado.ts`); claves de API guardadas como hash. Nunca en logs,
  respuestas ni auditoría en claro.
- **Pruebas sin red**: los clientes HTTP reciben `fetch`/transporte inyectable (`type Fetch = typeof fetch`).

## API REST v1 (`src/app/api/v1/`)
Base en `_lib/api.ts`: `Authorization: Bearer erp_<empresa>_<secreto>`, JSON, paginado `offset`/`limit` (20, máx. 100),
respuesta `{ paging: { offset, limit, total }, resultados }`. La clave es de lectura o total; la empresa necesita la
función `api` en su plan (y las que pidas en `funciones`). Corre como el usuario que creó la clave (respeta grupos de clientes).

```ts
import { conApi, ErrorApi, paginado, respuesta } from '../_lib/api'

export async function GET(request: Request) {
  const p = paginado(request)
  return conApi(request, { funciones: ['servicio'] }, async (tx) => {
    const { filas, total } = await listarAlgo(tx, { offset: p.offset, limit: p.limit, q: p.params.get('q') })
    return respuesta(filas, p, total)
  })
}

export async function POST(request: Request) {
  return conApi(request, { escribe: true }, async (tx, acceso) => {
    const r = await guardarAlgo(tx, acceso.usuarioId, await request.json().catch(() => null))
    if (!r.ok) throw new ErrorApi(422, r.mensaje ?? 'Datos inválidos.')
    return Response.json({ id: r.id }, { status: 201 })
  })
}
```
La lógica sigue en `src/modulos` (misma función que usa la pantalla). Rutas dinámicas: `RouteContext<'/api/v1/x/[id]'>`.

## Webhooks salientes (`integraciones/webhooks.ts`)
`emitir(tx, evento, datos)` dentro de la transacción de la operación (encola); `entregarPendientes(empresaId)` los
manda desde el cron con firma HMAC (`firmar`) y reintentos. Eventos en `integraciones/eventos.ts` (lo comparte la
pantalla de configuración): para uno nuevo, agregalo ahí y emitilo desde el módulo.

## Tiendas online (`src/modulos/tiendas/`, docs/08)
Cada plataforma implementa la interfaz `Conector` de `tiendas/tipos.ts` (productos, pedidos, cambios de stock/precio)
y traduce su API a `ProductoCanal`/`PedidoCanal`. El motor (`sincronizar.ts`) vincula publicaciones por SKU = código
de artículo, manda stock y precios cuando cambian y convierte pedidos pagados en pedidos del ERP; `facturar.ts` los
remite, factura y cobra si la tienda tiene "facturar solo". Conexión OAuth/alta de claves con `state` firmado
(`flujo.ts`). Aplicaciones de la plataforma por variables (`ML_CLIENT_ID`, `TIENDANUBE_APP_ID`, `SHOPIFY_API_KEY`…).
Conector nuevo: archivo en `tiendas/`, valor en `TipoCanal` y `NOMBRES_CANAL`, rutas de vuelta/avisos en
`src/app/api/tiendas/<plataforma>/` (excluidas en el proxy) y prueba en `plataformas.test.ts`.

## Cobros online (`src/modulos/cobros/`, docs/13)
`pasarelas.ts` traduce cada pasarela (Mercado Pago, Payway, GoCuotas, Clover) a "armar checkout" + "consultar si se
pagó". Links del ERP en `/pago/<clave>`. Un pago se da por bueno solo tras consultar a la pasarela; `revisarPendientes`
corre en el cron.

## WhatsApp e IA (`src/modulos/whatsapp/`, `src/modulos/ia/`, docs/14)
- Cloud API de Meta (`whatsapp/api.ts`): texto, plantillas, descarga de archivos y verificación de firma de avisos.
  Respetar la **ventana de 24 h** (fuera de ella, solo plantillas aprobadas) — `whatsapp/whatsapp.ts`.
- `ia/claude.ts`: cliente mínimo por `fetch` a la API de mensajes; se apaga sin `ANTHROPIC_API_KEY` **y** `IA_MODELO`
  (`iaConfigurada()`). El modelo sale de la variable, no lo hardcodees. Para detalles de la API (tool use, límites,
  modelos) cargá la skill `claude-api`.
- El agente (`whatsapp/agente.ts`) solo tiene herramientas que **leen datos del cliente de esa conversación**
  (reconocido por su teléfono) y acciones acotadas (`servicioAgente.ts`: pedido de servicio, turnos). Nunca darle
  herramientas que crucen clientes o empresas; el texto del cliente es dato, no instrucciones.
- Lectura de facturas recibidas con IA (`compras/recibidas.ts`): siempre queda para revisión humana.

## Correo (`comunicaciones/correo.ts`)
`encolarCorreo(tx, { para, asunto, texto, entidad, entidadId, usuarioId, adjuntos })` dentro de la transacción;
`enviarPendientes(empresaId)` fuera (cron o `after()` en la acción). Sin `SMTP_URL` quedan en la bandeja de salida.
Correos de la plataforma (no de una empresa): `enviarDePlataforma`.

## Tarea programada (`src/app/api/cron/servicio/route.ts`)
`POST` con `Authorization: Bearer $CRON_SECRET` (comparación en tiempo constante; sin la variable no hace nada),
cada 15-60 min. Recorre empresas activas y, por empresa, en `try/catch` propio: si una falla, `registrarError` y sigue
con la próxima. Contadores en `resultado` y `latido('cron', …)` al final (monitoreo).
Paso nuevo: función idempotente en el módulo, llamada dentro del loop con `conEmpresa(e.id, …)`, contador nuevo, y si
es diario, condicionado a la hora argentina (`horaArgentina() >= N`) y a una marca de "último envío" para no repetir.

## Checklist
- [ ] Ruta pública excluida en `src/proxy.ts`
- [ ] Firma verificada en tiempo constante + consulta del estado real; idempotente ante repetidos
- [ ] Datos de empresa solo vía `conEmpresa`/`conApi`; lógica en `src/modulos`
- [ ] URLs salientes con `direccionPermitida`, https y timeout; secretos cifrados y fuera de logs
- [ ] Correos/webhooks encolados en la transacción y enviados fuera
- [ ] Pruebas con fetch/transporte falso; doc del área (08, 13, 14) actualizado
