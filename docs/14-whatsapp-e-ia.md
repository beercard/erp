# WhatsApp Business e IA

Cada empresa conecta **su** número de WhatsApp Business con la API oficial de Meta (Cloud API). Sobre eso funcionan tres cosas:

1. **Transacciones por WhatsApp:** bandeja de conversaciones, envío de facturas con link de pago y aviso de pagos acreditados.
2. **Registro de facturas de proveedores:** la gente autorizada de la empresa manda la foto o el PDF y se lee con IA.
3. **Agente de atención al cliente:** contesta con IA lo que puede resolver con datos del cliente y deriva lo demás.

Se usa solo la API oficial. Las conexiones "por QR" (WhatsApp Web no oficial: Baileys, Evolution API) violan los términos de WhatsApp y pueden terminar en el bloqueo del número, así que no se ofrecen.

## Conexión (WhatsApp → Configuración)

- La empresa carga el **Phone number ID**, el **token permanente** de un usuario del sistema y el **App secret** de su app de Meta. Se prueban contra Meta antes de guardarlos y quedan cifrados con `ERP_CLAVE_MAESTRA`.
- El ERP le da una **dirección de webhook propia** (`/api/whatsapp/<clave>`) y un **token de verificación** para pegar en Meta (campo "messages").
- Un mismo número no puede estar en dos empresas.
- **Ventana de 24 horas:** dentro de las 24 horas del último mensaje del contacto se escribe libre; fuera, solo con una **plantilla aprobada** (con un parámetro de texto en el cuerpo) que se configura acá.
- **BAJA / ALTA:** si el contacto escribe BAJA, no se le mandan más plantillas (sí se le contesta si escribe él). ALTA lo revierte.

## Bandeja (`/whatsapp`)

- Conversaciones abiertas y cerradas, búsqueda, no leídos, estado de cada mensaje enviado (enviado, entregado, leído, falló).
- El contacto se reconoce como **cliente** por el teléfono (normalizado: 011 15…, +54 9…, todos iguales).
- "Lo atiendo yo" calla al agente en esa conversación; "Devolver al agente" lo reactiva. Se refresca sola cada 15 segundos.
- Desde una **factura autorizada**, el botón WhatsApp manda el enlace firmado a la factura (`/comprobante/<token>`, vale 180 días) y, si tiene saldo y hay medios de pago, un link de pago.
- Cuando se acredita un **pago online**, el cliente recibe el aviso por WhatsApp.

## Facturas de proveedores (Compras → Facturas recibidas)

- Las personas **autorizadas** (celular + usuario, en Configuración) mandan la foto o el PDF al número de la empresa. También se pueden subir desde la computadora.
- Se controla el tipo real del archivo (JPEG, PNG, WebP o PDF; hasta 10–15 MB), se lee con IA (respuesta estructurada) y se contesta por WhatsApp con lo leído y el enlace para revisarla.
- **Controles:** CUIT con dígito verificador, que esté hecha al CUIT de la empresa, fecha (no futura, aviso si tiene más de cuatro meses), que los importes cierren, alícuotas válidas.
- **Nunca se registran solas:** una persona compara con el original, corrige y toca "Registrar la compra". Si el proveedor no existe se da de alta; las percepciones quedan con su provincia.
- Sin IA configurada quedan guardadas para completarlas a mano.

## Agente de atención

Se activa en Configuración, con indicaciones propias de la empresa (horarios, tono, qué no prometer).

- **Con un cliente reconocido por el teléfono** puede consultar su cuenta y facturas impagas, crear un link de pago (todo o una factura), mandar el enlace de una factura, ver sus pedidos y sus servicios técnicos (con el enlace de seguimiento).
- **Con un número desconocido** no tiene ninguna herramienta de cuenta: aunque alguien diga ser un cliente, no se dan datos.
- Las herramientas **no reciben ids**: siempre trabajan sobre el cliente de esa conversación. Si la IA pide una herramienta que no se le ofreció, no se ejecuta.
- **Deriva a una persona** ante reclamos, precios o lo que no puede resolver. También si falla la IA o pasa los 30 mensajes por hora.
- Los mensajes del cliente se tratan como datos: el prompt le indica no seguir instrucciones que cambien sus reglas.
- No contesta a la gente autorizada de la empresa (esas conversaciones son para facturas).

## Variables del servidor

- `ANTHROPIC_API_KEY` e `IA_MODELO` (el identificador del modelo de Claude): sin las dos, la lectura de facturas y el agente quedan apagados.
- `WHATSAPP_API_VERSION` (opcional, por defecto `v26.0`).

## Seguridad

- Cada aviso de Meta se verifica con la firma `X-Hub-Signature-256` (HMAC del cuerpo crudo con el App secret de esa empresa, comparación de tiempo constante). Sin firma válida, 401.
- Los mensajes no se duplican (Meta reintenta): el id de WhatsApp es único por empresa.
- Los archivos se bajan solo de servidores de Meta (el token no viaja a otro lado) y se controla su tipo por los bytes.
- RLS por empresa en todas las tablas; las conversaciones siguen la visibilidad por grupos de clientes. `whatsapp_numeros` es de plataforma (clave → empresa).
- Permisos: `whatsapp.atender` (Administración y Ventas) y `whatsapp.configurar` (Administración). Las facturas recibidas usan `compras.ver` y `compras.cargar`.

## Ideas tomadas de otros proyectos

Se revisaron `dolibarr-whatsapp-module` (GPL-3.0: solo ideas, sin copiar código) e `InvoiceFlow / facturas-opensource` (MIT). De ahí salieron la baja voluntaria, el aviso de pago acreditado, los controles extra al leer facturas y la decisión de no usar conexiones por QR. Ambos tenían webhooks sin firma, y uno, consultas armadas con datos del aviso: acá se evitó.

**Para más adelante:**

- Cola de envíos con reintentos.
- Gestión y sincronización de plantillas con Meta.
- Recordatorios de deuda programados.
- PDF de la factura como adjunto.
- Medición del costo de la IA por empresa.

## Código

- `src/modulos/whatsapp/`: `api.ts` (Graph), `whatsapp.ts` (cuenta, avisos, envío, bandeja), `atender.ts` (qué hacer con cada mensaje), `agente.ts`.
- `src/modulos/compras/recibidas.ts`: lectura y registro de facturas recibidas. `src/modulos/ia/claude.ts`: cliente de la API de Claude.
- Pantallas: `src/app/(app)/whatsapp/`, `src/app/(app)/compras/recibidas/`.
- Webhook: `src/app/api/whatsapp/[clave]/`. Factura pública: `src/app/comprobante/[token]/`.
