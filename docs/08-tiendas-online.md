# Tiendas online

Aplicación opcional del plan ("Tiendas online y Mercado Libre", se contrata sobre el plan Inicial o superior). Conecta **Mercado Libre**, **Tienda Nube** y **WooCommerce** con el ERP:

- **Pedidos:** los pagados entran solos como pedidos del ERP (al instante por aviso de la plataforma y, de respaldo, cada 15 minutos). Se remiten y se facturan como cualquier pedido. Si lo cancelan en la tienda antes de entregarlo, se cancela.
- **Stock:** cuando cambia en el ERP, se manda a la tienda (de un depósito o la suma de todos).
- **Precios:** opcional, de una lista de precios en pesos; la tienda recibe el precio final con IVA.
- **Vínculo:** cada publicación (o variante) se vincula a un artículo. Si el SKU de la tienda es el código o el código de barras del artículo, se vincula solo; si no, se escribe el código en la pantalla del canal.
- **Clientes:** se buscan por documento o email; si no existen se dan de alta (consumidor final). Si la tienda no da datos del comprador, el pedido va a un cliente genérico del canal.

## Cómo conecta cada empresa

| Plataforma    | Qué hace el usuario                                                                  |
| ------------- | ------------------------------------------------------------------------------------ |
| Mercado Libre | Toca "Conectar Mercado Libre", entra con su cuenta de vendedor y autoriza.           |
| Tienda Nube   | Toca "Conectar Tienda Nube" e instala la aplicación en su tienda.                    |
| WooCommerce   | Escribe la dirección de la tienda y aprueba el acceso en WordPress. No copia claves. |

## Qué configura la plataforma (una sola vez)

### Mercado Libre

1. En developers.mercadolibre.com.ar crear la aplicación de Vektra.
2. **URI de redirect:** `APP_URL/api/tiendas/mercadolibre/vuelta`.
3. **Notificaciones:** URL `APP_URL/api/tiendas/mercadolibre/avisos`, tema `orders_v2`.
4. Permisos de lectura y escritura (publicaciones y ventas). PKCE activado.
5. Variables del servidor: `ML_CLIENT_ID` y `ML_CLIENT_SECRET`.

### Tienda Nube

1. En el portal de socios crear la aplicación (permisos: productos lectura y escritura, órdenes lectura).
2. **URL de redirección:** `APP_URL/api/tiendas/tiendanube/vuelta`.
3. **Webhooks obligatorios de privacidad** (store/redact, customers/redact, customers/data_request): `APP_URL/api/tiendas/tiendanube/avisos`. Los avisos de pedidos (pagado y cancelado) los registra el ERP al conectar cada tienda.
4. Variables del servidor: `TIENDANUBE_APP_ID` y `TIENDANUBE_CLIENT_SECRET` (con el secreto se verifica la firma de cada aviso).
5. `SOPORTE_EMAIL`: va en el User-Agent que pide Tienda Nube.

### WooCommerce

No hay que registrar nada. La tienda tiene que estar en **https**, con los enlaces permanentes activados y WooCommerce 5.8 o más nuevo. Al aprobar, WooCommerce manda las claves a `APP_URL/api/tiendas/woocommerce/claves` (el pedido va firmado y vence a los 15 minutos) y el ERP registra dos avisos (pedido creado y modificado), firmados con un secreto propio de cada tienda.

Sin las variables de Mercado Libre o Tienda Nube, sus botones dicen que la conexión todavía no está habilitada; WooCommerce funciona igual.

## Seguridad

- Tokens y claves se guardan **cifrados** con `ERP_CLAVE_MAESTRA`. Al desconectar se borran.
- El "state" de cada conexión va firmado, vence a los 15 minutos y tiene que volver a la misma sesión (Mercado Libre y Tienda Nube).
- Avisos: los de Tienda Nube y WooCommerce se verifican por firma; los de Mercado Libre no vienen firmados, así que solo se usan para saber qué pedido ir a buscar con el token del vendedor.
- La dirección de WooCommerce no puede apuntar a la red interna del servidor (se controla al conectar y antes de cada sincronización).
- Una cuenta de una plataforma se conecta a una sola empresa.

## Dónde está

- Lógica: `src/modulos/tiendas/` (un conector por plataforma; el motor en `sincronizar.ts`).
- Pantallas: `/tiendas` y `/tiendas/[id]`.
- Rutas de conexión y avisos: `src/app/api/tiendas/`.
- Tablas: `canales_venta`, `publicaciones_canal`, `pedidos_canal` y `cuentas_canal` (de plataforma).

Probado con pruebas que simulan cada API y con una tienda WooCommerce simulada de punta a punta (conexión, avisos firmados y pedido). Falta probarlo con cuentas reales de Mercado Libre y Tienda Nube, cuando estén registradas las aplicaciones.
