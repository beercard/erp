# Facturación automática

Todo lo que se factura sin que alguien arme la factura a mano. Los cuatro
caminos terminan igual: borrador → CAE de ARCA → email al cliente con el
enlace público firmado (`/comprobante/<token>`, vale un año).

Código: `src/modulos/facturacion/automatica.ts` (recurrentes, lotes, alta de
clientes por documento, autorizar y mandar), `externa.ts` (formato de la API
y lectura de planillas) y `src/modulos/plataforma/facturasSuscripcion.ts`.

## 1. Facturas recurrentes (abonos)

Facturación → Facturas recurrentes. Cliente, renglones, frecuencia (1, 2, 3,
6 o 12 meses), próxima fecha (día 1 a 28), fin opcional, punto de venta,
concepto y días para pagar. `{periodo}` en la descripción o las observaciones
se reemplaza por el mes facturado ("Abono octubre 2026").

La tarea periódica (desde las 7) arma las que vencieron: bloquea la fila,
guarda el borrador y corre la próxima fecha en la misma transacción (la misma
vuelta no se factura dos veces aunque ARCA falle después). Después autoriza y
manda por email, si así se eligió. Los errores quedan en la recurrente y la
factura, en borrador.

## 2. Facturación masiva desde una planilla

Facturación → Facturación masiva. Se sube un .xlsx o .csv (hay planilla modelo),
se revisa lo leído y se arma un lote (hasta 500 facturas). Columnas: `factura`
(mismo valor = misma factura), `cuit`/`dni`, `razon_social`, `condicion_iva`,
`email`, `concepto`, `descripcion`, `cantidad`, `precio` (sin IVA; acepta
1.234,56), `iva`, `descuento`, `referencia`, `fecha`, `desde`, `hasta`,
`vencimiento`. Clientes nuevos se dan de alta (con el padrón de ARCA si falta
el nombre). El lote se autoriza de a tandas desde la pantalla y, si se cierra
la página, lo sigue la tarea periódica.

## 3. API

- `POST /api/v1/facturas`: `{ referencia?, cliente: { documento, razonSocial?,
  condicionIva?, email? }, concepto?, renglones: [{ descripcion, cantidad,
  precioUnitario, iva?, descuento? }], autorizar?, enviar? }`. 201 con CAE,
  número y enlace; 422 si quedó en borrador (con el motivo).
- `referencia` es la clave de idempotencia: repetir el pedido devuelve la
  misma factura (200).
- `GET /api/v1/facturas`, `GET /api/v1/facturas/<id>`, `POST /api/v1/lotes`,
  `GET /api/v1/lotes/<id>`.

## 4. Vektra se factura sola

Con `VEKTRA_EMPRESA_ID`, cada pago registrado de una suscripción deja una fila
en `facturas_suscripcion` (misma transacción que el pago). La tarea periódica
emite la factura desde la empresa de Vektra (servicios, período pagado, neto =
importe / 1,21) y la manda al dueño de la suscriptora. Hasta 5 intentos; en la
consola, ficha de la empresa → "Facturas de Vektra", se ven y se reintentan.
