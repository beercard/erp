# Tiendas online

Aplicación opcional del plan ("Tiendas online y Mercado Libre", se contrata sobre el plan Inicial o superior). Conecta **Mercado Libre**, **Tienda Nube**, **WooCommerce**, **Shopify**, **Magento** y **PrestaShop** con el ERP:

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
| Shopify       | Escribe su tienda (algo.myshopify.com) y aprueba los permisos en Shopify.            |
| Magento       | Crea una integración en su panel y pega la dirección y el Access Token.              |
| PrestaShop    | Activa el servicio web, crea una clave y pega la dirección y la clave.               |

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

### Shopify

1. En el Dev Dashboard de Shopify crear la aplicación de Vektra (distribución personalizada o pública). Desde el 1/1/2026 los comercios ya no pueden crear "apps personalizadas" en su panel, por eso la conexión es con OAuth.
2. **URL de redirección:** `APP_URL/api/tiendas/shopify/vuelta`. Permisos: `read_products, write_products, read_inventory, write_inventory, read_locations, read_orders`.
3. **Webhooks obligatorios de privacidad** (customers/data_request, customers/redact, shop/redact): `APP_URL/api/tiendas/shopify/avisos`. Los de pedidos (pagado y cancelado) y la desinstalación los registra el ERP al conectar.
4. Para ver nombre, email y teléfono del comprador, una app pública necesita la aprobación de "datos protegidos de clientes" de Shopify.
5. Variables del servidor: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` y, opcional, `SHOPIFY_API_VERSION` (por defecto `2026-10`; Shopify sostiene cada versión un año).
6. El stock se publica en la primera ubicación de la tienda (se elige la primera vez y se recuerda).

### Magento y PrestaShop

No hay que registrar nada en la plataforma.

- **Magento 2 / Adobe Commerce:** el comercio crea una integración (Sistema → Integraciones) con acceso a Catálogo, Inventario y Ventas. En 2.4.4 o más nuevo tiene que activar "Allow OAuth Access Tokens to be used as standalone Bearer tokens" (Tiendas → Configuración → Servicios → OAuth). Cada producto simple es una publicación (la clave es el SKU). Stock y precio se cambian en el alcance global.
- **PrestaShop 1.7 o más nuevo:** el comercio activa el servicio web y crea una clave con permiso sobre products, combinations, stock_availables, orders, order_states, customers, addresses y currencies. El ERP **manda solo el stock**: PrestaShop guarda los precios sin impuestos y según la regla de impuestos de cada producto.
- Ninguna de las dos tiene avisos: los pedidos se traen cada 15 minutos (y con "Sincronizar ahora"). Al conectar se prueba la clave antes de guardarla y la dirección no puede apuntar a la red interna del servidor.

Sin las variables de Mercado Libre, Tienda Nube o Shopify, sus botones dicen que la conexión todavía no está habilitada; WooCommerce funciona igual.

## Seguridad

- Tokens y claves se guardan **cifrados** con `ERP_CLAVE_MAESTRA`. Al desconectar se borran.
- El "state" de cada conexión va firmado, vence a los 15 minutos y tiene que volver a la misma sesión (Mercado Libre y Tienda Nube).
- Avisos: los de Tienda Nube, WooCommerce y Shopify se verifican por firma (Shopify: HMAC de la vuelta del OAuth y de cada aviso); los de Mercado Libre no vienen firmados, así que solo se usan para saber qué pedido ir a buscar con el token del vendedor.
- La dirección de WooCommerce no puede apuntar a la red interna del servidor (se controla al conectar y antes de cada sincronización).
- Una cuenta de una plataforma se conecta a una sola empresa.

## Dónde está

- Lógica: `src/modulos/tiendas/` (un conector por plataforma; el motor en `sincronizar.ts`).
- Pantallas: `/tiendas` y `/tiendas/[id]`.
- Rutas de conexión y avisos: `src/app/api/tiendas/`.
- Tablas: `canales_venta`, `publicaciones_canal`, `pedidos_canal` y `cuentas_canal` (de plataforma).

Probado con pruebas que simulan cada API (`tiendas.test.ts` y `plataformas.test.ts`) y con una tienda WooCommerce simulada de punta a punta (conexión, avisos firmados y pedido). Falta probarlo con cuentas reales de Mercado Libre, Tienda Nube, Shopify, Magento y PrestaShop, cuando estén registradas las aplicaciones.
