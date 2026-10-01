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

### 9. Módulos
- **Núcleo:** maestros, ventas, compras, stock, tesorería e impuestos.
- **Módulos opcionales**, que cada empresa activa según su plan. El primero es **parque instalado y contratos** (equipos con contador, facturación por copias), que necesita KOMSA y sirve a cualquier empresa de impresión o alquiler.

### 10. Integraciones
- API propia, con tokens por empresa. La tienda online de KOMSA es la primera integración: consulta stock y precios y manda pedidos como lo haría la de cualquier cliente.
- Se planean conectores con ARCA (WSAA y WSFEv1), MercadoLibre, Mercado Pago, MPS Monitor y bancos, cada uno en su etapa.

### 11. Secretos de cada empresa
- El certificado de ARCA, las claves de APIs y otros secretos de cada empresa se guardan **cifrados** con una clave maestra que vive fuera de la base, en una variable de entorno o un gestor de secretos.

### 12. Idioma
- Interfaz y dominio en español: tablas, columnas y funciones usan los términos del negocio (`comprobantes`, `terceros`, `punto_venta`).
- Lo técnico genérico queda en inglés cuando es la convención de la herramienta.
