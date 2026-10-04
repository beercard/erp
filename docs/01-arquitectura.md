# Arquitectura

ERP en la nube para pymes argentinas, vendido como servicio (SaaS). El primer cliente es KOMSA S.A., que hoy usa PYMEXIS. El relevamiento de PYMEXIS que dio origen a este proyecto está en el repositorio de KOMSA (`docs/erp/relevamiento/`). Este repositorio es el producto y no contiene nada propio de ningún cliente.

## Decisiones

### 1. Stack

- **Next.js 16** (App Router, Server Components y Server Actions) con **TypeScript** estricto.
- **Postgres**, con **Drizzle ORM** y migraciones SQL versionadas en `drizzle/`.
  - Cada migración se revisa antes de aplicarse.
  - El esquema nunca se sincroniza solo contra producción.
- **Tailwind CSS 4** con tokens propios (ver [03-diseno.md](03-diseno.md)).
- **PGlite** en desarrollo y en pruebas: un Postgres real embebido, sin instalar nada. En producción se usa un Postgres gestionado con copias automáticas y recuperación a un momento dado.
- **Vitest** para pruebas. Todo cálculo fiscal o de dinero tiene que tener prueba.

### 2. Multiempresa

- Una sola base, compartida por todas las empresas. Cada tabla de negocio tiene `empresa_id`.
- **Row Level Security forzado** en cada una de esas tablas. La aplicación se conecta con el rol `erp_app`, que no es dueño de las tablas.
  - Cada operación corre dentro de una transacción que fija `app.empresa_id`. Postgres solo devuelve y acepta filas de esa empresa, aunque el código se olvide de filtrar.
- `empresa_id` toma su valor por defecto de `app.empresa_id`, así que un alta no puede quedar en otra empresa.
- Una prueba recorre todas las tablas con `empresa_id` y falla si alguna no tiene RLS forzado y su política.
- Las pantallas fijan además `app.usuario_id`. Un usuario con grupos de clientes asignados solo ve los clientes de esos grupos, con sus órdenes de servicio, contratos, equipos y formularios: lo controlan políticas restrictivas en Postgres (`drizzle/0048_grupos_clientes_seguridad.sql` y `0055_endurecimiento.sql`, que suma presupuestos, pedidos, remitos, contactos y lo que cuelga de órdenes, equipos y contratos). Los comprobantes y recibos no se filtran por grupo. La API usa el usuario que creó la clave; los procesos automáticos y el portal no fijan usuario y ven todo.

### 3. Usuarios y permisos

- Los **usuarios son globales**: una persona puede trabajar en varias empresas, como un contador con varios clientes.
- La **membresía** une usuario, empresa y rol.
- Los **roles** son listas de permisos (`ventas.facturar`, `tesoreria.pagar`, …). Hay roles de sistema y cada empresa puede crear los suyos.
- Contraseñas con **scrypt** (viene con Node).
- Sesiones guardadas en la base: la cookie lleva un token aleatorio y la base guarda solo su hash SHA-256. Cerrar sesión, o cerrar todas las sesiones, es borrar filas.

### 4. Dinero y cantidades

- `numeric` en la base y `decimal.js` en el código. **Nunca `number` para dinero.**
- Escalas: importes `numeric(18,2)`, precios y cantidades `numeric(18,4)`, cotizaciones `numeric(18,6)`.
- Cada comprobante guarda su moneda y la cotización de su fecha.

### 5. Comprobantes

- Una vez emitido, un comprobante **no se modifica**: se anula o se corrige con otro comprobante (nota de crédito o débito).
- La numeración usa un contador por punto de venta y tipo, con bloqueo de fila (`SELECT … FOR UPDATE`). No se calcula con "último + 1".
- Con factura electrónica, primero se obtiene el CAE y después se genera el PDF, que se puede regenerar todas las veces que haga falta.
- Los impuestos de cada comprobante son **renglones** (alícuota, base e importe), no columnas fijas.

### 6. Saldos

- Los saldos de cuentas corrientes, stock y fondos **se calculan a partir de los movimientos**.
- Si por rendimiento hace falta un saldo guardado, se recalcula en la misma transacción que el movimiento y una prueba verifica que coincida.

### 7. Auditoría

- `auditoria` es **solo de agregado**: el rol de la aplicación no puede modificar ni borrar filas.
- Registra usuario, fecha, acción, entidad y los datos antes y después.

### 8. Catálogos fiscales

- Condiciones de IVA, tipos de documento, alícuotas, tipos de comprobante, monedas y jurisdicciones son **datos globales con los códigos de ARCA**. No se escriben en el código.
- Las alícuotas y escalas que cambian (retenciones, percepciones) tienen vigencia por fecha.

### 9. Planes, aplicaciones y suscripción

- El catálogo está en `src/lib/planes.ts` y es la única fuente de verdad: lo usan la sesión, el menú, la página de precios y el panel de la plataforma.
- Un **plan** (Gratis, Inicial, Pyme, Empresa) habilita **funciones** (grupos de pantallas: facturación, ventas, stock, compras, tesorería, informes, roles a medida, API) y fija **límites** (usuarios, comprobantes con CAE por mes, puntos de venta).
- Las **aplicaciones** se contratan aparte sobre un plan pago. La primera es **contratos y parque instalado**; le sigue la tienda online con MercadoLibre.
- Cada empresa tiene una fila en `suscripciones`, con plan, estado, aplicaciones, usuarios adicionales, fechas y precio acordado. Su historial (altas, cambios, pagos y pedidos) queda en `eventos_suscripcion`.
- **Permisos efectivos = permisos del rol ∩ lo que habilita la suscripción.** Se calculan una sola vez, al leer la sesión. Por eso `tienePermiso` y `enLaEmpresa` no necesitan saber nada de planes.
- Cada sección tiene un `layout.tsx` que llama a `exigirFuncion`. Lo que el plan no incluye se ve en el menú con un candado y lleva a Configuración › Suscripción.
- **Prueba vencida, impaga después de los días de gracia, suspendida o cancelada:** la empresa queda en **solo lectura**. Se conservan los permisos `*.ver` y `empresa.suscripcion`, y nunca se borran datos.
- **Límites:** se controlan al invitar usuarios, al pedir un CAE y al dar de alta un punto de venta electrónico (`controlarLimite`).
- **Alta:** `/registro` crea la cuenta, la empresa y 15 días de prueba del plan Inicial más la aplicación de su rubro (`DIAS_DE_PRUEBA` y `PLAN_DE_PRUEBA` en `src/lib/planes.ts`). Quien ya tiene cuenta crea otra empresa desde "Elegir empresa".
- **Cambios de plan:**
  - Al plan gratis: en el momento, y se cancela el débito de Mercado Pago si había.
  - Con débito automático activo y el mismo ciclo: se actualiza el importe del débito en Mercado Pago y se aplica en el
    momento (`cambiarImporteDebito` en `plataforma/debito.ts`).
  - En la prueba (que es siempre del plan Inicial), pagando por transferencia o cambiando de ciclo: queda como pedido y
    se aplica con el primer pago que lo cubre (débito de Mercado Pago) o cuando la plataforma lo confirma.
  - Un débito nuevo cancela antes el anterior (si no, un cobro del viejo no se podría registrar).
- **Cobro:** débito automático de Mercado Pago (preapproval sin plan): `crearDebito` → la persona autoriza en Mercado
  Pago → cada cobro avisa a `/api/pagos/mercadopago` → `registrarPago` corre `pagado_hasta` y deja pendiente la factura
  de Vektra (`facturas_suscripcion`). Baja: `plataforma/baja.ts` (cancela el débito, consulta desde el fin del período).
- **Consola de la plataforma:** `/plataforma`, solo para usuarios con `admin_plataforma`. Tiene menú lateral con estas secciones:
  - **Resumen:** ingreso mensual recurrente, conversión de la prueba, cobrado y altas por mes, y vencimientos de la semana.
  - **Empresas:** buscador y ficha de cada una. La ficha tiene suscripción, pagos, notas internas, suspender o reactivar, extender la prueba, dar de baja, usuarios, invitaciones y últimos ingresos.
  - **Pedidos y consultas.**
  - **Usuarios:** activar, desactivar y cerrar sesiones.
  - **Operación:** tarea periódica, copias, restauración, correo saliente por empresa y errores.
  - **Auditoría.**

  El código está en `src/modulos/plataforma/consola.ts`. Todo lo que hace quien administra queda en `auditoria_plataforma`. La aplicación no puede dar ni quitar `admin_plataforma`: eso se hace con `scripts/admin-plataforma.mjs` (ver `drizzle/0055_endurecimiento.sql`).

- **Acceso de soporte:** desde la ficha de una empresa, quien administra puede entrar a verla sin ser miembro.
  - Es de solo lectura: solo tiene los permisos `.ver` que habilita el plan.
  - Dura una hora (`sesiones.soporte_hasta`) y se ve un aviso arriba mientras está abierto.
  - Queda registrado en la auditoría de la empresa (entidad `soporte`) y en la de la plataforma.
  - Fuera de ese acceso, la consola no lee datos de negocio: de adentro de cada empresa solo cuenta correos e ingresos.

### 10. Importación desde planillas

- `/configuracion/importar` (`src/modulos/importacion/planillas.ts`): clientes y proveedores, artículos (con precio de la
  lista general y stock inicial) y saldos iniciales de cuentas corrientes, desde xlsx o CSV (`lib/planillaSubida.ts`:
  hasta 5 MB y 2.000 filas). Las columnas se reconocen por nombre, sin importar mayúsculas ni acentos.
- Dos pasos: leer muestra altas, actualizaciones y errores por fila sin guardar; importar vuelve a validar todo en el
  servidor. Cada fila va con su propio punto de guardado: una que falla no frena al resto.
- Terceros por CUIT/DNI o código y artículos por código: reimportar actualiza, no duplica. Los saldos entran como
  comprobante tipo 0, letra X, `origen = 'planilla'` (en `comprobantes` o `compras`), uno por tercero; no van al Libro
  IVA ni a la contabilidad.

### 11. Integraciones

- API propia, con tokens por empresa. La tienda online de KOMSA es la primera integración: consulta stock y precios y manda pedidos como lo haría la de cualquier cliente.
- Se planean conectores con ARCA (WSAA y WSFEv1), MercadoLibre, Mercado Pago, MPS Monitor y bancos, cada uno en su etapa.

### 12. Secretos de cada empresa

- El certificado de ARCA, las claves de APIs y otros secretos de cada empresa se guardan **cifrados** con una clave maestra que vive fuera de la base, en una variable de entorno o un gestor de secretos.

### 13. Idioma

- Interfaz y dominio en español: tablas, columnas y funciones usan los términos del negocio (`comprobantes`, `terceros`, `punto_venta`).
- Lo técnico genérico queda en inglés cuando es la convención de la herramienta.
