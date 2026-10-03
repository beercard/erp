# Sitio comercial y SEO

El sitio comercial de Vektra ERP vive en la misma aplicación que el sistema:

- Sin sesión, `/` muestra la portada comercial (`src/app/(sitio)/sitio`); con sesión, el inicio del sistema.
- Páginas: `/funciones`, `/integraciones`, `/precios`, `/soluciones/[rubro]` (siete rubros, entre ellos mayoristas y distribución, y profesionales y servicios), `/contacto`, `/legal/terminos`, `/legal/privacidad`, `/legal/arrepentimiento`, más `/registro` e `/ingresar`.
- La marca (nombre del producto, razón social, CUIT) está en un solo archivo: `src/lib/marca.ts`.
- Las consultas del formulario quedan en la consola de la plataforma (`/plataforma/pedidos`, "Consultas del sitio") y, con `CONTACTO_EMAIL` y SMTP configurados, llegan por email. Tienen una trampa para robots y un tope de 5 por hora por conexión.

Variables: `SITIO_URL` (la dirección pública del sitio; si falta, se usa `APP_URL`), `CONTACTO_EMAIL` y `CONTACTO_WHATSAPP` (opcionales: si no están, el sitio no muestra esos datos).

## Portada

Referencia de estilo: las portadas de software argentino actuales (cobrando.app). Se toma el lenguaje visual, nunca textos, marca ni cifras de otros.

- **Tipografía Geist** solo en el sitio (el sistema sigue con Inter): títulos enormes y apretados, y la palabra clave en **mono itálica** del color de acento (`Destacado` en `Bloques.tsx`).
- **Rótulos en mono entre corchetes:** `[ 01 · LO ESENCIAL ]` (`Rotulo`).
- **Botones píldora** (`Pildora`): tinta llena o contorno; en paneles de color, blanco o translúcido.
- **Encabezado** con botón de tema claro/oscuro (comparte la elección con el sistema, `src/lib/tema.ts`).

Secciones (`src/app/(sitio)/sitio/page.tsx`):

1. Portada centrada y **vitrina** del producto en un gran panel de la marca: carrusel con Panel, Facturar y Tiendas online (`Vitrina.tsx`, pantallas en `Maqueta.tsx`).
2. Banda oscura con cifras **del producto** (no de clientes) y cinta de integraciones.
3. `01` Lo esencial: mosaico con mini pantallas (`Portada.tsx`).
4. `02` Acompañamiento: lista numerada y chat de soporte de ejemplo.
5. `03` En vivo: tablero interactivo Hoy / 7 días / 30 días con datos de ejemplo, rotulados como tales (`Interactivos.tsx`).
6. `04` Calculadora de horas recuperadas, con los supuestos a la vista.
7. `05` Rubros, `06` planes con selector mensual/anual (los precios salen de `src/lib/planes.ts`), `07` comparativa con alternativas genéricas (planillas, sistemas sueltos; sin nombrar competidores ni precios ajenos), `08` preguntas.
8. Cierre en panel de la marca y botón flotante de WhatsApp si está `CONTACTO_WHATSAPP`.

Sin testimonios ni cantidades de clientes hasta tener casos reales autorizados. Las animaciones (carrusel, cinta) se apagan si el sistema pide reducir movimiento.

## SEO técnico (hecho)

| Qué                                                                                                                                     | Dónde                                              |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Solo se indexa el sitio comercial y el registro; el sistema, portales, API e impresiones no (`noindex` por defecto en el layout raíz)   | `src/app/layout.tsx`, `src/app/(sitio)/layout.tsx` |
| `robots.txt` con las rutas privadas bloqueadas y el sitemap                                                                             | `src/app/robots.ts`                                |
| `sitemap.xml` con prioridades y frecuencias                                                                                             | `src/app/sitemap.ts`                               |
| URL canónica en cada página; `/sitio` redirige a `/` (308)                                                                              | metadatos de cada página y `src/proxy.ts`          |
| Título y descripción propios por página, pensados para una búsqueda                                                                     | metadatos de cada página                           |
| Open Graph y tarjeta de X con imagen generada (1200×630)                                                                                | `src/app/opengraph-image.tsx`                      |
| Datos estructurados: Organization (con CUIT), SoftwareApplication con las ofertas de cada plan, FAQPage, BreadcrumbList                 | `JsonLd` en el layout y en cada página             |
| HTML semántico: un `h1` por página, secciones con títulos, enlace "Saltar al contenido", `lang="es-AR"`                                 | componentes del sitio                              |
| Rápido: páginas estáticas o casi, fuentes con `display: swap`, sin imágenes pesadas (la vista del sistema es HTML), menú sin JavaScript |                                                    |
| Celular primero, sin desbordes horizontales, tema claro y oscuro                                                                        |                                                    |
| Ícono de la marca                                                                                                                       | `src/app/icon.svg`                                 |

## SEO en página (palabras clave por página)

| Página                                   | Búsqueda principal                      | Secundarias                                            |
| ---------------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| `/`                                      | sistema de gestión para pymes           | ERP en la nube Argentina, facturación electrónica ARCA |
| `/precios`                               | precio sistema de gestión pyme          | facturación electrónica gratis                         |
| `/funciones`                             | software de facturación y stock         | libro IVA digital, SICORE, conciliación bancaria       |
| `/integraciones`                         | facturación Mercado Libre               | integración Tienda Nube, WooCommerce facturación ARCA  |
| `/soluciones/comercios-y-distribuidoras` | sistema de gestión para comercios       | software para distribuidoras                           |
| `/soluciones/servicio-tecnico`           | software para servicio técnico          | órdenes de trabajo, app para técnicos                  |
| `/soluciones/tiendas-online`             | ERP para Mercado Libre                  | sincronizar stock Mercado Libre Tienda Nube            |
| `/soluciones/alquiler-de-equipos`        | sistema para alquiler de fotocopiadoras | facturación por copias, lecturas de contadores         |
| `/soluciones/estudios-contables`         | sistema para estudios contables         | libro IVA digital para clientes                        |

Regla para textos nuevos: la búsqueda en el `h1` y en el título, la respuesta en el primer párrafo, y preguntas frecuentes reales (alimentan el FAQPage).

## SEO fuera de la página (plan; no se hace en el código)

Ordenado por impacto y esfuerzo.

1. **Google Search Console y Bing Webmaster Tools:** verificar el dominio, enviar `/sitemap.xml` y revisar cada semana la cobertura y las búsquedas.
2. **Perfil de Empresa de Google** de Vektra Digital Solutions (categoría "Empresa de software"), con el enlace al sitio.
3. **Tiendas de aplicaciones de las plataformas** (enlace de calidad y canal de ventas a la vez):
   - Tienda de aplicaciones de Tienda Nube: publicar la aplicación del ERP.
   - Mercado Libre: certificarse como integrador (Mercado Libre Developers).
   - WooCommerce: un plugin liviano en el directorio de WordPress que lleve a conectar la tienda.
4. **Directorios de software** con fichas completas y reseñas de clientes reales: Capterra, GetApp, Software Advice, G2, Comparasoftware, Appvizer.
5. **Contadores y cámaras:** programa para estudios contables con un sello "Contador asociado" que enlace al sitio; presencia en cámaras de comercio y de pymes y en consejos profesionales (charlas, notas).
6. **Contenido que gana enlaces:** guías largas y actualizadas, por ejemplo:
   - "Cómo facturar ventas de Mercado Libre con factura electrónica"
   - "Libro IVA Digital paso a paso"
   - "Retención de Ganancias a proveedores: cómo se calcula"
   - "Calendario de vencimientos ARCA del mes"
   - "Plantilla de lecturas de contadores para alquiler de fotocopiadoras"

   Conviene sumar una sección `/guias` con esos artículos cuando haya quien los escriba y los mantenga al día.

7. **Reseñas y casos:** pedir reseñas a los primeros clientes (Google y directorios) y publicar casos con autorización del cliente. Nunca reseñas ni testimonios inventados.
8. **Redes:** LinkedIn de la empresa y videos cortos (YouTube) de "cómo se hace" que enlacen a cada solución.
9. **Medición:** si se suma una herramienta de analítica, actualizar la política de privacidad y, si usa cookies que no son necesarias, pedir consentimiento.

## Suscripciones

- Prueba de 30 días sin tarjeta desde `/registro`; después, el plan se elige en Configuración › Suscripción.
- Cobro con **débito automático de Mercado Pago** (suscripción sin plan asociado): la empresa lo autoriza una vez; cada cobro aprobado llega por notificación firmada, se registra el pago y, si había un cambio de plan esperando el pago, se aplica. Código: `src/modulos/plataforma/mercadopago.ts`.
- Configuración en la cuenta de Mercado Pago de Vektra: credenciales de producción (`MP_ACCESS_TOKEN`) y, en Webhooks, la URL `APP_URL/api/pagos/mercadopago` con los eventos de suscripciones (planes y suscripciones; pagos recurrentes), y su clave secreta (`MP_WEBHOOK_SECRET`).
- La ficha de cada empresa en la consola de la plataforma sigue permitiendo registrar pagos a mano (transferencias).

Pendiente de revisión legal antes de publicar: los términos y condiciones y la política de privacidad son una base redactada sobre la Ley 25.326, la Ley 24.240 y la Resolución 424/2020; conviene que los revise un abogado.

## Precios en tres niveles

`/precios` muestra los tres planes pagos (Inicial, Pyme destacado, Empresa) en columnas y el plan Gratis aparte, debajo, igual que la portada. La pantalla de suscripción dentro del sistema sigue mostrando los cuatro.
